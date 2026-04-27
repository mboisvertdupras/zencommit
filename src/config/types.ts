export type CommitStyle = 'conventional' | 'freeform';
export type DiffMode = 'staged' | 'unstaged' | 'all';
export type TruncateStrategy = 'byFile' | 'smart';
export type MetadataProviderName = 'auto' | 'modelsdev' | 'local';

export interface AiConfig {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  openaiCompatible?: OpenAICompatibleConfig;
}

export interface OpenAICompatibleConfig {
  baseUrl?: string;
  name?: string;
}

export interface CommitConfig {
  style: CommitStyle;
  language: string;
  includeBody: boolean;
  emoji: boolean;
}

export interface GitConfig {
  diffMode: DiffMode;
  autoStage: boolean;
  confirmBeforeCommit: boolean;
}

export interface DiffSmartConfig {
  maxAddedLinesPerHunk: number;
  maxRemovedLinesPerHunk: number;
}

export interface DiffConfig {
  truncateStrategy: TruncateStrategy;
  includeFileList: boolean;
  maxFiles: number;
  smart: DiffSmartConfig;
}

export interface ModelsDevProviderConfig {
  url: string;
  cacheTtlHours: number;
}

export interface LocalProviderConfig {
  path: string;
}

export interface MetadataProvidersConfig {
  modelsdev: ModelsDevProviderConfig;
  local: LocalProviderConfig;
}

export interface MetadataConfig {
  provider: MetadataProviderName;
  fallbackOrder: Array<Exclude<MetadataProviderName, 'auto'>>;
  providers: MetadataProvidersConfig;
}

export interface ResolvedConfig {
  ai: AiConfig;
  commit: CommitConfig;
  git: GitConfig;
  diff: DiffConfig;
  metadata: MetadataConfig;
}

export const defaultConfig: ResolvedConfig = {
  ai: {
    model: 'openai/gpt-5',
    temperature: 0.2,
    maxOutputTokens: 4096,
    timeoutMs: 20000,
  },
  commit: {
    style: 'conventional',
    language: 'en',
    includeBody: true,
    emoji: false,
  },
  git: {
    diffMode: 'staged',
    autoStage: false,
    confirmBeforeCommit: true,
  },
  diff: {
    truncateStrategy: 'smart',
    includeFileList: true,
    maxFiles: 200,
    smart: {
      maxAddedLinesPerHunk: 12,
      maxRemovedLinesPerHunk: 12,
    },
  },
  metadata: {
    provider: 'auto',
    fallbackOrder: ['modelsdev', 'local'],
    providers: {
      modelsdev: {
        url: 'https://models.dev/api.json',
        cacheTtlHours: 24,
      },
      local: {
        path: './models.metadata.json',
      },
    },
  },
};
