import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultConfig, type MetadataConfig } from '../../src/config/types.js';
import { createLocalProvider } from '../../src/metadata/providers/local.js';
import { createModelsDevProvider } from '../../src/metadata/providers/modelsdev.js';

const withTempDir = async (fn: (dir: string) => Promise<void>) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zencommit-metadata-test-'));
  await fn(dir);
};

const writeFile = async (filePath: string, content: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
};

const expectMetadataError = async (operation: Promise<unknown>): Promise<Error> => {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return error as Error;
  }
  throw new Error('Expected metadata operation to fail.');
};

const modelsDevFixture = (provider = 'openai', model = 'gpt-5') => ({
  [provider]: {
    id: provider,
    models: {
      [model]: {
        id: model,
        name: `${provider} ${model}`,
        limit: { context: 128000, input: 128000, output: 8192 },
      },
    },
  },
});

type MetadataConfigOverrides = Omit<Partial<MetadataConfig>, 'providers'> & {
  providers?: {
    modelsdev?: Partial<MetadataConfig['providers']['modelsdev']>;
    local?: Partial<MetadataConfig['providers']['local']>;
  };
};

const metadataConfig = (overrides: MetadataConfigOverrides = {}): MetadataConfig => ({
  ...defaultConfig.metadata,
  ...overrides,
  providers: {
    modelsdev: {
      ...defaultConfig.metadata.providers.modelsdev,
      ...overrides.providers?.modelsdev,
    },
    local: {
      ...defaultConfig.metadata.providers.local,
      ...overrides.providers?.local,
    },
  },
});

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('local metadata provider failure boundaries', () => {
  it('reports malformed local metadata JSON with provider path and no raw payload', async () => {
    await withTempDir(async (dir) => {
      const metadataPath = path.join(dir, 'models.metadata.json');
      await writeFile(metadataPath, '{"models":[{"id":"secret-model"}');
      const provider = createLocalProvider(
        metadataConfig({ providers: { local: { path: metadataPath } } }),
        dir,
      );

      const error = await expectMetadataError(provider.list?.() ?? Promise.resolve());

      expect(error.message).toContain(`Failed to parse local metadata file at ${metadataPath}`);
      expect(error.message).not.toContain('secret-model');
    });
  });

  it('rejects local metadata that normalizes to no usable models', async () => {
    await withTempDir(async (dir) => {
      const metadataPath = path.join(dir, 'empty.metadata.json');
      await writeFile(metadataPath, JSON.stringify([{ name: 'missing id' }]));
      const provider = createLocalProvider(
        metadataConfig({ providers: { local: { path: metadataPath } } }),
        dir,
      );

      await expect(provider.list?.()).rejects.toThrow(
        `Local metadata file at ${metadataPath} did not contain any usable model metadata`,
      );
    });
  });
});

describe('models.dev metadata provider failure boundaries', () => {
  it('reports malformed models.dev JSON without echoing the response payload', async () => {
    await withTempDir(async (dir) => {
      process.env.XDG_CACHE_HOME = path.join(dir, 'cache');
      const url = 'https://example.test/models.json';
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.reject(new SyntaxError('Unexpected token s in JSON at position 14')),
          }),
        ),
      );
      const provider = createModelsDevProvider(
        metadataConfig({ providers: { modelsdev: { url, cacheTtlHours: 24 } } }),
      );

      const error = await expectMetadataError(provider.list?.() ?? Promise.resolve());

      expect(error.message).toContain(`Failed to parse models.dev response from ${url}`);
      expect(error.message).not.toContain('secret-model');
    });
  });

  it('rejects models.dev responses that normalize to no usable models', async () => {
    await withTempDir(async (dir) => {
      process.env.XDG_CACHE_HOME = path.join(dir, 'cache');
      const url = 'https://example.test/models.json';
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({ ok: true, json: () => Promise.resolve({ provider: { models: {} } }) }),
        ),
      );
      const provider = createModelsDevProvider(
        metadataConfig({ providers: { modelsdev: { url, cacheTtlHours: 24 } } }),
      );

      await expect(provider.list?.()).rejects.toThrow(
        `models.dev metadata from ${url} did not contain any usable model metadata`,
      );
    });
  });

  it('ignores malformed cache content and replaces it with a successful fetch', async () => {
    await withTempDir(async (dir) => {
      const cacheRoot = path.join(dir, 'cache');
      process.env.XDG_CACHE_HOME = cacheRoot;
      const cachePath = path.join(cacheRoot, 'zencommit', 'metadata', 'modelsdev.cache.json');
      await writeFile(cachePath, '{"openai":{"models":{"secret-model":');
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(modelsDevFixture('anthropic', 'claude-4')),
          }),
        ),
      );
      const provider = createModelsDevProvider(metadataConfig());

      await expect(provider.list?.()).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'anthropic/claude-4' })]),
      );
      await expect(fs.readFile(cachePath, 'utf8')).resolves.toContain('claude-4');
    });
  });

  it('warns and uses stale cache when models.dev fetch fails', async () => {
    await withTempDir(async (dir) => {
      const cacheRoot = path.join(dir, 'cache');
      process.env.XDG_CACHE_HOME = cacheRoot;
      const cachePath = path.join(cacheRoot, 'zencommit', 'metadata', 'modelsdev.cache.json');
      await writeFile(cachePath, JSON.stringify(modelsDevFixture('openai', 'gpt-4o')));
      const stale = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await fs.utimes(cachePath, stale, stale);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('network unavailable'))),
      );
      const provider = createModelsDevProvider(
        metadataConfig({ providers: { modelsdev: { cacheTtlHours: 1 } } }),
      );

      await expect(provider.list?.()).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'openai/gpt-4o' })]),
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('models.dev fetch failed, using stale cached metadata'),
      );
    });
  });
});
