import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigLoadError, resolveConfig } from './load.js';

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

    await expect(resolveConfig(null)).rejects.toMatchObject({
      name: 'ConfigLoadError',
      source: 'inline',
    });
    await expect(resolveConfig(null)).rejects.toThrow(
      'Invalid JSON in inline config from ZENCOMMIT_CONFIG_CONTENT',
    );
    await expect(resolveConfig(null)).rejects.not.toThrow('secret-model');
  });

  it('rejects inline config that parses to a non-object', async () => {
    process.env.ZENCOMMIT_CONFIG_CONTENT = JSON.stringify(['not', 'an', 'object']);

    await expect(resolveConfig(null)).rejects.toThrow(ConfigLoadError);
    await expect(resolveConfig(null)).rejects.toMatchObject({ source: 'inline' });
    await expect(resolveConfig(null)).rejects.toThrow(
      'Invalid inline config from ZENCOMMIT_CONFIG_CONTENT: expected a JSON object',
    );
  });

  it('reports project config parse errors with the source path and no raw payload', async () => {
    await withTempDir(async (dir) => {
      const repoRoot = path.join(dir, 'repo');
      await fs.mkdir(repoRoot, { recursive: true });
      const projectPath = path.join(repoRoot, 'zencommit.json');
      await fs.writeFile(projectPath, '{"ai":{"model":"secret-model"', 'utf8');

      await expect(resolveConfig(repoRoot)).rejects.toMatchObject({
        source: 'project',
        path: projectPath,
      });
      await expect(resolveConfig(repoRoot)).rejects.toThrow(
        `Failed to parse project config at ${projectPath}`,
      );
      await expect(resolveConfig(repoRoot)).rejects.not.toThrow('secret-model');
    });
  });

  it('rejects custom config that parses to a non-object', async () => {
    await withTempDir(async (dir) => {
      const repoRoot = path.join(dir, 'repo');
      await fs.mkdir(repoRoot, { recursive: true });
      const customPath = path.join(dir, 'custom.json');
      await fs.writeFile(customPath, JSON.stringify(null), 'utf8');
      process.env.ZENCOMMIT_CONFIG = customPath;

      await expect(resolveConfig(repoRoot)).rejects.toMatchObject({
        source: 'custom',
        path: customPath,
      });
      await expect(resolveConfig(repoRoot)).rejects.toThrow(
        `Invalid custom config at ${customPath}: expected a JSON object`,
      );
    });
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
