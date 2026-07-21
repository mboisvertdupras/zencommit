import { defaultConfig } from '../config/types.js';
import { ConfigLoadError, resolveConfig, resolveConfigWithSources } from '../config/load.js';
import { validateConfig } from '../config/validate.js';
import { getRepoRoot } from '../git/repo.js';
import { fileExists, writeJsonFile } from '../util/fs.js';
import { redactObject } from '../util/redact.js';
import { logVerbose } from '../util/logger.js';
import path from 'node:path';

const withConfigErrorHandling = async (run: () => Promise<void>): Promise<void> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof ConfigLoadError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
};

export const runConfigPrint = async (): Promise<void> =>
  withConfigErrorHandling(async () => {
    const repoRoot = await getRepoRoot();
    logVerbose(1, `config print: repo root ${repoRoot ?? 'unknown'}`);
    const { config, sourceMap } = await resolveConfigWithSources(repoRoot);
    const redacted = redactObject(config);
    console.log(JSON.stringify(redacted, null, 2));
    console.log('\nSources:');
    for (const [key, source] of Object.entries(sourceMap)) {
      console.log(`${key}: ${source}`);
    }
  });

export const runConfigInit = async (): Promise<void> => {
  const repoRoot = await getRepoRoot();
  if (!repoRoot) {
    console.error('Not inside a git repository.');
    process.exit(3);
  }
  logVerbose(1, `config init: repo root ${repoRoot}`);
  const configPath = path.join(repoRoot, 'zencommit.json');
  if (await fileExists(configPath)) {
    console.error('zencommit.json already exists.');
    process.exit(2);
  }
  await writeJsonFile(configPath, defaultConfig);
  console.log(`Wrote ${configPath}`);
};

export const runConfigValidate = async (): Promise<void> =>
  withConfigErrorHandling(async () => {
    const repoRoot = await getRepoRoot();
    logVerbose(1, `config validate: repo root ${repoRoot ?? 'unknown'}`);
    const config = await resolveConfig(repoRoot);
    const result = validateConfig(config);
    if (result.valid) {
      console.log('Config is valid.');
      return;
    }
    console.error('Config validation failed:');
    for (const error of result.errors) {
      console.error(`- ${error.path}: ${error.message}`);
    }
    process.exit(2);
  });
