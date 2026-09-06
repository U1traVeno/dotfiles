/**
 * Qiniu AI inference catalog.
 *
 * Qiniu publishes two sources and neither alone is sufficient:
 *
 *   - `https://api.qnaigc.com/v1/models` is the stable OpenAI-compatible list,
 *     but it carries only id/context_length/max_tokens.
 *   - The model marketplace page embeds a Next.js `__NEXT_DATA__` payload that
 *     additionally carries reasoning support, input modalities and per-item
 *     pricing.
 *
 * The marketplace payload is an internal page prop, not a documented API, so
 * every field is read defensively and a shape change degrades to "fewer models
 * with weaker metadata" rather than a startup failure.
 */

export const QINIU_PROVIDER_ID = "qiniu";
export const QINIU_PROVIDER_NAME = "Qiniu";
export const QINIU_BASE_URL = "https://api.qnaigc.com/v1";
export const QINIU_CATALOG_URL = "https://www.qiniu.com/ai/models";

/** Qiniu quotes USD alongside CNY; pi costs are USD per million tokens. */
const TOKENS_PER_UNIT_TO_MILLION = 1000;

/** Fallback when a model declares no usable output cap. */
const MAX_TOKENS_FLOOR = 16_384;
const MAX_TOKENS_CEILING = 131_072;

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
  compat: { supportsDeveloperRole: false };
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
    compat: { supportsDeveloperRole: false },
  };
}

/** Build the deduplicated, id-sorted chat model list from marketplace HTML. */
export function buildCatalog(html: string): QiniuModel[] {
  const entries = selectCatalogEntries(extractNextData(html));
  const byId = new Map<string, QiniuModel>();
  for (const entry of entries) {
    const model = mapCatalogEntry(entry);
    if (model && !byId.has(model.id)) byId.set(model.id, model);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchQiniuCatalog(
  signal: AbortSignal,
  timeoutMs: number,
): Promise<QiniuModel[]> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(QINIU_CATALOG_URL, {
    headers: { accept: "text/html", "user-agent": "pi-qiniu-extension" },
    signal: AbortSignal.any([signal, timeout]),
  });
  if (!response.ok) {
    throw new Error(`Qiniu catalog request failed: ${response.status}`);
  }
  const models = buildCatalog(await response.text());
  if (models.length === 0) {
    throw new Error("Qiniu catalog returned no chat models");
  }
  return models;
}
