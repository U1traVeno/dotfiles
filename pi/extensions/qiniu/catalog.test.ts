import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCatalog,
  mapCatalogEntry,
  mapListedModel,
  mergeCatalog,
  modelCompat,
  modelPagePath,
  parseAvailableModels,
  resolveMaxTokens,
  selectCatalogEntries,
  selectModelListEntries,
  selectModelPageEntry,
} from "./catalog.ts";

function page(models: unknown): string {
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { models } },
  })}</script></html>`;
}

function chatEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "z-ai/glm-5.3",
    name: "GLM-5.3",
    features: [],
    architecture: {
      input_modalities: ["text"],
      output_modalities: ["text"],
      reasoning: { supported: true },
    },
    model_constraints: { context_length: 1_000_000, max_tokens: 128_000, max_completion_tokens: 0 },
    pricing_rules_v2: [
      {
        details_v2: {
          output: { unit_name: "token", unit_price_usd: 0.00405797 },
          cache: { unit_name: "token", unit_price_usd: 0.00028986 },
          ncache: { unit_name: "token", unit_price_usd: 0.00115942 },
        },
      },
    ],
    ...overrides,
  };
}

test("maps a chat model with USD-per-million costs", () => {
  const model = mapCatalogEntry(chatEntry());
  assert.ok(model);
  assert.equal(model.id, "z-ai/glm-5.3");
  assert.equal(model.reasoning, true);
  assert.deepEqual(model.input, ["text"]);
  assert.equal(model.contextWindow, 1_000_000);
  assert.equal(model.maxTokens, 128_000);
  assert.equal(Math.round(model.cost.input * 1000) / 1000, 1.159);
  assert.equal(Math.round(model.cost.output * 1000) / 1000, 4.058);
  assert.equal(Math.round(model.cost.cacheRead * 1000) / 1000, 0.29);
  assert.equal(model.cost.cacheWrite, 0);
  assert.equal(model.compat.supportsDeveloperRole, false);
});

test("reports image input when the model accepts it", () => {
  const model = mapCatalogEntry(
    chatEntry({
      architecture: {
        input_modalities: ["text", "image", "video"],
        output_modalities: ["text"],
        reasoning: { supported: true },
      },
    }),
  );
  // Video is dropped because pi models only describe text and image input.
  assert.deepEqual(model?.input, ["text", "image"]);
});

test("treats a 深度思考 feature as reasoning when architecture omits it", () => {
  const model = mapCatalogEntry(
    chatEntry({
      features: ["工具调用", "深度思考"],
      architecture: {
        input_modalities: ["text"],
        output_modalities: ["text"],
        reasoning: { supported: false },
      },
    }),
  );
  assert.equal(model?.reasoning, true);
});

test("prefers peak pricing when only time-of-day rates exist", () => {
  const model = mapCatalogEntry(
    chatEntry({
      pricing_rules_v2: [
        {
          details_v2: {
            output_peak: { unit_name: "token", unit_price_usd: 0.00391304 },
            output_offpeak: { unit_name: "token", unit_price_usd: 0.00195652 },
            ncache_peak: { unit_name: "token", unit_price_usd: 0.00130435 },
            ncache_offpeak: { unit_name: "token", unit_price_usd: 0.00065217 },
          },
        },
      ],
    }),
  );
  assert.equal(Math.round(model!.cost.output * 1000) / 1000, 3.913);
  assert.equal(Math.round(model!.cost.input * 1000) / 1000, 1.304);
});

test("derives an output cap when max_tokens equals the context window", () => {
  assert.equal(resolveMaxTokens({ context_length: 1_048_576, max_tokens: 1_048_576 }, 1_048_576), 131_072);
  assert.equal(resolveMaxTokens({ context_length: 256_000, max_tokens: 256_000 }, 256_000), 32_000);
  assert.equal(resolveMaxTokens({ max_tokens: 0 }, 1_000_000), 125_000);
  assert.equal(resolveMaxTokens({ max_tokens: 384_000 }, 1_000_000), 384_000);
  assert.equal(resolveMaxTokens({ max_tokens: 0 }, 40_000), 16_384);
});

test("skips media models and entries without token pricing", () => {
  const video = chatEntry({
    id: "kling-v3",
    architecture: { input_modalities: ["text", "image"], output_modalities: ["video"] },
  });
  assert.equal(mapCatalogEntry(video), undefined);

  const unpriced = chatEntry({ id: "no-price", pricing_rules_v2: [] });
  assert.equal(mapCatalogEntry(unpriced), undefined);
});

test("builds a deduplicated, sorted catalog from page HTML", () => {
  const html = page([
    chatEntry({ id: "z-ai/glm-5.3" }),
    chatEntry({ id: "moonshotai/kimi-k3" }),
    chatEntry({ id: "z-ai/glm-5.3" }),
    chatEntry({ id: "viduq3", architecture: { input_modalities: ["text"], output_modalities: ["video"] } }),
  ]);
  assert.deepEqual(
    buildCatalog(html).map((model) => model.id),
    ["moonshotai/kimi-k3", "z-ai/glm-5.3"],
  );
});

test("tolerates a payload whose model array is missing", () => {
  assert.deepEqual(selectCatalogEntries({ props: { pageProps: {} } }), []);
  assert.deepEqual(selectCatalogEntries(null), []);
  assert.deepEqual(buildCatalog(page("not-an-array")), []);
});

test("throws a clear error when the payload script is absent", () => {
  assert.throws(() => buildCatalog("<html></html>"), /__NEXT_DATA__ payload not found/);
});

test("reads the availability list envelope and drops unusable entries", () => {
  const payload = {
    object: "list",
    data: [
      { id: "deepseek/deepseek-v4.1-flash", object: "model", context_length: 1_000_000, max_tokens: 384_000 },
      { object: "model" },
      "junk",
    ],
  };
  assert.deepEqual(
    parseAvailableModels(payload).map((model) => model.id),
    ["deepseek/deepseek-v4.1-flash"],
  );
  assert.equal(parseAvailableModels({ models: [{ id: "a" }] })[0]?.id, "a");
  assert.deepEqual(selectModelListEntries(null), []);
  assert.deepEqual(selectModelListEntries({}), []);
});

test("derives a fallback entry from the availability list", () => {
  const model = mapListedModel({ id: "fresh/model", context_length: 1_000_000, max_tokens: 384_000 });
  assert.equal(model?.name, "fresh/model");
  assert.equal(model?.reasoning, false);
  assert.deepEqual(model?.input, ["text"]);
  assert.equal(model?.contextWindow, 1_000_000);
  assert.equal(model?.maxTokens, 384_000);
  assert.deepEqual(model?.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  // Without a usable cap the derived value stays inside the catalog's bounds.
  assert.equal(mapListedModel({ id: "bare" })?.maxTokens, 16_384);
  assert.equal(mapListedModel({ context_length: 1_000_000 }), undefined);
});

test("reads a single-model marketplace page", () => {
  const payload = {
    props: { pageProps: { detailFailed: false, model: chatEntry({ id: "deepseek/deepseek-v4.1-flash" }) } },
  };
  assert.equal(selectModelPageEntry(payload)?.id, "deepseek/deepseek-v4.1-flash");
  assert.equal(selectModelPageEntry({ props: { pageProps: { detailFailed: true } } }), undefined);
  assert.equal(selectModelPageEntry(null), undefined);
});

test("refuses ids that cannot be used as a marketplace path", () => {
  assert.equal(modelPagePath("deepseek/deepseek-v4.1-flash"), "deepseek/deepseek-v4.1-flash");
  assert.equal(modelPagePath("qwen3-vl-30b-a3b-thinking"), "qwen3-vl-30b-a3b-thinking");
  assert.equal(modelPagePath("../etc/passwd"), undefined);
  assert.equal(modelPagePath("a/../b"), undefined);
  assert.equal(modelPagePath("a//b"), undefined);
  assert.equal(modelPagePath("a?x=1"), undefined);
  assert.equal(modelPagePath(""), undefined);
});

test("merges backfilled models without displacing snapshot entries", () => {
  const snapshot = mapCatalogEntry(chatEntry({ id: "z-ai/glm-5.3", name: "GLM-5.3" }))!;
  const backfilled = mapListedModel({ id: "deepseek/deepseek-v4.1-flash" })!;
  const merged = mergeCatalog([snapshot], [backfilled, mapListedModel({ id: "z-ai/glm-5.3" })!]);
  assert.deepEqual(
    merged.map((model) => model.id),
    ["deepseek/deepseek-v4.1-flash", "z-ai/glm-5.3"],
  );
  // The snapshot entry wins over a backfilled entry for the same id.
  assert.equal(merged[1].name, "GLM-5.3");
});

test("addresses DeepSeek models in DeepSeek's own wire format", () => {
  assert.deepEqual(modelCompat("deepseek/deepseek-v4.1-flash"), {
    supportsDeveloperRole: false,
    supportsStore: false,
    maxTokensField: "max_tokens",
    requiresReasoningContentOnAssistantMessages: true,
    thinkingFormat: "deepseek",
  });
  // The fallback entry of a brand new DeepSeek model carries it too.
  assert.equal(mapListedModel({ id: "deepseek/next" })?.compat.thinkingFormat, "deepseek");
  assert.equal(mapCatalogEntry(chatEntry({ id: "deepseek-r1" }))?.compat.requiresReasoningContentOnAssistantMessages, true);
  // Anything else keeps the conservative default.
  assert.deepEqual(modelCompat("z-ai/glm-5.3"), { supportsDeveloperRole: false });
  assert.deepEqual(mapCatalogEntry(chatEntry())?.compat, { supportsDeveloperRole: false });
  assert.equal(mapListedModel({ id: "qwen3-235b-a22b" })?.compat.maxTokensField, undefined);
});
