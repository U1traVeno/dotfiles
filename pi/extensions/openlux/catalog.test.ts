import assert from "node:assert/strict";
import test from "node:test";

import {
  CURATED_MODELS,
  buildCatalog,
  catalogEntryId,
  mapCatalogEntry,
  resolveMaxTokens,
  selectCatalogEntries,
  withCuratedModels,
} from "./catalog.ts";

function geminiEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "models/gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    inputTokenLimit: 1_048_576,
    outputTokenLimit: 65_536,
    supportedGenerationMethods: ["generateContent", "countTokens"],
    ...overrides,
  };
}

test("selectCatalogEntries accepts a Gemini-style models envelope", () => {
  const entries = selectCatalogEntries({ models: [geminiEntry()] });
  assert.equal(entries.length, 1);
});

test("selectCatalogEntries accepts an OpenAI-style data envelope", () => {
  const entries = selectCatalogEntries({ data: [{ id: "gpt-5" }] });
  assert.equal(entries.length, 1);
});

test("selectCatalogEntries rejects other shapes", () => {
  assert.deepEqual(selectCatalogEntries(null), []);
  assert.deepEqual(selectCatalogEntries({}), []);
  assert.deepEqual(selectCatalogEntries({ models: "nope" }), []);
});

test("catalogEntryId strips the models/ path prefix", () => {
  assert.equal(catalogEntryId(geminiEntry()), "gemini-2.5-pro");
});

test("catalogEntryId reads OpenAI-style ids", () => {
  assert.equal(catalogEntryId({ id: "gpt-5" }), "gpt-5");
});

test("catalogEntryId rejects action-suffixed and nested names", () => {
  assert.equal(catalogEntryId({ name: "models/gemini-2.5-pro:generateContent" }), undefined);
  assert.equal(catalogEntryId({ name: "v1beta/models/x" }), undefined);
  assert.equal(catalogEntryId({}), undefined);
});

test("mapCatalogEntry prefers declared metadata", () => {
  const model = mapCatalogEntry(geminiEntry());
  assert.ok(model);
  assert.equal(model.id, "gemini-2.5-pro");
  assert.equal(model.name, "Gemini 2.5 Pro");
  assert.equal(model.contextWindow, 1_048_576);
  assert.equal(model.maxTokens, 65_536);
  assert.equal(model.reasoning, true);
  assert.deepEqual(model.input, ["text", "image"]);
  assert.deepEqual(model.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
});

test("mapCatalogEntry honors a declared thinking flag", () => {
  const model = mapCatalogEntry({ id: "some-model", thinking: true });
  assert.ok(model);
  assert.equal(model.reasoning, true);
});

test("mapCatalogEntry ignores the new-api placeholder limit pair", () => {
  // Auto-generated relay entries declare 8192/4096 regardless of the real
  // model limits; the family heuristics must supply the real values.
  const model = mapCatalogEntry(
    geminiEntry({ name: "models/gemini-3.8-flash", inputTokenLimit: 8_192, outputTokenLimit: 4_096 }),
  );
  assert.ok(model);
  assert.equal(model.contextWindow, 1_048_576);
  assert.equal(model.maxTokens, 65_536);
});

test("mapCatalogEntry falls back to id heuristics", () => {
  const model = mapCatalogEntry({ id: "gemini-3-pro-preview" });
  assert.ok(model);
  assert.equal(model.name, "gemini-3-pro-preview");
  assert.equal(model.contextWindow, 1_048_576);
  assert.equal(model.reasoning, true);
  assert.deepEqual(model.input, ["text", "image"]);
});

test("mapCatalogEntry keeps unknown families conservative", () => {
  const model = mapCatalogEntry({ id: "gpt-5" });
  assert.ok(model);
  assert.equal(model.contextWindow, 128_000);
  assert.equal(model.reasoning, false);
  assert.deepEqual(model.input, ["text"]);
});

test("mapCatalogEntry drops non-chat models", () => {
  assert.equal(mapCatalogEntry(geminiEntry({ name: "models/gemini-embedding-001" })), undefined);
  assert.equal(mapCatalogEntry(geminiEntry({ name: "models/gemini-2.5-pro-preview-tts" })), undefined);
  assert.equal(mapCatalogEntry(geminiEntry({ name: "models/gemini-2.5-flash-image" })), undefined);
  assert.equal(mapCatalogEntry(geminiEntry({ name: "models/imagen-4.0-generate-001" })), undefined);
});

test("mapCatalogEntry honors supportedGenerationMethods", () => {
  assert.equal(mapCatalogEntry(geminiEntry({ supportedGenerationMethods: ["embedContent"] })), undefined);
  assert.ok(mapCatalogEntry(geminiEntry({ supportedGenerationMethods: ["generateContent"] })));
});

test("resolveMaxTokens derives a cap when the declaration is not usable", () => {
  assert.equal(resolveMaxTokens(1_048_576, 1_048_576, 131_072), 131_072);
  assert.equal(resolveMaxTokens(65_536, 1_048_576, 131_072), 65_536);
  assert.equal(resolveMaxTokens(undefined, 1_048_576, 65_536), 65_536);
});

test("buildCatalog deduplicates and sorts", () => {
  const models = buildCatalog({
    models: [
      geminiEntry(),
      geminiEntry(),
      { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
    ],
  });
  assert.deepEqual(
    models.map((model) => model.id),
    ["gemini-2.5-flash", "gemini-2.5-pro"],
  );
});

test("withCuratedModels appends curated frontier models", () => {
  const models = withCuratedModels(buildCatalog({ models: [geminiEntry()] }));
  const curated = models.filter((model) => Object.hasOwn(CURATED_MODELS, model.id));
  // The relay only serves one Gemini model here, yet every curated model is
  // offered so the frontier supply does not wait on the relay's list.
  assert.deepEqual(
    curated.map((model) => model.id),
    Object.keys(CURATED_MODELS).sort(),
  );
  assert.deepEqual(models.map((model) => model.id), [...models.map((model) => model.id)].sort());
});

test("withCuratedModels overrides heuristic metadata for a listed model", () => {
  // A relay entry with placeholder limits, the shape the relay publishes for
  // non-Gemini families. The curated values must win over the heuristic
  // defaults (128k window, 16k output, no reasoning, text only).
  const relay = mapCatalogEntry(
    geminiEntry({ name: "models/gpt-6-astra", inputTokenLimit: 8_192, outputTokenLimit: 4_096 }),
  );
  if (!relay) throw new Error("expected a mapped relay entry");
  const model = withCuratedModels([relay]).find((m) => m.id === "gpt-6-astra");
  if (!model) throw new Error("gpt-6-astra missing from the merged catalog");
  assert.deepEqual(
    model,
    {
      id: "gpt-6-astra",
      ...CURATED_MODELS["gpt-6-astra"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
  );
});

test("withCuratedModels leaves unrelated models untouched", () => {
  const models = withCuratedModels(buildCatalog({ models: [geminiEntry()] }));
  const gemini = models.find((model) => model.id === "gemini-2.5-pro");
  if (!gemini) throw new Error("gemini-2.5-pro missing");
  assert.equal(gemini.name, "Gemini 2.5 Pro");
  assert.equal(gemini.contextWindow, 1_048_576);
});

test("withCuratedModels tolerates a non-curated Gemini model", () => {
  const gemini = mapCatalogEntry(geminiEntry({ name: "models/gemini-3.8-flash" }));
  if (!gemini) throw new Error("expected a mapped Gemini entry");
  const models = withCuratedModels([gemini]);
  assert.equal(models.find((model) => model.id === "gemini-3.8-flash")?.id, "gemini-3.8-flash");
});

test("every curated model survives the non-chat pattern", () => {
  for (const id of Object.keys(CURATED_MODELS)) {
    // Without the overlay an OpenAI-style entry maps to heuristic defaults
    // instead of being dropped as an embeddings/live/image model.
    assert.ok(mapCatalogEntry({ id }), `${id} must not be dropped as non-chat`);
  }
});

test("curated frontier families are not mistaken for Gemini", () => {
  // A curated OpenAI/Anthropic id must never inherit the Gemini-only image
  // or large-context treatment.
  const models = withCuratedModels([]);
  assert.deepEqual(models.map((model) => model.id), Object.keys(CURATED_MODELS).sort());
  for (const model of models) {
    assert.equal(model.contextWindow, CURATED_MODELS[model.id].contextWindow);
    assert.equal(model.input.length, 2);
  }
});

test("withCuratedModels hands out the curated entry when the relay omits it", () => {
  const [model] = withCuratedModels([]).filter((m) => m.id === "gpt-6.1-sol");
  assert.ok(model);
  assert.equal(model.name, "GPT-6.1 Sol");
  assert.deepEqual(
    { contextWindow: model.contextWindow, maxTokens: model.maxTokens, reasoning: model.reasoning },
    { contextWindow: 272_000, maxTokens: 128_000, reasoning: true },
  );
});

test("curated families carry the protocol and base path the relay serves them on", () => {
  const models = withCuratedModels([]);
  for (const [id, meta] of Object.entries(CURATED_MODELS)) {
    const model = models.find((m) => m.id === id);
    if (!model) throw new Error(`${id} missing from the curated supply`);
    assert.equal(model.api, meta.api);
    assert.equal(model.baseUrl, meta.baseUrl);
  }
  const claude = models.find((m) => m.id === "claude-opus-5-5");
  const gpt = models.find((m) => m.id === "gpt-6.1-sol");
  if (!claude || !gpt) throw new Error("curated families missing");
  // The relay's Claude Code tutorial uses the site root; GPT is served under /v1.
  assert.equal(claude.api, "anthropic-messages");
  assert.equal(claude.baseUrl, "https://api.openlux.ai");
  assert.equal(gpt.api, "openai-completions");
  assert.equal(gpt.baseUrl, "https://api.openlux.ai/v1");
});

test("Gemini models inherit the provider protocol instead of overriding it", () => {
  // /v1alpha/models only ever lists Gemini ids; those must keep using the
  // provider-level google-generative-ai endpoint at /v1alpha.
  const relay = mapCatalogEntry(geminiEntry({ name: "models/gemini-3.8-flash" }));
  if (!relay) throw new Error("expected a Gemini model");
  const model = withCuratedModels([relay]).find((m) => m.id === "gemini-3.8-flash");
  if (!model) throw new Error("gemini-3.8-flash missing");
  assert.equal(model.api, undefined);
  assert.equal(model.baseUrl, undefined);
});

test("no curated model is ever routed to the Gemini-native path", () => {
  // Regression guard for "not a valid Gemini model for Gemini native API format".
  for (const model of withCuratedModels([])) {
    assert.notEqual(model.api, "google-generative-ai");
    assert.ok(model.api === "anthropic-messages" || model.api === "openai-completions");
  }
});
