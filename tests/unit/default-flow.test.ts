import { describe, expect, it } from 'vitest';
import { ConfigLoadError } from '../../src/config/load.js';
import { defaultConfig, type ResolvedConfig } from '../../src/config/types.js';
import {
  applyCliOverrides,
  buildCommitDecision,
  classifyDefaultCommandError,
  formatPreview,
  parseEditedMessage,
  resolveDiffPlan,
} from '../../src/commands/default-flow.js';
import { ExecError } from '../../src/util/exec.js';

const configFixture = (overrides: Partial<ResolvedConfig> = {}): ResolvedConfig => ({
  ...structuredClone(defaultConfig),
  ...overrides,
});

describe('default command flow helpers', () => {
  it('applies CLI overrides without mutating the resolved config', () => {
    const config = configFixture();

    const updated = applyCliOverrides(config, {
      model: 'anthropic/claude-test',
      format: 'freeform',
      lang: 'fr',
      noBody: true,
    });

    expect(updated).toMatchObject({
      ai: { model: 'anthropic/claude-test' },
      commit: { style: 'freeform', language: 'fr', includeBody: false },
    });
    expect(config.ai.model).toBe(defaultConfig.ai.model);
    expect(config.commit).toMatchObject(defaultConfig.commit);
  });

  it('resolves diff-mode decisions with unstaged taking precedence over all', () => {
    const allFromConfig = resolveDiffPlan(
      configFixture({ git: { ...defaultConfig.git, diffMode: 'all' } }),
      {},
    );
    expect(allFromConfig).toEqual({
      requestedDiffMode: 'all',
      effectiveDiffMode: 'staged',
      autoStage: true,
    });

    const allFlag = resolveDiffPlan(configFixture(), { all: true });
    expect(allFlag).toEqual({
      requestedDiffMode: 'staged',
      effectiveDiffMode: 'staged',
      autoStage: true,
    });

    const unstagedWins = resolveDiffPlan(
      configFixture({ git: { ...defaultConfig.git, autoStage: true } }),
      {
        all: true,
        unstaged: true,
      },
    );
    expect(unstagedWins).toEqual({
      requestedDiffMode: 'unstaged',
      effectiveDiffMode: 'unstaged',
      autoStage: true,
    });
  });

  it('formats preview text and parses edited messages with an empty body', () => {
    expect(formatPreview(' feat: subject ', '  ')).toBe('feat: subject');
    expect(formatPreview(' feat: subject ', ' Body text\n')).toBe('feat: subject\n\nBody text');

    expect(parseEditedMessage('  fix: edited subject  \n\n  ')).toEqual({
      subject: 'fix: edited subject',
      body: '',
    });
    expect(parseEditedMessage('feat: edited\n\nBody line\n')).toEqual({
      subject: 'feat: edited',
      body: 'Body line',
    });
  });

  it('classifies commit decisions for dry-run, unstaged, and explicit commit flows', () => {
    expect(
      buildCommitDecision({
        effectiveDiffMode: 'staged',
        dryRun: true,
        extraArgs: ['--no-verify'],
      }),
    ).toEqual({
      allowCommit: true,
      shouldCommit: false,
      extraArgs: ['--no-verify'],
      dryRun: true,
      skipReason: 'dry-run',
    });

    expect(buildCommitDecision({ effectiveDiffMode: 'unstaged', commit: false })).toMatchObject({
      allowCommit: false,
      shouldCommit: false,
      skipReason: 'unstaged-without-commit',
    });

    expect(buildCommitDecision({ effectiveDiffMode: 'unstaged', commit: true })).toMatchObject({
      allowCommit: true,
      shouldCommit: true,
      skipReason: null,
    });
  });

  it('classifies runtime errors into stable exit-code buckets without leaking secrets', () => {
    const configError = new ConfigLoadError(
      'Invalid inline config from ZENCOMMIT_CONFIG_CONTENT',
      'inline',
    );
    expect(classifyDefaultCommandError(configError)).toEqual({
      exitCode: 2,
      message: 'Invalid inline config from ZENCOMMIT_CONFIG_CONTENT',
    });

    const execError = new ExecError(
      'git add all changes failed: git add -A (exit 1)',
      1,
      '',
      'token=abc123',
      {
        operation: 'git add all changes',
        safeStderr: 'token=<redacted>',
      },
    );
    expect(classifyDefaultCommandError(execError)).toEqual({
      exitCode: 3,
      message: 'token=<redacted>',
    });

    expect(classifyDefaultCommandError(new Error('Missing API key for OPENAI_API_KEY'))).toEqual({
      exitCode: 2,
      message:
        'Missing API key for OPENAI_API_KEY\nRun `zencommit auth login` to store credentials.',
    });

    expect(
      classifyDefaultCommandError(new Error('Unsupported model provider: internal/mock')),
    ).toEqual({
      exitCode: 4,
      message: 'Unsupported model provider: internal/mock',
    });
  });
});
