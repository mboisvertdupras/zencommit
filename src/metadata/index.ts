import type { MetadataProvider, ModelMetadata } from './types.js';
import type { MetadataConfig } from '../config/types.js';
import { createModelsDevProvider } from './providers/modelsdev.js';
import { createLocalProvider } from './providers/local.js';

export interface MetadataResolver {
  getModel(modelId: string): Promise<ModelMetadata | null>;
  search(query: string, limit?: number): Promise<ModelMetadata[]>;
  list?(): Promise<ModelMetadata[]>;
}

const normalizeLimit = (limit: number | undefined): number => {
  if (!Number.isFinite(limit)) {
    return Number.POSITIVE_INFINITY;
  }
  if (limit !== undefined && limit <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor(limit ?? Number.POSITIVE_INFINITY);
};

type ProviderKey = 'modelsdev' | 'local';

const buildProviders = (
  config: MetadataConfig,
  repoRoot: string | null,
): Record<ProviderKey, MetadataProvider> => ({
  modelsdev: createModelsDevProvider(config),
  local: createLocalProvider(config, repoRoot),
});

export const createMetadataResolver = (
  config: MetadataConfig,
  repoRoot: string | null,
): MetadataResolver => {
  const providers = buildProviders(config, repoRoot);

  const getProviderOrder = (): ProviderKey[] => {
    if (config.provider === 'modelsdev') {
      return ['modelsdev'];
    }
    if (config.provider === 'local') {
      return ['local'];
    }
    return config.fallbackOrder;
  };

  return {
    async getModel(modelId: string) {
      const order = getProviderOrder();
      for (const name of order) {
        const provider = providers[name];
        try {
          const model = await provider.getModel(modelId);
          if (model) {
            return model;
          }
        } catch (error) {
          console.warn(`Metadata provider ${name} failed: ${(error as Error).message}`);
        }
      }
      return null;
    },
    async search(query: string, limit = 20) {
      const resolvedLimit = normalizeLimit(limit);
      const order = getProviderOrder();
      const results: ModelMetadata[] = [];
      for (const name of order) {
        const provider = providers[name];
        try {
          const providerResults = await provider.search(query, resolvedLimit);
          for (const model of providerResults) {
            results.push(model);
            if (results.length >= resolvedLimit) {
              return results.slice(0, resolvedLimit);
            }
          }
        } catch (error) {
          console.warn(`Metadata provider ${name} failed: ${(error as Error).message}`);
        }
      }
      return results.slice(0, resolvedLimit);
    },
    async list() {
      const order = getProviderOrder();
      const key = order[0];
      const provider = key ? providers[key] : null;
      if (!provider?.list) {
        return [];
      }
      return await provider.list();
    },
  };
};
