import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type CliResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

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

const normalizeOutput = (text: string): string => text.replace(/\r\n/g, '\n');

const runCli = (
  args: [string, ...string[]],
  cwd: string,
  env: Record<string, string>,
): Promise<CliResult> =>
  new Promise((resolve) => {
    const proc = spawn(args[0], args.slice(1), {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });

const createTempRepo = async (withStagedChange: boolean): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zencommit-parity-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });

  if (withStagedChange) {
    await fs.writeFile(path.join(dir, 'file.txt'), 'hello\n', 'utf8');
    execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  }

  return dir;
};

const toNormalizedLines = (text: string): string[] =>
  normalizeOutput(text)
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0);

const loadBaselineFixture = async (): Promise<ParityBaselineFixture> => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'parity-baseline.json');
  const content = await fs.readFile(fixturePath, 'utf8');
  return JSON.parse(content) as ParityBaselineFixture;
};

describe('parity baseline fixtures', () => {
  it('captures top-level command and option surface from --help', async () => {
    const fixture = await loadBaselineFixture();
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const workspaceRoot = path.join(__dirname, '..', '..');
    const entry = path.join(workspaceRoot, 'index.ts');

    const result = await runCli(['bun', entry, '--help'], workspaceRoot, {});

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
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const workspaceRoot = path.join(__dirname, '..', '..');
    const entry = path.join(workspaceRoot, 'index.ts');
    const repo = await createTempRepo(true);

    const result = await runCli(['bun', entry, '--dry-run', '--yes'], repo, {
      ZENCOMMIT_MOCK_RESPONSE: JSON.stringify(fixture.dryRun.mockResponse),
    });

    expect(result.code).toBe(0);
    expect(normalizeOutput(result.stdout)).toBe(fixture.dryRun.stdout);
    expect(normalizeOutput(result.stderr)).toBe('');
  });

  it('captures key exit-code mappings for config, git/no-diff, and model errors', async () => {
    const fixture = await loadBaselineFixture();
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const workspaceRoot = path.join(__dirname, '..', '..');
    const entry = path.join(workspaceRoot, 'index.ts');

    const configResult = await runCli(['bun', entry, 'config', 'validate'], workspaceRoot, {
      ZENCOMMIT_CONFIG_CONTENT: '{',
    });
    expect(configResult.code).toBe(fixture.exitCodes.configError);
    expect(configResult.stderr).toContain(fixture.stderrIncludes.configError);

    const noDiffRepo = await createTempRepo(false);
    const noDiffResult = await runCli(['bun', entry, '--dry-run', '--yes'], noDiffRepo, {
      ZENCOMMIT_MOCK_RESPONSE: JSON.stringify(fixture.dryRun.mockResponse),
    });
    expect(noDiffResult.code).toBe(fixture.exitCodes.noDiff);
    expect(noDiffResult.stderr).toContain(fixture.stderrIncludes.noDiff);

    const modelErrorRepo = await createTempRepo(true);
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
      ['bun', entry, '--dry-run', '--yes', '--model', 'unsupported-provider/mock-model'],
      modelErrorRepo,
      {
        ZENCOMMIT_CONFIG_CONTENT: modelErrorConfig,
      },
    );

    expect(modelErrorResult.code).toBe(fixture.exitCodes.modelError);
    expect(modelErrorResult.stderr).toContain(fixture.stderrIncludes.modelError);
  });
});
