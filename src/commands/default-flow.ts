import { ConfigLoadError } from '../config/load.js';
import type { CommitStyle, DiffMode, ResolvedConfig } from '../config/types.js';
import type { PromptInput } from '../llm/prompt.js';
import type { ModelLimits, ModelMetadata } from '../metadata/types.js';
import { ExecError } from '../util/exec.js';

export const DEFAULT_MAX_SUBJECT_CHARS = 72;

const CONSERVATIVE_TOKEN_LIMITS: ModelLimits = { context: 8000, input: 8000, output: null };

export interface DefaultCommandArgs {
  yes?: boolean;
  dryRun?: boolean;
  all?: boolean;
  unstaged?: boolean;
  commit?: boolean;
  push?: boolean;
  model?: string;
  format?: CommitStyle;
  lang?: string;
  noBody?: boolean;
  verbose?: number;
  '--'?: string[];
}

export interface DiffPlan {
  requestedDiffMode: DiffMode;
  effectiveDiffMode: Exclude<DiffMode, 'all'>;
  autoStage: boolean;
}

export interface CommitDecisionInput {
  effectiveDiffMode: Exclude<DiffMode, 'all'>;
  dryRun?: boolean;
  commit?: boolean;
  extraArgs?: string[];
}

export interface CommitDecision {
  allowCommit: boolean;
  shouldCommit: boolean;
  extraArgs: string[];
  dryRun: boolean;
  skipReason: 'dry-run' | 'unstaged-without-commit' | null;
}

export interface DefaultCommandErrorClassification {
  boundary: 'config' | 'git' | 'auth' | 'model' | 'unknown';
  exitCode: 2 | 3 | 4;
  message: string;
}

export const applyCliOverrides = (
  config: ResolvedConfig,
  args: DefaultCommandArgs,
): ResolvedConfig => {
  const updated = { ...config };
  if (args.model) {
    updated.ai = { ...updated.ai, model: args.model };
  }
  if (args.format) {
    updated.commit = { ...updated.commit, style: args.format };
  }
  if (args.lang) {
    updated.commit = { ...updated.commit, language: args.lang };
  }
  if (args.noBody) {
    updated.commit = { ...updated.commit, includeBody: false };
  }
  return updated;
};

export const resolveDiffPlan = (config: ResolvedConfig, args: DefaultCommandArgs): DiffPlan => {
  const requestedDiffMode: DiffMode = args.unstaged
    ? 'unstaged'
    : args.all
      ? 'staged'
      : config.git.diffMode;
  const effectiveDiffMode = requestedDiffMode === 'all' ? 'staged' : requestedDiffMode;
  return {
    requestedDiffMode,
    effectiveDiffMode,
    autoStage: Boolean(args.all || config.git.autoStage || requestedDiffMode === 'all'),
  };
};

export const formatPreview = (subject: string, body: string): string => {
  if (body.trim().length === 0) {
    return subject.trim();
  }
  return `${subject.trim()}\n\n${body.trim()}`;
};

export const parseEditedMessage = (text: string): { subject: string; body: string } => {
  const lines = text.split(/\r?\n/);
  const subject = lines.shift() ?? '';
  const body = lines.join('\n').trim();
  return { subject: subject.trim(), body };
};

export const buildCommitDecision = ({
  effectiveDiffMode,
  dryRun = false,
  commit = false,
  extraArgs = [],
}: CommitDecisionInput): CommitDecision => {
  const allowCommit = effectiveDiffMode !== 'unstaged' || commit;
  const shouldCommit = allowCommit && !dryRun;
  const skipReason = shouldCommit ? null : dryRun ? 'dry-run' : 'unstaged-without-commit';
  return { allowCommit, shouldCommit, extraArgs, dryRun, skipReason };
};

export const getTokenLimits = (modelMetadata: ModelMetadata | null): ModelLimits =>
  modelMetadata?.limits ?? CONSERVATIVE_TOKEN_LIMITS;

export const buildPromptInput = (
  config: ResolvedConfig,
  fileList: string,
  diffText = '',
): PromptInput => ({
  style: config.commit.style,
  language: config.commit.language,
  includeBody: config.commit.includeBody,
  emoji: config.commit.emoji,
  maxSubjectChars: DEFAULT_MAX_SUBJECT_CHARS,
  fileList,
  diffText,
});

export const classifyDefaultCommandError = (error: unknown): DefaultCommandErrorClassification => {
  if (error instanceof ConfigLoadError) {
    return { boundary: 'config', exitCode: 2, message: error.message };
  }

  if (error instanceof ExecError) {
    return {
      boundary: 'git',
      exitCode: 3,
      message: error.safeStderr || error.message,
    };
  }

  const message = error instanceof Error ? error.message : 'Unknown error.';
  if (/API key/i.test(message)) {
    return {
      boundary: 'auth',
      exitCode: 2,
      message: `${message}\nRun \`zencommit auth login\` to store credentials.`,
    };
  }

  if (
    /Unsupported model provider|Invalid commit message response|Model call timed out/i.test(message)
  ) {
    return { boundary: 'model', exitCode: 4, message };
  }

  return { boundary: 'unknown', exitCode: 4, message };
};
