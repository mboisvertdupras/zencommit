import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createTempRepo,
  normalizeOutput,
  runCli,
  toNormalizedLines,
  workspaceRoot,
} from '../helpers/cli.ts';

type ParityBaselineFixture = {
  help: {
    title: string;
    commands: string[];
    options: string[];
  };
  dryRun: {
    mockResponse: {
      subject: string;
      body: string;
    };
    stdout: string;
  };
  exitCodes: {
    configError: number;
    noDiff: number;
    modelError: number;
  };
  stderrIncludes: {
    configError: string;
    noDiff: string;
    modelError: string;
  };
};

const loadBaselineFixture = async (): Promise<ParityBaselineFixture> => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'parity-baseline.json');
  const content = await fs.readFile(fixturePath, 'utf8');
  return JSON.parse(content) as ParityBaselineFixture;
};

describe('parity baseline fixtures', () => {
  it('captures top-level command and option surface from --help', async () => {
    const fixture = await loadBaselineFixture();

    const result = await runCli(['--help']);

    expect(result.code).toBe(0);
    const lines = toNormalizedLines(result.stdout);
    expect(lines).toContain('zencommit');
    expect(lines).toContain(fixture.help.title);

    for (const command of fixture.help.commands) {
      expect(lines.some((line) => line.includes(command))).toBe(true);
    }

    for (const option of fixture.help.options) {
      expect(result.stdout).toContain(option);
    }
  });

  it('captures deterministic dry-run output shape', async () => {
    const fixture = await loadBaselineFixture();
    const repo = await createTempRepo({ prefix: 'zencommit-parity-', withStagedChange: true });

    const result = await runCli(['--dry-run', '--yes'], {
      cwd: repo,
      env: {
        ZENCOMMIT_MOCK_RESPONSE: JSON.stringify(fixture.dryRun.mockResponse),
      },
    });

    expect(result.code).toBe(0);
    expect(normalizeOutput(result.stdout)).toBe(fixture.dryRun.stdout);
    expect(normalizeOutput(result.stderr)).toBe('');
  });

  it('captures key exit-code mappings for config, git/no-diff, and model errors', async () => {
    const fixture = await loadBaselineFixture();

    const configResult = await runCli(['config', 'validate'], {
      cwd: workspaceRoot,
      env: {
        ZENCOMMIT_CONFIG_CONTENT: '{',
      },
    });
    expect(configResult.code).toBe(fixture.exitCodes.configError);
    expect(configResult.stderr).toContain(fixture.stderrIncludes.configError);

    const noDiffRepo = await createTempRepo({ prefix: 'zencommit-parity-' });
    const noDiffResult = await runCli(['--dry-run', '--yes'], {
      cwd: noDiffRepo,
      env: {
        ZENCOMMIT_MOCK_RESPONSE: JSON.stringify(fixture.dryRun.mockResponse),
      },
    });
    expect(noDiffResult.code).toBe(fixture.exitCodes.noDiff);
    expect(noDiffResult.stderr).toContain(fixture.stderrIncludes.noDiff);

    const modelErrorRepo = await createTempRepo({
      prefix: 'zencommit-parity-',
      withStagedChange: true,
    });
    await fs.writeFile(path.join(modelErrorRepo, 'models.metadata.json'), '{}\n', 'utf8');
    const modelErrorConfig = JSON.stringify({
      metadata: {
        provider: 'local',
        providers: {
          local: {
            path: './models.metadata.json',
          },
        },
      },
    });

    const modelErrorResult = await runCli(
      ['--dry-run', '--yes', '--model', 'unsupported-provider/mock-model'],
      {
        cwd: modelErrorRepo,
        env: {
          ZENCOMMIT_CONFIG_CONTENT: modelErrorConfig,
        },
      },
    );

    expect(modelErrorResult.code).toBe(fixture.exitCodes.modelError);
    expect(modelErrorResult.stderr).toContain(fixture.stderrIncludes.modelError);
  });
});
