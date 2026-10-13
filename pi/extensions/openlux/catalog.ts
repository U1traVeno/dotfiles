/**
 * OpenLux model catalog.
 *
 * OpenLux (https://api.openlux.ai) is a new-api style relay that speaks the
 * native Gemini protocol at the site root: `GET /v1alpha/models` lists the
 * Gemini models callable through `POST /v1alpha/models/{model}:generateContent`.
 * Only Gemini ids are valid on that endpoint; the relay rejects OpenAI and
 * Anthropic ids there, so those families are declared in CURATED_MODELS with
 * their own `api` and `baseUrl` rather than being served natively.
 * Unlike the Qiniu marketplace page, this endpoint requires authentication
 * (`x-goog-api-key`), so `fetchOpenluxCatalog` takes the provider API key
 * resolved by index.ts.
 *
 * OpenLux does not document the list response, so the parser accepts both a
 * Gemini-style envelope (`{ models: [{ name: "models/<id>", ... }] }`) and an
 * OpenAI-style one (`{ data: [{ id }] }`), reads declared metadata when
 * present, and falls back to per-id heuristics otherwise. A shape change
 * degrades to "fewer models with default metadata" rather than a startup
 * failure.
 *
 * Pricing is intentionally all zeros: the relay bills in CNY with per-group
 * multipliers that do not map onto pi's USD-per-million cost fields.
 */

export const OPENLUX_PROVIDER_ID = "openlux";
export const OPENLUX_PROVIDER_NAME = "OpenLux";
export const OPENLUX_BASE_URL = "https://api.openlux.ai/v1alpha";
export const OPENLUX_CATALOG_URL = "https://api.openlux.ai/v1alpha/models";

const DEFAULT_CONTEXT_WINDOW = 128_000;
const LARGE_CONTEXT_WINDOW = 1_048_576;
const MAX_TOKENS_FLOOR = 16_384;
const MAX_TOKENS_CEILING = 131_072;
const SIXTY_FOUR_K_OUTPUT_CEILING = 65_536;

/**
 * Models that share the catalog but are not text chat models: embeddings,
 * image/video/audio generation, live sessions and similar. Matched against the
 * model id only.
 */
const NON_CHAT_PATTERN =
  /embedding|embedcontent|imagen|(^|[^a-z])aqa([^a-z]|$)|(^|[^a-z])tts([^a-z]|$)|(^|[^a-z])live([^a-z]|$)|image|native-audio|speech|whisper|(^|[^a-z])veo([^a-z]|$)|sora|kling|luma|runway|vidu|seedance|jimeng|midjourney|(^|[^a-z])mj([^a-z]|$)|flux|ideogram|dall/i;

/** Gemini 2.x/3.x chat models expose thinking; everything else defaults off. */
const REASONING_PATTERN = /gemini-(?:2\.5|3)|(^|[^a-z])thinking([^a-z]|$)/i;

/** Known families with a 1M-token window; the rest get a conservative 128k. */
const LARGE_CONTEXT_PATTERN = /gemini-(?:1\.5|2|3)/i;

/** Families whose real output cap is 64k tokens. */
const SIXTY_FOUR_K_OUTPUT_PATTERN = /gemini-(?:2\.5|3)/i;

/**
 * new-api fills auto-generated entries (description "Advanced AI model: <id>")
 * with this default limit pair instead of the model's real values, so the
 * pair means "no data", not "small model".
 */
const PLACEHOLDER_INPUT_LIMIT = 8_192;
const PLACEHOLDER_OUTPUT_LIMIT = 4_096;

/** Multimodal Gemini chat families. */
const IMAGE_INPUT_PATTERN = /gemini-(?:1\.5|2\.5|3)/i;

/**
 * Frontier OpenAI and Anthropic models offered through the relay.
 *
 * The Gemini heuristics above cannot infer these families, but the decisive
 * problem is protocol: the relay does not serve them on the Gemini-native
 * endpoint at all. A request for `claude-sonnet-5-5` against /v1alpha is
 * rejected with "not a valid Gemini model for Gemini native API format". Each
 * family therefore carries its own wire protocol and base path, per the
 * relay's own tutorials (Claude Code uses the site root; Gemini CLI uses the
 * native path; GPT is served under /v1). Per-model `api`/`baseUrl` override
 * the provider-level Gemini default.
 *
 * Limits and modalities come from pi-ai's bundled provider data (openai.json /
 * anthropic.json). Costs stay zero like every other entry.
 */
const OPENLUX_ANTHROPIC_BASE_URL = "https://api.openlux.ai";
const OPENLUX_OPENAI_BASE_URL = "https://api.openlux.ai/v1";

export interface CuratedModelMetadata {
  name: string;
  /** Protocol this family speaks on the relay; overrides the provider default. */
  api: "anthropic-messages" | "openai-completions";
  baseUrl: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
}

export const CURATED_MODELS: Readonly<Record<string, CuratedModelMetadata>> = {
  "gpt-6-astra": {
    name: "GPT-6 Astra",
    api: "openai-completions",
    baseUrl: OPENLUX_OPENAI_BASE_URL,
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 272_000,
    maxTokens: 128_000,
  },
  "gpt-6.1-sol": {
    name: "GPT-6.1 Sol",
    api: "openai-completions",
    baseUrl: OPENLUX_OPENAI_BASE_URL,
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 272_000,
    maxTokens: 128_000,
  },
  "claude-opus-5-5": {
    name: "Claude Opus 5.5",
    api: "anthropic-messages",
    baseUrl: OPENLUX_ANTHROPIC_BASE_URL,
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  "claude-fable-5-1": {
    name: "Claude Fable 5.1",
    api: "anthropic-messages",
    baseUrl: OPENLUX_ANTHROPIC_BASE_URL,
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  "claude-sonnet-5-5": {
    name: "Claude Sonnet 5.5",
    api: "anthropic-messages",
    baseUrl: OPENLUX_ANTHROPIC_BASE_URL,
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  "claude-haiku-5-5": {
    name: "Claude Haiku 5.5",
    api: "anthropic-messages",
    baseUrl: OPENLUX_ANTHROPIC_BASE_URL,
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
};

function curatedFor(id: string): CuratedModelMetadata | undefined {
  return Object.hasOwn(CURATED_MODELS, id) ? CURATED_MODELS[id] : undefined;
}

export interface OpenluxModel {
  id: string;
  name: string;
  /**
   * Per-model protocol and base path. Gemini models leave these unset and
   * inherit the provider-level google-generative-ai endpoint; curated
   * OpenAI/Anthropic families must override both, because the relay rejects
   * them on the Gemini-native path.
   */
  api?: string;
  baseUrl?: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function pickString(entry: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/** Accept either a Gemini-style or an OpenAI-style list envelope. */
export function selectCatalogEntries(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) return [];
  const list = Array.isArray(payload.models)
    ? payload.models
    : Array.isArray(payload.data)
      ? payload.data
      : undefined;
  if (list === undefined) return [];
  return list.filter(isRecord);
}

/**
 * Derive the model id. Gemini-style entries carry `name: "models/<id>"` (the
 * `models/` prefix belongs to the URL path, not the id pi sends); OpenAI-style
 * entries carry `id`. Entries with a `:` action suffix are not plain models.
 */
export function catalogEntryId(entry: Record<string, unknown>): string | undefined {
  const raw = pickString(entry, ["name", "id"]);
  if (raw === undefined) return undefined;
  const id = raw.replace(/^models\//, "");
  if (id.length === 0 || id.includes(":") || id.includes("/")) return undefined;
  return id;
}

/**
 * Qiniu-style output cap: a declared cap at or above the context window is an
 * upper bound on the request, not a usable output limit, so derive a safe
 * value instead of reserving no room for the prompt.
 */
export function resolveMaxTokens(
  declaredOutput: number | undefined,
  contextWindow: number,
  ceiling: number,
): number {
  if (declaredOutput !== undefined && declaredOutput < contextWindow) return declaredOutput;
  const derived = Math.floor(contextWindow / 8);
  return Math.min(ceiling, Math.max(MAX_TOKENS_FLOOR, derived));
}

/** Map one catalog entry, or undefined when it is not a text chat model. */
export function mapCatalogEntry(entry: Record<string, unknown>): OpenluxModel | undefined {
  const id = catalogEntryId(entry);
  if (id === undefined) return undefined;

  // Google-style entries declare their capabilities; when present, require
  // generateContent support so embeddings-only or live-only models drop out.
  const methods = entry.supportedGenerationMethods ?? entry.supported_generation_methods;
  if (Array.isArray(methods) && methods.length > 0 && !methods.includes("generateContent")) {
    return undefined;
  }

  if (NON_CHAT_PATTERN.test(id)) return undefined;

  // Auto-generated relay entries carry the placeholder limit pair; ignore
  // both limits so the family heuristics below supply real values.
  const placeholderLimits =
    entry.inputTokenLimit === PLACEHOLDER_INPUT_LIMIT &&
    entry.outputTokenLimit === PLACEHOLDER_OUTPUT_LIMIT;

  const contextWindow = placeholderLimits
    ? undefined
    : positiveNumber(entry.inputTokenLimit) ??
      positiveNumber(entry.input_token_limit) ??
      positiveNumber(entry.context_length) ??
      positiveNumber(entry.context_window);
  const resolvedContext =
    contextWindow ??
    (LARGE_CONTEXT_PATTERN.test(id) ? LARGE_CONTEXT_WINDOW : DEFAULT_CONTEXT_WINDOW);

  const input: ("text" | "image")[] = IMAGE_INPUT_PATTERN.test(id) ? ["text", "image"] : ["text"];

  return {
    id,
    name: pickString(entry, ["displayName", "display_name"]) ?? id,
    reasoning: entry.thinking === true || REASONING_PATTERN.test(id),
    input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: resolvedContext,
    maxTokens: resolveMaxTokens(
      placeholderLimits
        ? undefined
        : positiveNumber(entry.outputTokenLimit) ??
          positiveNumber(entry.output_token_limit) ??
          positiveNumber(entry.max_output_tokens) ??
          positiveNumber(entry.max_tokens),
      resolvedContext,
      SIXTY_FOUR_K_OUTPUT_PATTERN.test(id) ? SIXTY_FOUR_K_OUTPUT_CEILING : MAX_TOKENS_CEILING,
    ),
  };
}

/** Build the deduplicated, id-sorted chat model list from a parsed payload. */
export function buildCatalog(payload: unknown): OpenluxModel[] {
  const byId = new Map<string, OpenluxModel>();
  for (const entry of selectCatalogEntries(payload)) {
    const model = mapCatalogEntry(entry);
    if (model && !byId.has(model.id)) byId.set(model.id, model);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Overlay curated metadata on relay-derived models and append curated entries
 * the relay did not list. Applied when models are handed to pi, never to the
 * cache, so the cache keeps the relay's own answer and `fetchOpenluxCatalog`'s
 * empty-list check still detects a relay that serves nothing.
 */
export function withCuratedModels(models: readonly OpenluxModel[]): OpenluxModel[] {
  const byId = new Map<string, OpenluxModel>();
  for (const model of models) {
    const curated = curatedFor(model.id);
    byId.set(model.id, curated ? { ...model, ...curated } : model);
  }
  for (const [id, curated] of Object.entries(CURATED_MODELS)) {
    if (!byId.has(id)) {
      byId.set(id, { id, ...curated, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchOpenluxCatalog(
  apiKey: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<OpenluxModel[]> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(OPENLUX_CATALOG_URL, {
    headers: { accept: "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.any([signal, timeout]),
  });
  if (!response.ok) {
    throw new Error(`OpenLux catalog request failed: ${response.status}`);
  }
  const models = buildCatalog(await response.json());
  if (models.length === 0) {
    throw new Error("OpenLux catalog returned no chat models");
  }
  return models;
}
