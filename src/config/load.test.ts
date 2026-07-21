import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigLoadError, findSensitiveOverrides, resolveConfig } from './load.js';
import type { ConfigSource } from './load.js';

const expectConfigLoadError = async (operation: Promise<unknown>): Promise<ConfigLoadError> => {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigLoadError);
    return error as ConfigLoadError;
  }
  throw new Error('Expected config load to fail.');
};

const writeJson = async (filePath: string, data: unknown) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data), 'utf8');
};

const withTempDir = async (fn: (dir: string) => Promise<void>) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zencommit-test-'));
  await fn(dir);
};

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('resolveConfig failure boundaries', () => {
  it('reports malformed inline config without echoing the environment value', async () => {
    process.env.ZENCOMMIT_CONFIG_CONTENT = '{"ai":{"model":"secret-model"';

    const error = await expectConfigLoadError(resolveConfig(null));

    expect(error.source).toBe('inline');
    expect(error.message).toContain('Invalid JSON in inline config from ZENCOMMIT_CONFIG_CONTENT');
    expect(error.message).not.toContain('secret-model');
  });

  it('rejects inline config that parses to a non-object', async () => {
    process.env.ZENCOMMIT_CONFIG_CONTENT = JSON.stringify(['not', 'an', 'object']);

    const error = await expectConfigLoadError(resolveConfig(null));

    expect(error.source).toBe('inline');
    expect(error.message).toContain(
      'Invalid inline config from ZENCOMMIT_CONFIG_CONTENT: expected a JSON object',
    );
  });

  it('reports project config parse errors with the source path and no raw payload', async () => {
    await withTempDir(async (dir) => {
      const repoRoot = path.join(dir, 'repo');
      await fs.mkdir(repoRoot, { recursive: true });
      const projectPath = path.join(repoRoot, 'zencommit.json');
      await fs.writeFile(projectPath, '{"ai":{"model":"secret-model"', 'utf8');

      const error = await expectConfigLoadError(resolveConfig(repoRoot));

      expect(error.source).toBe('project');
      expect(error.path).toBe(projectPath);
      expect(error.message).toContain(`Failed to parse project config at ${projectPath}`);
      expect(error.message).not.toContain('secret-model');
    });
  });

  it('rejects custom config that parses to a non-object', async () => {
    await withTempDir(async (dir) => {
      const repoRoot = path.join(dir, 'repo');
      await fs.mkdir(repoRoot, { recursive: true });
      const customPath = path.join(dir, 'custom.json');
      await fs.writeFile(customPath, JSON.stringify(null), 'utf8');
      process.env.ZENCOMMIT_CONFIG = customPath;

      const error = await expectConfigLoadError(resolveConfig(repoRoot));

      expect(error.source).toBe('custom');
      expect(error.path).toBe(customPath);
      expect(error.message).toContain(
        `Invalid custom config at ${customPath}: expected a JSON object`,
      );
    });
  });
});

describe('findSensitiveOverrides', () => {
  it('flags a project source that sets a custom baseUrl', () => {
    const sources: ConfigSource[] = [
      {
        name: 'project',
        data: { ai: { openaiCompatible: { baseUrl: 'https://example.com/v1' } } },
      },
    ];

    expect(findSensitiveOverrides(sources)).toEqual([
      { path: 'ai.openaiCompatible.baseUrl', source: 'project' },
    ]);
  });

  it('flags an inline source that selects an openai-compatible model', () => {
    const sources: ConfigSource[] = [
      { name: 'inline', data: { ai: { model: 'openai-compatible/x' } } },
    ];

    expect(findSensitiveOverrides(sources)).toEqual([{ path: 'ai.model', source: 'inline' }]);
  });

  it('ignores global sources even when they set both fields', () => {
    const sources: ConfigSource[] = [
      {
        name: 'global',
        data: {
          ai: {
            model: 'openai-compatible/x',
            openaiCompatible: { baseUrl: 'https://example.com/v1' },
          },
        },
      },
    ];

    expect(findSensitiveOverrides(sources)).toEqual([]);
  });

  it('does not flag trusted provider model ids', () => {
    const sources: ConfigSource[] = [{ name: 'project', data: { ai: { model: 'openai/gpt-5' } } }];

    expect(findSensitiveOverrides(sources)).toEqual([]);
  });

  it('tolerates malformed shapes without throwing', () => {
    const sources: ConfigSource[] = [
      { name: 'project', data: { ai: 'not-an-object' } },
      { name: 'inline', data: { ai: { openaiCompatible: null } } },
    ];

    expect(findSensitiveOverrides(sources)).toEqual([]);
  });
});

describe('resolveConfig precedence', () => {
  it('merges config sources in order', async () => {
    await withTempDir(async (dir) => {
      const repoRoot = path.join(dir, 'repo');
      await fs.mkdir(repoRoot, { recursive: true });

      const globalRoot = path.join(dir, 'global');
      process.env.XDG_CONFIG_HOME = globalRoot;

      const globalConfigPath = path.join(globalRoot, 'zencommit', 'config.json');
      await writeJson(globalConfigPath, { commit: { style: 'freeform' } });

      const customPath = path.join(dir, 'custom.json');
      await writeJson(customPath, { ai: { model: 'openai/test-model' } });
      process.env.ZENCOMMIT_CONFIG = customPath;

      const projectPath = path.join(repoRoot, 'zencommit.json');
      await writeJson(projectPath, { commit: { language: 'es' } });

      process.env.ZENCOMMIT_CONFIG_CONTENT = JSON.stringify({ ai: { temperature: 0.9 } });

      const config = await resolveConfig(repoRoot);
      expect(config.commit.style).toBe('freeform');
      expect(config.ai.model).toBe('openai/test-model');
      expect(config.commit.language).toBe('es');
      expect(config.ai.temperature).toBe(0.9);
    });
  });
});
