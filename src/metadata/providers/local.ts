import type { MetadataProvider, ModelMetadata } from '../types.js';
import type { MetadataConfig } from '../../config/types.js';
import { readJsonFile, resolvePath } from '../../util/fs.js';
import { normalizeModelsDevData } from './modelsdev.js';
import { logVerbose } from '../../util/logger.js';

const normalizeLocalData = (data: unknown, fallbackIdPrefix = 'local'): ModelMetadata[] => {
  if (Array.isArray(data)) {
    return data
      .map((entry) => entry as Partial<ModelMetadata>)
      .filter((entry) => typeof entry.id === 'string')
      .map((entry) => ({
        id: entry.id ?? `${fallbackIdPrefix}/unknown`,
        name: entry.name ?? entry.id ?? 'Unknown',
        limits: entry.limits ?? { context: null, input: null, output: null },
        pricing: entry.pricing,
        capabilities: entry.capabilities,
      }));
  }
  const normalized = normalizeModelsDevData(data);
  if (normalized.length > 0) {
    return normalized;
  }
  return [];
};

export const createLocalProvider = (
  config: MetadataConfig,
  repoRoot: string | null,
): MetadataProvider => {
  let cachedModels: ModelMetadata[] | null = null;

  const loadModels = async (): Promise<ModelMetadata[]> => {
    if (cachedModels) {
      logVerbose(2, 'metadata: using in-memory local cache');
      return cachedModels;
    }
    const resolvedPath = resolvePath(config.providers.local.path, repoRoot ?? process.cwd());
    logVerbose(1, `metadata: loading local file ${resolvedPath}`);
    const data = await readJsonFile<unknown>(resolvedPath);
    if (!data) {
      throw new Error(`Local metadata file not found at ${resolvedPath}`);
    }
    cachedModels = normalizeLocalData(data, 'local');
    return cachedModels;
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
  };
};
