/**
 * Qiniu AI inference catalog.
 *
 * Qiniu publishes three sources and none alone is sufficient:
 *
 *   - `https://api.qnaigc.com/v1/models` is the stable OpenAI-compatible list.
 *     It is authoritative for availability and declares context and output
 *     limits, but carries no name, modalities, reasoning support or pricing.
 *   - The model marketplace page embeds a Next.js `__NEXT_DATA__` payload that
 *     additionally carries reasoning support, input modalities and per-item
 *     pricing.
 *   - A per-model marketplace page (`/ai/model/<id>`) embeds a single entry in
 *     the same shape as a list entry, metadata included.
 *
 * The marketplace list page is a pre-rendered snapshot published to object
 * storage, so a model that launched today can be callable and fully described
 * while still missing from that snapshot. Every model the availability list
 * knows and the snapshot does not is therefore backfilled from its own page,
 * falling back to the availability list's declared limits.
 *
 * The marketplace payloads are internal page props, not a documented API, so
 * every field is read defensively and a shape change degrades to "fewer models
 * with weaker metadata" rather than a startup failure.
 *
 * Qiniu relays DeepSeek's own API, so DeepSeek models have to be addressed the
 * way DeepSeek documents; see `modelCompat`.
 */

export const QINIU_PROVIDER_ID = "qiniu";
export const QINIU_PROVIDER_NAME = "Qiniu";
export const QINIU_BASE_URL = "https://api.qnaigc.com/v1";
export const QINIU_CATALOG_URL = "https://www.qiniu.com/ai/models";
export const QINIU_MODEL_PAGE_URL = "https://www.qiniu.com/ai/model";
export const QINIU_MODEL_LIST_URL = "https://api.qnaigc.com/v1/models";

/** Qiniu quotes USD alongside CNY; pi costs are USD per million tokens. */
const TOKENS_PER_UNIT_TO_MILLION = 1000;

/** Fallback when a model declares no usable output cap. */
const MAX_TOKENS_FLOOR = 16_384;
const MAX_TOKENS_CEILING = 131_072;

/**
 * Ceiling on per-model page fetches during one refresh. Availability normally
 * leads the snapshot by one or two entries, so this is a safety valve against
 * a pathological drift rather than a routine limit.
 */
const MAX_DETAIL_BACKFILLS = 10;

/**
 * Availability and its backfill are best-effort and must never hold the
 * catalog hostage: a slow list endpoint degrades to the snapshot rather than
 * eating the refresh deadline the callers set.
 */
const AVAILABILITY_TIMEOUT_MS = 2_500;

/**
 * Preference order per cost field. Plain keys win; peak beats off-peak so a
 * time-of-day priced model is never under-quoted in the session cost readout.
 */
const COST_KEYS = {
  input: ["ncache", "input", "ncache_peak", "ncache_offpeak"],
  output: ["output", "output_peak", "output_offpeak"],
  cacheRead: ["cache", "cache_peak", "cache_offpeak"],
  cacheWrite: ["c_cache"],
} as const;

export interface QiniuModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  compat: QiniuModelCompat;
}

/** The pi compat switches a Qiniu model may need, all optional but the first. */
export interface QiniuModelCompat {
  supportsDeveloperRole: false;
  supportsStore?: false;
  maxTokensField?: "max_tokens";
  requiresReasoningContentOnAssistantMessages?: true;
  thinkingFormat?: "deepseek";
}

const BASE_COMPAT: QiniuModelCompat = { supportsDeveloperRole: false };

/**
 * DeepSeek documents its own wire format, and Qiniu passes it through:
 *
 *   - the output cap field is `max_tokens`,
 *   - `thinking`/`reasoning_effort` declare thinking mode, which is on by
 *     default,
 *   - and once a request carries `tools`, the `reasoning_content` of every
 *     earlier turn must be sent back or the API answers 400. pi only backfills
 *     that field when the model asks for it, so without this switch a tool
 *     session loses its history to "reasoning_content must be passed back".
 *
 * Only reasoning-capable models are affected: pi checks `model.reasoning`
 * before it emits the thinking fields.
 */
const DEEPSEEK_MODEL_PATTERN = /deepseek/i;
const DEEPSEEK_COMPAT: QiniuModelCompat = {
  ...BASE_COMPAT,
  supportsStore: false,
  maxTokensField: "max_tokens",
  requiresReasoningContentOnAssistantMessages: true,
  thinkingFormat: "deepseek",
};

/** Compat switches for a model, chosen by the upstream protocol it speaks. */
export function modelCompat(id: string): QiniuModelCompat {
  return DEEPSEEK_MODEL_PATTERN.test(id) ? { ...DEEPSEEK_COMPAT } : { ...BASE_COMPAT };
}

/** A model the availability list advertises, with the entry it was read from. */
export interface AvailableModel {
  id: string;
  declared: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Pull the Next.js page payload out of the marketplace HTML. */
export function extractNextData(html: string): unknown {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("Qiniu catalog: __NEXT_DATA__ payload not found");
  return JSON.parse(match[1]) as unknown;
}

/** Locate the model array inside the page payload without trusting its depth. */
export function selectCatalogEntries(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) return [];
  const props = isRecord(payload.props) ? payload.props : undefined;
  const pageProps = props && isRecord(props.pageProps) ? props.pageProps : undefined;
  const models = pageProps?.models;
  if (!Array.isArray(models)) return [];
  return models.filter(isRecord);
}

/** Accept the OpenAI-compatible list envelope that `/v1/models` returns. */
export function selectModelListEntries(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) return [];
  const entries = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : undefined;
  return entries === undefined ? [] : entries.filter(isRecord);
}

/** Read the availability list, keeping each entry for the fallback limits. */
export function parseAvailableModels(payload: unknown): AvailableModel[] {
  const models: AvailableModel[] = [];
  for (const entry of selectModelListEntries(payload)) {
    const id = entry.id;
    if (typeof id === "string" && id.length > 0) models.push({ id, declared: entry });
  }
  return models;
}

/** Pull the single-model entry out of a marketplace model page payload. */
export function selectModelPageEntry(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload)) return undefined;
  const props = isRecord(payload.props) ? payload.props : undefined;
  const pageProps = props && isRecord(props.pageProps) ? props.pageProps : undefined;
  return pageProps && isRecord(pageProps.model) ? pageProps.model : undefined;
}

/**
 * The model id doubles as the path of its marketplace page, so only plain path
 * segments are accepted: an id carrying a query string or a `..` segment must
 * never shape the request.
 */
export function modelPagePath(id: string): string | undefined {
  if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(id)) return undefined;
  if (id.split("/").some((segment) => segment === "." || segment === "..")) return undefined;
  return id;
}

function pickCost(details: Record<string, unknown>, keys: readonly string[]): number {
  for (const key of keys) {
    const item = details[key];
    if (!isRecord(item) || item.unit_name !== "token") continue;
    const usd = item.unit_price_usd;
    if (typeof usd === "number" && Number.isFinite(usd) && usd >= 0) {
      return usd * TOKENS_PER_UNIT_TO_MILLION;
    }
  }
  return 0;
}

function tokenPricingDetails(entry: Record<string, unknown>): Record<string, unknown> | undefined {
  const rules = entry.pricing_rules_v2;
  if (!Array.isArray(rules)) return undefined;
  for (const rule of rules) {
    if (!isRecord(rule)) continue;
    const details = rule.details_v2;
    if (!isRecord(details)) continue;
    const hasTokenItem = Object.values(details).some(
      (item) => isRecord(item) && item.unit_name === "token",
    );
    if (hasTokenItem) return details;
  }
  return undefined;
}

/**
 * Qiniu sometimes reports `max_tokens` equal to the context window, which is an
 * upper bound on the request rather than a usable output cap. Derive a safe
 * value in that case so pi always reserves room for the prompt.
 */
export function resolveMaxTokens(
  constraints: Record<string, unknown>,
  contextWindow: number,
): number {
  const declared =
    positiveNumber(constraints.max_completion_tokens) ?? positiveNumber(constraints.max_tokens);
  if (declared !== undefined && declared < contextWindow) return declared;
  const derived = Math.floor(contextWindow / 8);
  return Math.min(MAX_TOKENS_CEILING, Math.max(MAX_TOKENS_FLOOR, derived));
}

/** Map one marketplace entry, or undefined when it is not a text chat model. */
export function mapCatalogEntry(entry: Record<string, unknown>): QiniuModel | undefined {
  const id = entry.id;
  if (typeof id !== "string" || id.length === 0) return undefined;

  const architecture = isRecord(entry.architecture) ? entry.architecture : {};
  const inputModalities = stringArray(architecture.input_modalities);
  const outputModalities = stringArray(architecture.output_modalities);

  // Image and video generation models share the catalog but are not chat models.
  if (!inputModalities.includes("text") || !outputModalities.includes("text")) return undefined;

  const details = tokenPricingDetails(entry);
  if (!details) return undefined;

  const constraints = isRecord(entry.model_constraints) ? entry.model_constraints : {};
  const contextWindow = positiveNumber(constraints.context_length) ?? 128_000;

  const reasoningFlag = isRecord(architecture.reasoning) ? architecture.reasoning.supported : undefined;
  // Some entries carry an empty architecture block but still advertise thinking
  // through the display features, so accept either signal.
  const reasoning = reasoningFlag === true || stringArray(entry.features).includes("深度思考");

  const input: ("text" | "image")[] = inputModalities.includes("image") ? ["text", "image"] : ["text"];

  return {
    id,
    name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : id,
    reasoning,
    input,
    cost: {
      input: pickCost(details, COST_KEYS.input),
      output: pickCost(details, COST_KEYS.output),
      cacheRead: pickCost(details, COST_KEYS.cacheRead),
      cacheWrite: pickCost(details, COST_KEYS.cacheWrite),
    },
    contextWindow,
    maxTokens: resolveMaxTokens(constraints, contextWindow),
    compat: modelCompat(id),
  };
}

/**
 * Minimal entry for a model the availability list proves callable while the
 * marketplace snapshot has no metadata for it. Limits come from that list;
 * everything the marketplace would supply keeps its conservative default.
 */
export function mapListedModel(entry: Record<string, unknown>): QiniuModel | undefined {
  const id = entry.id;
  if (typeof id !== "string" || id.length === 0) return undefined;
  const contextWindow = positiveNumber(entry.context_length) ?? 128_000;
  return {
    id,
    name: id,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens: resolveMaxTokens(entry, contextWindow),
    compat: modelCompat(id),
  };
}

/** Deduplicate by id, keeping the entry that comes first, then sort by id. */
export function mergeCatalog(...groups: QiniuModel[][]): QiniuModel[] {
  const byId = new Map<string, QiniuModel>();
  for (const group of groups) {
    for (const model of group) {
      if (!byId.has(model.id)) byId.set(model.id, model);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Map marketplace list entries to chat models, deduplicated and id-sorted. */
export function catalogFromEntries(entries: Record<string, unknown>[]): QiniuModel[] {
  const models: QiniuModel[] = [];
  for (const entry of entries) {
    const model = mapCatalogEntry(entry);
    if (model) models.push(model);
  }
  return mergeCatalog(models);
}

/** Build the deduplicated, id-sorted chat model list from marketplace HTML. */
export function buildCatalog(html: string): QiniuModel[] {
  return catalogFromEntries(selectCatalogEntries(extractNextData(html)));
}

/** GET with the extension's headers, rejecting non-2xx responses. */
async function get(url: string, accept: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, {
    headers: { accept, "user-agent": "pi-qiniu-extension" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Qiniu catalog request failed: ${response.status} (${url})`);
  }
  return response;
}

/**
 * Availability is an enhancement, not a requirement: a failure here leaves the
 * marketplace snapshot as the whole catalog, exactly as it was before.
 */
async function fetchAvailableModels(signal: AbortSignal): Promise<AvailableModel[]> {
  try {
    const response = await get(QINIU_MODEL_LIST_URL, "application/json", signal);
    return parseAvailableModels(await response.json());
  } catch {
    return [];
  }
}

/** Read one model's own page, or undefined when it cannot be mapped. */
async function fetchModelPage(id: string, signal: AbortSignal): Promise<QiniuModel | undefined> {
  const path = modelPagePath(id);
  if (path === undefined) return undefined;
  const response = await get(`${QINIU_MODEL_PAGE_URL}/${path}`, "text/html", signal);
  const entry = selectModelPageEntry(extractNextData(await response.text()));
  return entry === undefined ? undefined : mapCatalogEntry(entry);
}

/**
 * Fetch the models the snapshot has not published yet, capped by
 * MAX_DETAIL_BACKFILLS. A page that is missing, unparsable or unpriced falls
 * back to the availability entry, because callability is proven even then.
 */
async function backfillMissingModels(
  available: AvailableModel[],
  listed: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<QiniuModel[]> {
  const missing = available.filter((model) => !listed.has(model.id)).slice(0, MAX_DETAIL_BACKFILLS);
  const models: QiniuModel[] = [];
  for (const model of missing) {
    if (signal.aborted) break;
    let mapped: QiniuModel | undefined;
    try {
      mapped = await fetchModelPage(model.id, signal);
    } catch {
      // The fallback below still registers the model as callable.
    }
    const resolved = mapped ?? mapListedModel(model.declared);
    if (resolved !== undefined) models.push(resolved);
  }
  return models;
}

export async function fetchQiniuCatalog(
  signal: AbortSignal,
  timeoutMs: number,
): Promise<QiniuModel[]> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const deadline = AbortSignal.any([signal, timeout]);
  const availability = AbortSignal.any([deadline, AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS)]);
  const [html, available] = await Promise.all([
    get(QINIU_CATALOG_URL, "text/html", deadline).then((response) => response.text()),
    fetchAvailableModels(availability),
  ]);

  const entries = selectCatalogEntries(extractNextData(html));
  const models = catalogFromEntries(entries);
  if (models.length === 0) {
    throw new Error("Qiniu catalog returned no chat models");
  }

  // Only ids the snapshot omits entirely are backfilled: an entry the snapshot
  // lists but the catalog rejects (a media model, or one without token
  // pricing) was dropped on purpose and must not come back with cost 0.
  const listed = new Set(
    entries.map((entry) => entry.id).filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  return mergeCatalog(models, await backfillMissingModels(available, listed, deadline));
}
