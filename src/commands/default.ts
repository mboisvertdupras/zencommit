import { ConfigLoadError, resolveConfig, resolveConfigWithSources } from '../config/load.js';
import { validateConfig } from '../config/validate.js';
import type { CommitStyle, DiffMode, ResolvedConfig } from '../config/types.js';
import { createMetadataResolver } from '../metadata/index.js';
import { getRepoRoot } from '../git/repo.js';
import { getDiff, getFileList, getFileSummary } from '../git/diff.js';
import { commitMessage, pushChanges } from '../git/commit.js';
import { buildPrompt, buildPromptWithoutDiff } from '../llm/prompt.js';
import {
  computeTokenBudget,
  countTokens,
  freeEncoding,
  getEncodingForModel,
} from '../llm/tokens.js';
import { truncateDiffByFile, truncateDiffSmart } from '../llm/truncate.js';
import { generateCommitMessage } from '../llm/generate.js';
import { confirmCommit } from '../ui/prompts.js';
import { openEditor } from '../ui/editor.js';
import { exec, ExecError } from '../util/exec.js';
import yoctoSpinner from 'yocto-spinner';
import { getVerbosity, logBlock, logJson, logVerbose, setVerbosity } from '../util/logger.js';
import { redactObject } from '../util/redact.js';

const DEFAULT_MAX_SUBJECT_CHARS = 72;

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

const applyOverrides = (config: ResolvedConfig, args: DefaultCommandArgs): ResolvedConfig => {
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

const resolveDiffMode = (config: ResolvedConfig, args: DefaultCommandArgs): DiffMode => {
  if (args.unstaged) {
    return 'unstaged';
  }
  if (args.all) {
    return 'staged';
  }
  return config.git.diffMode;
};

const maybeAutoStage = async (shouldStage: boolean, cwd?: string): Promise<void> => {
  if (!shouldStage) {
    return;
  }
  await exec(['git', 'add', '-A'], { cwd });
};

const formatPreview = (subject: string, body: string): string => {
  if (body.trim().length === 0) {
    return subject.trim();
  }
  return `${subject.trim()}\n\n${body.trim()}`;
};

const parseEditedMessage = (text: string): { subject: string; body: string } => {
  const lines = text.split(/\r?\n/);
  const subject = lines.shift() ?? '';
  const body = lines.join('\n').trim();
  return { subject: subject.trim(), body };
};

export const runDefaultCommand = async (args: DefaultCommandArgs): Promise<void> => {
  try {
    if (typeof args.verbose === 'number') {
      setVerbosity(args.verbose);
    }
    const repoRoot = await getRepoRoot();
    if (!repoRoot) {
      console.error('Not inside a git repository.');
      process.exit(3);
    }
    logVerbose(1, `repo root: ${repoRoot}`);

    let config: ResolvedConfig;
    try {
      if (getVerbosity() >= 1) {
        const resolved = await resolveConfigWithSources(repoRoot);
        config = resolved.config;
        logJson(1, 'config sources', resolved.sourceMap);
      } else {
        config = await resolveConfig(repoRoot);
      }
    } catch (error) {
      if (error instanceof ConfigLoadError) {
        console.error(error.message);
        process.exit(2);
      }
      throw error;
    }
    if (getVerbosity() >= 2) {
      logJson(2, 'resolved config', redactObject(config));
    }
    const validation = validateConfig(config);
    if (!validation.valid) {
      console.error('Config validation failed:');
      validation.errors.forEach((error) => {
        console.error(`- ${error.path}: ${error.message}`);
      });
      process.exit(2);
    }

    config = applyOverrides(config, args);
    if (getVerbosity() >= 2) {
      logJson(2, 'cli overrides', {
        model: args.model,
        format: args.format,
        lang: args.lang,
        noBody: args.noBody ?? false,
      });
    }
    const requestedDiffMode = resolveDiffMode(config, args);
    const effectiveDiffMode: DiffMode = requestedDiffMode === 'all' ? 'staged' : requestedDiffMode;
    const autoStage = args.all || config.git.autoStage || requestedDiffMode === 'all';
    logVerbose(
      1,
      `diff mode: requested=${requestedDiffMode} effective=${effectiveDiffMode} autoStage=${autoStage}`,
    );

    if (autoStage && effectiveDiffMode !== 'unstaged') {
      await maybeAutoStage(true, repoRoot);
    }

    const useSmart = config.diff.truncateStrategy === 'smart';
    const diffText = await getDiff({ mode: effectiveDiffMode, cwd: repoRoot, compact: useSmart });
    if (getVerbosity() >= 2) {
      const diffLines = diffText ? diffText.split(/\r?\n/).length : 0;
      logVerbose(2, `diff length: ${diffText.length} chars, ${diffLines} lines`);
    }

    if (!diffText.trim()) {
      console.error('No diff to summarize.');
      process.exit(3);
    }

    const fileList = config.diff.includeFileList
      ? (await getFileList({ mode: effectiveDiffMode, cwd: repoRoot }))
          .slice(0, config.diff.maxFiles)
          .join('\n')
      : '';
    if (getVerbosity() >= 2) {
      const fileCount = fileList ? fileList.split(/\r?\n/).length : 0;
      logVerbose(2, `file list: ${fileCount} files`);
    }

    const metadataResolver = createMetadataResolver(config.metadata, repoRoot);
    const modelMetadata = await metadataResolver.getModel(config.ai.model);

    const limits = modelMetadata?.limits ?? ({ context: 8000, input: 8000, output: null } as const);

    if (!modelMetadata) {
      console.warn('Model metadata not found. Using conservative token limits.');
    } else if (getVerbosity() >= 2) {
      logJson(2, 'model metadata', modelMetadata);
    }

    const encoding = getEncodingForModel(config.ai.model);
    const promptInput = {
      style: config.commit.style,
      language: config.commit.language,
      includeBody: config.commit.includeBody,
      emoji: config.commit.emoji,
      maxSubjectChars: DEFAULT_MAX_SUBJECT_CHARS,
      fileList,
      diffText: '',
    };

    const promptWithoutDiff = await buildPromptWithoutDiff(promptInput);
    const overheadTokens = countTokens(
      `${promptWithoutDiff.system}\n${promptWithoutDiff.user}`,
      encoding,
    );

    const budget = computeTokenBudget(limits, config.ai.maxOutputTokens, overheadTokens);
    if (getVerbosity() >= 2) {
      logJson(2, 'token budget', budget);
    }

    let truncatedText = '';
    if (useSmart) {
      const fileSummary = await getFileSummary({ mode: effectiveDiffMode, cwd: repoRoot });
      const truncated = truncateDiffSmart(
        fileSummary,
        diffText,
        budget.availableTokens,
        config.diff,
        encoding,
      );
      truncatedText = truncated.text;
      if (getVerbosity() >= 2) {
        logVerbose(2, `truncation: mode=${truncated.mode} usedTokens=${truncated.usedTokens}`);
      }
    } else if (budget.availableTokens <= 0) {
      const fileSummary = await getFileSummary({ mode: effectiveDiffMode, cwd: repoRoot });
      truncatedText = fileSummary.trim() ? `File summary:\\n${fileSummary.trim()}` : fileList;
    } else {
      const truncated = truncateDiffByFile(diffText, budget.availableTokens, encoding);
      truncatedText = truncated.text;
      if (getVerbosity() >= 2) {
        logVerbose(2, `truncation: mode=${truncated.mode} usedTokens=${truncated.usedTokens}`);
      }
    }

    freeEncoding(encoding);

    const prompt = await buildPrompt({ ...promptInput, diffText: truncatedText });
    if (getVerbosity() >= 3) {
      logBlock(3, 'prompt system', prompt.system);
      logBlock(3, 'prompt user', prompt.user);
    }
    const spinner = process.stderr.isTTY
      ? yoctoSpinner({ text: 'Generating commit message...' }).start()
      : null;
    let message: { subject: string; body: string };
    try {
      if (getVerbosity() >= 2) {
        logJson(2, 'llm request', {
          modelId: config.ai.model,
          temperature: config.ai.temperature,
          maxOutputTokens: Math.min(config.ai.maxOutputTokens, budget.outputTokens),
          timeoutMs: config.ai.timeoutMs,
          style: config.commit.style,
        });
      }
      message = await generateCommitMessage({
        modelId: config.ai.model,
        system: prompt.system,
        user: prompt.user,
        temperature: config.ai.temperature,
        maxOutputTokens: Math.min(config.ai.maxOutputTokens, budget.outputTokens),
        timeoutMs: config.ai.timeoutMs,
        maxSubjectChars: DEFAULT_MAX_SUBJECT_CHARS,
        style: config.commit.style,
        openaiCompatible: config.ai.openaiCompatible,
      });
      spinner?.success('Generated commit message.');
      if (getVerbosity() >= 2) {
        logJson(2, 'llm response', message);
      }
    } catch (error) {
      spinner?.error('Failed to generate commit message.');
      throw error;
    }

    if (!config.commit.includeBody) {
      message = { ...message, body: '' };
    }

    console.log('\n' + formatPreview(message.subject, message.body) + '\n');

    const extraArgs = args['--'] ?? [];
    const allowCommit = effectiveDiffMode !== 'unstaged' || args.commit;
    const shouldCommit = allowCommit && !args.dryRun;
    if (getVerbosity() >= 1) {
      logJson(1, 'commit decision', {
        allowCommit,
        shouldCommit,
        extraArgs,
        dryRun: args.dryRun ?? false,
      });
    }

    if (!shouldCommit) {
      if (effectiveDiffMode === 'unstaged' && !args.commit) {
        console.warn('Unstaged diff selected; skipping commit unless --commit is provided.');
      }
      process.exit(0);
    }

    const skipConfirm = args.yes || !config.git.confirmBeforeCommit;
    if (getVerbosity() >= 2) {
      logVerbose(2, `commit confirmation: ${skipConfirm ? 'skipped' : 'prompted'}`);
    }
    if (!skipConfirm) {
      const action = await confirmCommit('Commit with this message?');
      if (action === 'cancel') {
        process.exit(0);
      }
      if (action === 'edit') {
        logVerbose(2, 'commit message: opening editor');
        const edited = await openEditor(formatPreview(message.subject, message.body));
        const parsed = parseEditedMessage(edited);
        message = { subject: parsed.subject, body: parsed.body };
      }
    }

    await commitMessage(message.subject, message.body, extraArgs, repoRoot);
    if (args.push) {
      logVerbose(1, 'pushing commit to remote');
      await pushChanges(repoRoot);
    }
  } catch (error) {
    if (error instanceof ExecError) {
      console.error(error.stderr || error.message);
      process.exit(3);
    }
    const message = (error as Error).message ?? 'Unknown error.';
    if (/API key/i.test(message)) {
      console.error(message);
      console.error('Run `zencommit auth login` to store credentials.');
      process.exit(2);
    }
    console.error(message);
    process.exit(4);
  }
};
