import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCatalog,
  catalogEntryId,
  mapCatalogEntry,
  resolveMaxTokens,
  selectCatalogEntries,
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
