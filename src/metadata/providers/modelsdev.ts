import path from 'node:path';
import type { ModelMetadata, MetadataProvider } from '../types.js';
import { getCacheRoot } from '../../util/fs.js';
import { isCacheFresh, readCache, writeCache } from '../cache.js';
import type { MetadataConfig } from '../../config/types.js';
import { getVerbosity, logVerbose } from '../../util/logger.js';

type ModelsDevMetadataProvider = MetadataProvider & {
  list(): Promise<ModelMetadata[]>;
  refresh(): Promise<void>;
};

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
};

const normalizeModelId = (providerId: string, modelId: string): string => {
  const prefix = `${providerId}/`;
  if (modelId.startsWith(prefix)) {
    return modelId;
  }
  return `${prefix}${modelId}`;
};

const toStringSafe = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;

export const normalizeModelsDevData = (data: unknown): ModelMetadata[] => {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const entries = Object.entries(data as Record<string, unknown>);
  const models: ModelMetadata[] = [];

  for (const [providerKey, providerValue] of entries) {
    if (!providerValue || typeof providerValue !== 'object') {
      continue;
    }
    const provider = providerValue as Record<string, unknown>;
    const providerId = toStringSafe(provider.id, providerKey);
    const providerModels = provider.models;
    if (!providerModels || typeof providerModels !== 'object') {
      continue;
    }

    for (const [modelKey, modelValue] of Object.entries(
      providerModels as Record<string, unknown>,
    )) {
      if (!modelValue || typeof modelValue !== 'object') {
        continue;
      }
      const model = modelValue as Record<string, unknown>;
      const rawId = toStringSafe(model.id, modelKey);
      const id = normalizeModelId(providerId, rawId);
      const name = toStringSafe(model.name, rawId);
      const limit = (model.limit ?? model.limits ?? {}) as Record<string, unknown>;
      const limits = {
        context: toNumberOrNull(limit.context),
        input: toNumberOrNull(limit.input),
        output: toNumberOrNull(limit.output),
      };
      const pricing = model.cost ?? model.pricing;
      const capabilities = {
        attachment: model.attachment,
        reasoning: model.reasoning,
        temperature: model.temperature,
        toolCall: model.tool_call,
        structuredOutput: model.structured_output,
        modalities: model.modalities,
        family: model.family,
        openWeights: model.open_weights,
      };

      models.push({ id, name, limits, pricing, capabilities });
    }
  }

  return models;
};

const requireUsableModelsDevData = (data: unknown, source: string): ModelMetadata[] => {
  const models = normalizeModelsDevData(data);
  if (models.length === 0) {
    throw new Error(`models.dev metadata from ${source} did not contain any usable model metadata`);
  }
  return models;
};

const normalizeCacheData = (
  data: unknown,
  cachePath: string,
  cacheState: 'fresh' | 'stale',
): ModelMetadata[] | null => {
  const models = normalizeModelsDevData(data);
  if (models.length === 0) {
    logVerbose(
      1,
      `metadata: ignoring ${cacheState} models.dev cache ${cachePath}: no usable model metadata`,
    );
    return null;
  }
  return models;
};

export const createModelsDevProvider = (config: MetadataConfig): ModelsDevMetadataProvider => {
  const cachePath = path.join(getCacheRoot(), 'zencommit', 'metadata', 'modelsdev.cache.json');
  let cachedModels: ModelMetadata[] | null = null;

  const loadModels = async (): Promise<ModelMetadata[]> => {
    if (cachedModels) {
      logVerbose(2, 'metadata: using in-memory models.dev cache');
      return cachedModels;
    }

    const cache = await readCache(cachePath);
    const cacheFresh =
      cache && isCacheFresh(cache.mtimeMs, config.providers.modelsdev.cacheTtlHours);

    if (cacheFresh && cache) {
      const models = normalizeCacheData(cache.data, cachePath, 'fresh');
      if (models) {
        logVerbose(2, `metadata: cache hit ${cachePath}`);
        cachedModels = models;
        return cachedModels;
      }
    }

    try {
      if (getVerbosity() >= 1) {
        logVerbose(1, `metadata: fetching ${config.providers.modelsdev.url}`);
      }
      const response = await fetch(config.providers.modelsdev.url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`models.dev responded with ${response.status}`);
      }
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw new Error(
          `models.dev response too large (${contentLength} bytes) from ${config.providers.modelsdev.url}`,
        );
      }
      let data: unknown;
      try {
        data = (await response.json()) as unknown;
      } catch (error) {
        throw new Error(
          `Failed to parse models.dev response from ${config.providers.modelsdev.url}: ${(error as Error).message}`,
        );
      }
      cachedModels = requireUsableModelsDevData(data, config.providers.modelsdev.url);
      try {
        await writeCache(cachePath, data);
        logVerbose(2, `metadata: cache write ${cachePath}`);
      } catch (error) {
        logVerbose(1, `metadata: cache write failed for ${cachePath}: ${(error as Error).message}`);
      }
      return cachedModels;
    } catch (error) {
      if (cache) {
        const cacheState = cacheFresh ? 'fresh' : 'stale';
        const cacheModels = normalizeCacheData(cache.data, cachePath, cacheState);
        if (cacheModels) {
          const fallbackLabel = cacheFresh ? 'cached' : 'stale cached';
          console.warn(
            `models.dev fetch failed, using ${fallbackLabel} metadata from ${cachePath}.`,
          );
          logVerbose(2, `metadata: cache fallback ${cachePath} (${cacheState})`);
          cachedModels = cacheModels;
          return cachedModels;
        }
      }
      throw error;
    }
  };

  return {
    async getModel(modelId: string) {
      const models = await loadModels();
      return models.find((model) => model.id === modelId) ?? null;
    },
    async search(query: string, limit = 20) {
      const models = await loadModels();
      const normalized = query.toLowerCase();
      const results = models.filter((model) =>
        `${model.id} ${model.name}`.toLowerCase().includes(normalized),
      );
      return results.slice(0, limit);
    },
    async list() {
      const models = await loadModels();
      return models;
    },
    async refresh() {
      cachedModels = null;
      await loadModels();
    },
  };
};
