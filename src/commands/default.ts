import { resolveConfig, resolveConfigWithSources } from '../config/load.js';
import { validateConfig } from '../config/validate.js';
import type { ResolvedConfig } from '../config/types.js';
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
import { exec } from '../util/exec.js';
import yoctoSpinner from 'yocto-spinner';
import { getVerbosity, logBlock, logJson, logVerbose, setVerbosity } from '../util/logger.js';
import { redactObject } from '../util/redact.js';
import {
  applyCliOverrides,
  buildCommitDecision,
  buildPromptInput,
  classifyDefaultCommandError,
  DEFAULT_MAX_SUBJECT_CHARS,
  formatPreview,
  getTokenLimits,
  parseEditedMessage,
  resolveDiffPlan,
  type DefaultCommandArgs,
} from './default-flow.js';

const maybeAutoStage = async (shouldStage: boolean, cwd?: string): Promise<void> => {
  if (!shouldStage) {
    return;
  }
  await exec(['git', 'add', '-A'], { cwd, operation: 'git add all changes' });
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
    if (getVerbosity() >= 1) {
      const resolved = await resolveConfigWithSources(repoRoot);
      config = resolved.config;
      logJson(1, 'config sources', resolved.sourceMap);
    } else {
      config = await resolveConfig(repoRoot);
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

    config = applyCliOverrides(config, args);
    if (getVerbosity() >= 2) {
      logJson(2, 'cli overrides', {
        model: args.model,
        format: args.format,
        lang: args.lang,
        noBody: args.noBody ?? false,
      });
    }
    const { requestedDiffMode, effectiveDiffMode, autoStage } = resolveDiffPlan(config, args);
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

    const limits = getTokenLimits(modelMetadata);

    if (!modelMetadata) {
      console.warn('Model metadata not found. Using conservative token limits.');
    } else if (getVerbosity() >= 2) {
      logJson(2, 'model metadata', modelMetadata);
    }

    const encoding = getEncodingForModel(config.ai.model);
    const promptInput = buildPromptInput(config, fileList);

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
    const commitDecision = buildCommitDecision({
      effectiveDiffMode,
      dryRun: args.dryRun,
      commit: args.commit,
      extraArgs,
    });
    if (getVerbosity() >= 1) {
      logJson(1, 'commit decision', commitDecision);
    }

    if (!commitDecision.shouldCommit) {
      if (commitDecision.skipReason === 'unstaged-without-commit') {
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
    const failure = classifyDefaultCommandError(error);
    console.error(failure.message);
    process.exit(failure.exitCode);
  }
};
