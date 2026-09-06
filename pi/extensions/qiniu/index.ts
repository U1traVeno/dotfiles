import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  QINIU_BASE_URL,
  QINIU_PROVIDER_ID,
  QINIU_PROVIDER_NAME,
  fetchQiniuCatalog,
  type QiniuModel,
} from "./catalog.ts";

/**
 * Qiniu registers its model list dynamically.
 *
 * pi calls `refreshModels` with `allowNetwork: false` during startup and with
 * network access when the model selector opens, but it does not persist models
 * returned by an extension. The cache file below therefore carries the catalog
 * across restarts so startup never blocks on the network. A cold machine with
 * no cache pays one bounded fetch, and after that every startup is offline.
 */
const CACHE_FILE = "qiniu-catalog.json";
const COLD_START_TIMEOUT_MS = 5_000;
const REFRESH_TIMEOUT_MS = 10_000;

interface CacheFile {
  version: 1;
  fetchedAt: number;
  models: QiniuModel[];
}

function cachePath(): string {
  return join(getAgentDir(), CACHE_FILE);
}

async function readCache(): Promise<QiniuModel[]> {
  try {
    const parsed = JSON.parse(await readFile(cachePath(), "utf8")) as Partial<CacheFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.models)) return [];
    return parsed.models;
  } catch {
    // A missing or corrupt cache is not an error; the next refresh rebuilds it.
    return [];
  }
}

async function writeCache(models: QiniuModel[]): Promise<void> {
  const payload: CacheFile = { version: 1, fetchedAt: Date.now(), models };
  try {
    await writeFile(cachePath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch {
    // Losing the cache only costs one extra fetch on the next cold start.
  }
}

export default async function qiniuExtension(pi: ExtensionAPI): Promise<void> {
  let models = await readCache();

  if (models.length === 0) {
    try {
      models = await fetchQiniuCatalog(AbortSignal.timeout(COLD_START_TIMEOUT_MS), COLD_START_TIMEOUT_MS);
      await writeCache(models);
    } catch {
      // Register anyway: opening /model triggers a networked refresh that can
      // still populate the provider.
      models = [];
    }
  }

  pi.registerProvider(QINIU_PROVIDER_ID, {
    name: QINIU_PROVIDER_NAME,
    baseUrl: QINIU_BASE_URL,
    api: "openai-completions",
    // apiKey is intentionally omitted so the key is resolved from auth.json.
    models,
    async refreshModels(context) {
      if (!context.allowNetwork || context.signal.aborted) return models;
      try {
        const refreshed = await fetchQiniuCatalog(context.signal, REFRESH_TIMEOUT_MS);
        models = refreshed;
        await writeCache(refreshed);
        return refreshed;
      } catch (error) {
        if (models.length > 0) return models;
        throw error;
      }
    },
  });
}
