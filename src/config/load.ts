import path from 'node:path';
import { deepMerge } from './merge.js';
import type { ResolvedConfig } from './types.js';
import { defaultConfig } from './types.js';
import { getConfigRoot, readJsonFile, resolvePath } from '../util/fs.js';

export type ConfigSourceName = 'global' | 'custom' | 'project' | 'inline';

export interface ConfigSource {
  name: ConfigSourceName;
  path?: string;
  data: unknown;
}

export class ConfigLoadError extends Error {
  source: ConfigSourceName | 'inline' | 'unknown';
  path?: string;

  constructor(message: string, source: ConfigSourceName | 'inline' | 'unknown', path?: string) {
    super(message);
    this.name = 'ConfigLoadError';
    this.source = source;
    this.path = path;
  }
}

const readConfigFile = async (
  filePath: string,
  source: ConfigSourceName,
): Promise<Record<string, unknown> | null> => {
  try {
    return await readJsonFile<Record<string, unknown>>(filePath);
  } catch (error) {
    throw new ConfigLoadError(
      `Failed to parse ${source} config at ${filePath}: ${(error as Error).message}`,
      source,
      filePath,
    );
  }
};

export const getGlobalConfigPath = (): string =>
  path.join(getConfigRoot(), 'zencommit', 'config.json');

export const getProjectConfigPath = (repoRoot: string | null): string | null => {
  if (!repoRoot) {
    return null;
  }
  return path.join(repoRoot, 'zencommit.json');
};

export const loadConfigSources = async (repoRoot: string | null): Promise<ConfigSource[]> => {
  const sources: ConfigSource[] = [];

  const globalPath = getGlobalConfigPath();
  const globalConfig = await readConfigFile(globalPath, 'global');
  if (globalConfig) {
    sources.push({ name: 'global', path: globalPath, data: globalConfig });
  }

  const customPathEnv = process.env.ZENCOMMIT_CONFIG;
  if (customPathEnv) {
    const resolvedPath = resolvePath(customPathEnv, repoRoot ?? process.cwd());
    const customConfig = await readConfigFile(resolvedPath, 'custom');
    if (customConfig) {
      sources.push({ name: 'custom', path: resolvedPath, data: customConfig });
    }
  }

  const projectPath = getProjectConfigPath(repoRoot);
  if (projectPath) {
    const projectConfig = await readConfigFile(projectPath, 'project');
    if (projectConfig) {
      sources.push({ name: 'project', path: projectPath, data: projectConfig });
    }
  }

  const inlineContent = process.env.ZENCOMMIT_CONFIG_CONTENT;
  if (inlineContent) {
    try {
      const inlineConfig = JSON.parse(inlineContent) as Record<string, unknown>;
      sources.push({ name: 'inline', data: inlineConfig });
    } catch (error) {
      throw new ConfigLoadError(
        `Invalid JSON in ZENCOMMIT_CONFIG_CONTENT: ${(error as Error).message}`,
        'inline',
      );
    }
  }

  return sources;
};

export const resolveConfig = async (repoRoot: string | null): Promise<ResolvedConfig> => {
  const sources = await loadConfigSources(repoRoot);
  return sources.reduce(
    (config, source) => deepMerge(config, source.data as Partial<ResolvedConfig>),
    defaultConfig,
  );
};

export const resolveConfigWithSources = async (
  repoRoot: string | null,
): Promise<{ config: ResolvedConfig; sourceMap: Record<string, ConfigSourceName> }> => {
  const sources = await loadConfigSources(repoRoot);
  let config = defaultConfig;
  const sourceMap: Record<string, ConfigSourceName> = {};

  for (const source of sources) {
    const data = source.data as Record<string, unknown>;
    for (const key of Object.keys(data)) {
      sourceMap[key] = source.name;
    }
    config = deepMerge(config, data as Partial<ResolvedConfig>);
  }

  return { config, sourceMap };
};
