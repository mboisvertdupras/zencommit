import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptPath = resolve(process.cwd(), 'scripts/emit-verify-passed.mjs');

function runEmitVerifyPassed(args: string[]) {
  return spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
  });
}

function runEmitVerifyPassedWithFakeRalph(args: string[]) {
  const fakeBinDir = mkdtempSync(resolve(tmpdir(), 'emit-verify-passed-'));
  const fakeRalphPath = resolve(fakeBinDir, 'ralph');
  const capturePath = resolve(fakeBinDir, 'ralph-argv.json');

  const fakeRalphSource = `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.RALPH_CAPTURE_PATH, JSON.stringify(process.argv.slice(2)));\n`;
  writeFileSync(fakeRalphPath, fakeRalphSource);
  chmodSync(fakeRalphPath, 0o755);

  try {
    const result = spawnSync('node', [scriptPath, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ''}`,
        RALPH_CAPTURE_PATH: capturePath,
      },
    });

    const emittedArgs = JSON.parse(readFileSync(capturePath, 'utf8')) as string[];
    return { result, emittedArgs };
  } finally {
    rmSync(fakeBinDir, { recursive: true, force: true });
  }
}

function runEmitVerifyPassedNpmScriptWithFakeRalph(args: string[]) {
  const fakeBinDir = mkdtempSync(resolve(tmpdir(), 'emit-verify-passed-npm-'));
  const fakeRalphPath = resolve(fakeBinDir, 'ralph');
  const capturePath = resolve(fakeBinDir, 'ralph-argv.json');

  const fakeRalphSource = `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.RALPH_CAPTURE_PATH, JSON.stringify(process.argv.slice(2)));\n`;
  writeFileSync(fakeRalphPath, fakeRalphSource);
  chmodSync(fakeRalphPath, 0o755);

  try {
    const result = spawnSync('npm', ['run', 'emit:verify-passed', '--', ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ''}`,
        RALPH_CAPTURE_PATH: capturePath,
      },
    });

    const emittedArgs = JSON.parse(readFileSync(capturePath, 'utf8')) as string[];
    return { result, emittedArgs };
  } finally {
    rmSync(fakeBinDir, { recursive: true, force: true });
  }
}

describe('emit-verify-passed helper', () => {
  it('prints grouped and flattened quality statuses in the verify payload', () => {
    const result = runEmitVerifyPassed([
      '--tests',
      'pass',
      '--coverage',
      'not_configured',
      '--lint',
      'pass',
      '--audit',
      'pass',
      '--mutation',
      'not_configured',
      '--complexity',
      'not_configured',
      '--task-id',
      'task-123',
      '--commit',
      'abc1234',
      '--summary',
      'Verifier checks passed',
      '--dry-run',
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');

    const payload = JSON.parse(result.stdout.trim()) as Record<string, unknown>;

    expect(payload).toEqual({
      task_id: 'task-123',
      commit: 'abc1234',
      summary: 'Verifier checks passed',
      quality: {
        tests: 'pass',
        coverage: 'not_configured',
        lint: 'pass',
        audit: 'pass',
        mutation: 'not_configured',
        complexity: 'not_configured',
      },
      'quality.tests': 'pass',
      'quality.coverage': 'not_configured',
      'quality.lint': 'pass',
      'quality.audit': 'pass',
      'quality.mutation': 'not_configured',
      'quality.complexity': 'not_configured',
    });

    expect(payload.quality_report).toBeUndefined();
  });

  it('defaults omitted quality flags to not_configured in grouped and flattened keys', () => {
    const result = runEmitVerifyPassed(['--tests', 'pass', '--lint', 'pass', '--dry-run']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');

    const payload = JSON.parse(result.stdout.trim()) as Record<string, unknown>;

    expect(payload).toMatchObject({
      quality: {
        tests: 'pass',
        coverage: 'not_configured',
        lint: 'pass',
        audit: 'not_configured',
        mutation: 'not_configured',
        complexity: 'not_configured',
      },
      'quality.tests': 'pass',
      'quality.coverage': 'not_configured',
      'quality.lint': 'pass',
      'quality.audit': 'not_configured',
      'quality.mutation': 'not_configured',
      'quality.complexity': 'not_configured',
    });
  });

  it('accepts --flag=value syntax for quality and metadata flags', () => {
    const result = runEmitVerifyPassed([
      '--tests=pass',
      '--coverage=not_configured',
      '--lint=pass',
      '--audit=pass',
      '--mutation=not_configured',
      '--complexity=not_configured',
      '--task-id=task-xyz',
      '--commit=abc1234',
      '--summary=Verifier checks passed',
      '--dry-run',
    ]);

    expect(result.status).toBe(0);

    const payload = JSON.parse(result.stdout.trim()) as Record<string, unknown>;

    expect(payload).toMatchObject({
      task_id: 'task-xyz',
      commit: 'abc1234',
      summary: 'Verifier checks passed',
      quality: {
        tests: 'pass',
        coverage: 'not_configured',
        lint: 'pass',
        audit: 'pass',
        mutation: 'not_configured',
        complexity: 'not_configured',
      },
      'quality.tests': 'pass',
      'quality.coverage': 'not_configured',
      'quality.lint': 'pass',
      'quality.audit': 'pass',
      'quality.mutation': 'not_configured',
      'quality.complexity': 'not_configured',
    });
  });

  it('emits canonical payload through ralph in non-dry-run mode', () => {
    const { result, emittedArgs } = runEmitVerifyPassedWithFakeRalph([
      '--tests',
      'pass',
      '--lint',
      'pass',
      '--audit',
      'pass',
      '--task-id',
      'task-xyz',
      '--commit',
      'abc1234',
      '--summary',
      'Verifier checks passed',
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');

    expect(emittedArgs.slice(0, 3)).toEqual(['emit', 'verify.passed', '--json']);

    const payload = JSON.parse(emittedArgs[3]) as Record<string, unknown>;
    expect(payload).toMatchObject({
      task_id: 'task-xyz',
      commit: 'abc1234',
      summary: 'Verifier checks passed',
      quality: {
        tests: 'pass',
        coverage: 'not_configured',
        lint: 'pass',
        audit: 'pass',
        mutation: 'not_configured',
        complexity: 'not_configured',
      },
      'quality.tests': 'pass',
      'quality.coverage': 'not_configured',
      'quality.lint': 'pass',
      'quality.audit': 'pass',
      'quality.mutation': 'not_configured',
      'quality.complexity': 'not_configured',
    });
  });

  it('emits canonical payload through npm script path used by verifier', () => {
    const { result, emittedArgs } = runEmitVerifyPassedNpmScriptWithFakeRalph([
      '--tests',
      'pass',
      '--coverage',
      'pass',
      '--lint',
      'pass',
      '--audit',
      'pass',
      '--mutation',
      'not_configured',
      '--complexity',
      'not_configured',
      '--task-id',
      'task-npm',
      '--commit',
      'abc1234',
      '--summary',
      'Verifier checks passed',
    ]);

    expect(result.status).toBe(0);
    expect(emittedArgs.slice(0, 3)).toEqual(['emit', 'verify.passed', '--json']);

    const payload = JSON.parse(emittedArgs[3]) as Record<string, unknown>;
    expect(payload).toMatchObject({
      task_id: 'task-npm',
      commit: 'abc1234',
      summary: 'Verifier checks passed',
      quality: {
        tests: 'pass',
        coverage: 'pass',
        lint: 'pass',
        audit: 'pass',
        mutation: 'not_configured',
        complexity: 'not_configured',
      },
      'quality.tests': 'pass',
      'quality.coverage': 'pass',
      'quality.lint': 'pass',
      'quality.audit': 'pass',
      'quality.mutation': 'not_configured',
      'quality.complexity': 'not_configured',
    });
  });

  it('emits all quality dimensions when non-dry-run omits quality flags', () => {
    const { result, emittedArgs } = runEmitVerifyPassedWithFakeRalph([
      '--task-id',
      'task-xyz',
      '--commit',
      'abc1234',
      '--summary',
      'Verifier checks passed',
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');

    const payload = JSON.parse(emittedArgs[3]) as Record<string, unknown>;
    expect(payload).toMatchObject({
      task_id: 'task-xyz',
      commit: 'abc1234',
      summary: 'Verifier checks passed',
      quality: {
        tests: 'not_configured',
        coverage: 'not_configured',
        lint: 'not_configured',
        audit: 'not_configured',
        mutation: 'not_configured',
        complexity: 'not_configured',
      },
      'quality.tests': 'not_configured',
      'quality.coverage': 'not_configured',
      'quality.lint': 'not_configured',
      'quality.audit': 'not_configured',
      'quality.mutation': 'not_configured',
      'quality.complexity': 'not_configured',
    });
  });

  it('fails when a quality status is invalid', () => {
    const result = runEmitVerifyPassed([
      '--tests',
      'pass',
      '--coverage',
      'unknown',
      '--lint',
      'pass',
      '--audit',
      'pass',
      '--mutation',
      'not_configured',
      '--complexity',
      'not_configured',
      '--dry-run',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid status for --coverage: unknown');
  });

  it('fails on unknown flags to prevent silently malformed payloads', () => {
    const result = runEmitVerifyPassed(['--tests', 'pass', '--quality.tests', 'pass', '--dry-run']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown flag: --quality.tests');
  });
});
