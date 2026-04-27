import { promises as fs } from 'node:fs';
import path from 'node:path';
import { deepMerge, type DeepPartial } from './merge.js';
import type { ResolvedConfig } from './types.js';
import { defaultConfig } from './types.js';
import { getConfigRoot, resolvePath } from '../util/fs.js';

export type ConfigSourceName = 'global' | 'custom' | 'project' | 'inline';

export interface ConfigSource {
  name: ConfigSourceName;
  path?: string;
  data: unknown;
}

export class ConfigLoadError extends Error {
  source: ConfigSourceName;
  path?: string;

  constructor(message: string, source: ConfigSourceName, path?: string) {
    super(message);
    this.name = 'ConfigLoadError';
    this.source = source;
    this.path = path;
  }
}

const describeConfigSource = (source: ConfigSourceName, filePath?: string): string => {
  if (source === 'inline') {
    return 'inline config from ZENCOMMIT_CONFIG_CONTENT';
  }
  return `${source} config at ${filePath ?? 'unknown path'}`;
};

const isConfigObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const parseConfigContent = (
  content: string,
  source: ConfigSourceName,
  filePath?: string,
): Record<string, unknown> => {
  const sourceDescription = describeConfigSource(source, filePath);
  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    const prefix = source === 'inline' ? 'Invalid JSON in' : 'Failed to parse';
    throw new ConfigLoadError(
      `${prefix} ${sourceDescription}: ${(error as Error).message}`,
      source,
      filePath,
    );
  }

  if (!isConfigObject(parsed)) {
    throw new ConfigLoadError(
      `Invalid ${sourceDescription}: expected a JSON object`,
      source,
      filePath,
    );
  }

  return parsed;
};

const readConfigFile = async (
  filePath: string,
  source: Exclude<ConfigSourceName, 'inline'>,
): Promise<Record<string, unknown> | null> => {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return null;
    }
    throw new ConfigLoadError(
      `Failed to read ${describeConfigSource(source, filePath)}: ${nodeError.message}`,
      source,
      filePath,
    );
  }

  return parseConfigContent(content, source, filePath);
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
    sources.push({ name: 'inline', data: parseConfigContent(inlineContent, 'inline') });
  }

  return sources;
};

export const resolveConfig = async (repoRoot: string | null): Promise<ResolvedConfig> => {
  const sources = await loadConfigSources(repoRoot);
  return sources.reduce<ResolvedConfig>(
    (config, source) =>
      deepMerge<ResolvedConfig>(config, source.data as DeepPartial<ResolvedConfig>),
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
    config = deepMerge<ResolvedConfig>(config, data as DeepPartial<ResolvedConfig>);
  }

  return { config, sourceMap };
};
