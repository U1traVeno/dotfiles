import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Credential } from "@earendil-works/pi-ai";

import {
  OPENLUX_BASE_URL,
  OPENLUX_PROVIDER_ID,
  OPENLUX_PROVIDER_NAME,
  fetchOpenluxCatalog,
  type OpenluxModel,
} from "./catalog.ts";

/**
 * OpenLux registers its model list dynamically.
 *
 * pi calls `refreshModels` with `allowNetwork: false` during startup and with
 * network access when the model selector opens, but it does not persist models
 * returned by an extension. The cache file below therefore carries the catalog
 * across restarts so startup never blocks on the network. A cold machine with
 * no cache pays one bounded fetch, and after that every startup is offline.
 *
 * Unlike Qiniu the catalog endpoint is authenticated. `refreshModels` receives
 * the effective credential in its context; the factory cold start has none, so
 * it falls back to the OPENLUX_API_KEY environment variable and then to the
 * provider's entry in auth.json (the same store `/login openlux` writes).
 */
const CACHE_FILE = "openlux-catalog.json";
const COLD_START_TIMEOUT_MS = 5_000;
const REFRESH_TIMEOUT_MS = 10_000;
const ENV_KEY = "OPENLUX_API_KEY";

interface CacheFile {
  version: 1;
  fetchedAt: number;
  models: OpenluxModel[];
}

function cachePath(): string {
  return join(getAgentDir(), CACHE_FILE);
}

async function readCache(): Promise<OpenluxModel[]> {
  try {
    const parsed = JSON.parse(await readFile(cachePath(), "utf8")) as Partial<CacheFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.models)) return [];
    return parsed.models;
  } catch {
    // A missing or corrupt cache is not an error; the next refresh rebuilds it.
    return [];
  }
}

async function writeCache(models: OpenluxModel[]): Promise<void> {
  const payload: CacheFile = { version: 1, fetchedAt: Date.now(), models };
  try {
    await writeFile(cachePath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch {
    // Losing the cache only costs one extra fetch on the next cold start.
  }
}

function credentialApiKey(credential: Credential | undefined): string | undefined {
  if (credential?.type === "api_key" && typeof credential.key === "string" && credential.key.length > 0) {
    return credential.key;
  }
  return undefined;
}

function envApiKey(): string | undefined {
  const value = process.env[ENV_KEY];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Read the `/login openlux` credential without depending on its storage layout. */
async function storedApiKey(): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(
      await readFile(join(getAgentDir(), "auth.json"), "utf8"),
    ) as Record<string, unknown>;
    if (!isRecord(parsed[OPENLUX_PROVIDER_ID])) return undefined;
    const key = (parsed[OPENLUX_PROVIDER_ID] as { key?: unknown }).key;
    return typeof key === "string" && key.length > 0 ? key : undefined;
  } catch {
    // Missing auth.json or an unexpected shape simply means no stored key yet.
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function resolveApiKey(credential: Credential | undefined): Promise<string | undefined> {
  return credentialApiKey(credential) ?? envApiKey() ?? (await storedApiKey());
}

export default async function openluxExtension(pi: ExtensionAPI): Promise<void> {
  let models = await readCache();

  if (models.length === 0) {
    const apiKey = await resolveApiKey(undefined);
    if (apiKey !== undefined) {
      try {
        models = await fetchOpenluxCatalog(
          apiKey,
          AbortSignal.timeout(COLD_START_TIMEOUT_MS),
          COLD_START_TIMEOUT_MS,
        );
        await writeCache(models);
      } catch {
        // Register anyway: opening /model triggers a networked refresh that
        // can still populate the provider.
        models = [];
      }
    }
  }

  pi.registerProvider(OPENLUX_PROVIDER_ID, {
    name: OPENLUX_PROVIDER_NAME,
    baseUrl: OPENLUX_BASE_URL,
    api: "google-generative-ai",
    // apiKey is intentionally omitted so the key is resolved from auth.json.
    models,
    async refreshModels(context) {
      if (!context.allowNetwork || context.signal.aborted) return models;
      const apiKey = await resolveApiKey(context.credential);
      if (apiKey === undefined) {
        if (models.length > 0) return models;
        throw new Error("OpenLux: no API key configured; run /login openlux");
      }
      try {
        const refreshed = await fetchOpenluxCatalog(apiKey, context.signal, REFRESH_TIMEOUT_MS);
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
