import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveConfig } from './load.js';

const writeJson = async (filePath: string, data: unknown) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data), 'utf8');
};

const withTempDir = async (fn: (dir: string) => Promise<void>) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zencommit-test-'));
  await fn(dir);
};

describe('resolveConfig precedence', () => {
  it('merges config sources in order', async () => {
    const originalEnv = { ...process.env };
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
    process.env = originalEnv;
  });
});
