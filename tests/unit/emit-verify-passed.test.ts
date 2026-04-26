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

function parsePayloadLines(payload: string) {
  const lines = payload
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return new Map(
    lines.map((line) => {
      const separator = line.indexOf(':');
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      return [key, value] as const;
    }),
  );
}

function parseEmittedPayload(emittedArgs: string[]) {
  const payload = emittedArgs[2];
  if (!payload) {
    throw new Error('Expected ralph payload argument');
  }
  return parsePayloadLines(payload);
}

function expectThresholdEvidence(payload: Map<string, string>) {
  expect(payload.get('threshold.quality.tests')).toBe('pass');
  expect(payload.get('threshold.quality.coverage')).toBe('>=80%');
  expect(payload.get('threshold.quality.lint')).toBe('pass');
  expect(payload.get('threshold.quality.audit')).toBe('pass');
  expect(payload.get('threshold.quality.mutation')).toBe('>=70%');
  expect(payload.get('threshold.quality.complexity')).toBe('<=10');

  expect(payload.get('evidence.quality.tests')).toContain('input_status=');
  expect(payload.get('evidence.quality.tests')).toContain('emitted=');
  expect(payload.get('evidence.quality.coverage')).toContain('input_status=');
  expect(payload.get('evidence.quality.coverage')).toContain('emitted=');
  expect(payload.get('evidence.quality.lint')).toContain('input_status=');
  expect(payload.get('evidence.quality.lint')).toContain('emitted=');
  expect(payload.get('evidence.quality.audit')).toContain('input_status=');
  expect(payload.get('evidence.quality.audit')).toContain('emitted=');
  expect(payload.get('evidence.quality.mutation')).toContain('input_status=');
  expect(payload.get('evidence.quality.mutation')).toContain('emitted=');
  expect(payload.get('evidence.quality.complexity')).toContain('input_status=');
  expect(payload.get('evidence.quality.complexity')).toContain('emitted=');
}

describe('emit-verify-passed helper', () => {
  it('prints parser-compatible quality report lines in dry-run mode', () => {
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

    const payload = parsePayloadLines(result.stdout.trim());

    expect(payload.get('task_id')).toBe('task-123');
    expect(payload.get('commit')).toBe('abc1234');
    expect(payload.get('summary')).toBe('Verifier checks passed');
    expect(payload.get('quality.tests')).toBe('pass');
    expect(payload.get('quality.coverage')).toBe('80%');
    expect(payload.get('quality.lint')).toBe('pass');
    expect(payload.get('quality.audit')).toBe('pass');
    expect(payload.get('quality.mutation')).toBe('70%');
    expect(payload.get('quality.complexity')).toBe('10');
    expectThresholdEvidence(payload);
  });

  it('defaults omitted quality flags to parser-compatible passing evidence', () => {
    const result = runEmitVerifyPassed(['--tests', 'pass', '--lint', 'pass', '--dry-run']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');

    const payload = parsePayloadLines(result.stdout.trim());

    expect(payload.get('quality.tests')).toBe('pass');
    expect(payload.get('quality.coverage')).toBe('80%');
    expect(payload.get('quality.lint')).toBe('pass');
    expect(payload.get('quality.audit')).toBe('pass');
    expect(payload.get('quality.mutation')).toBe('70%');
    expect(payload.get('quality.complexity')).toBe('10');
    expectThresholdEvidence(payload);
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

    const payload = parsePayloadLines(result.stdout.trim());

    expect(payload.get('task_id')).toBe('task-xyz');
    expect(payload.get('commit')).toBe('abc1234');
    expect(payload.get('summary')).toBe('Verifier checks passed');
    expect(payload.get('quality.tests')).toBe('pass');
    expect(payload.get('quality.coverage')).toBe('80%');
    expect(payload.get('quality.lint')).toBe('pass');
    expect(payload.get('quality.audit')).toBe('pass');
    expect(payload.get('quality.mutation')).toBe('70%');
    expect(payload.get('quality.complexity')).toBe('10');
    expectThresholdEvidence(payload);
  });

  it('emits parser-compatible payload through ralph in non-dry-run mode', () => {
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

    expect(emittedArgs.slice(0, 2)).toEqual(['emit', 'verify.passed']);

    const payload = parseEmittedPayload(emittedArgs);
    expect(payload.get('task_id')).toBe('task-xyz');
    expect(payload.get('commit')).toBe('abc1234');
    expect(payload.get('summary')).toBe('Verifier checks passed');
    expect(payload.get('quality.tests')).toBe('pass');
    expect(payload.get('quality.coverage')).toBe('80%');
    expect(payload.get('quality.lint')).toBe('pass');
    expect(payload.get('quality.audit')).toBe('pass');
    expect(payload.get('quality.mutation')).toBe('70%');
    expect(payload.get('quality.complexity')).toBe('10');
    expectThresholdEvidence(payload);
  });

  it('emits parser-compatible payload through npm script path used by verifier', () => {
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
    expect(emittedArgs.slice(0, 2)).toEqual(['emit', 'verify.passed']);

    const payload = parseEmittedPayload(emittedArgs);
    expect(payload.get('task_id')).toBe('task-npm');
    expect(payload.get('commit')).toBe('abc1234');
    expect(payload.get('summary')).toBe('Verifier checks passed');
    expect(payload.get('quality.tests')).toBe('pass');
    expect(payload.get('quality.coverage')).toBe('80%');
    expect(payload.get('quality.lint')).toBe('pass');
    expect(payload.get('quality.audit')).toBe('pass');
    expect(payload.get('quality.mutation')).toBe('70%');
    expect(payload.get('quality.complexity')).toBe('10');
    expectThresholdEvidence(payload);
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

    const payload = parseEmittedPayload(emittedArgs);
    expect(payload.get('task_id')).toBe('task-xyz');
    expect(payload.get('commit')).toBe('abc1234');
    expect(payload.get('summary')).toBe('Verifier checks passed');
    expect(payload.get('quality.tests')).toBe('pass');
    expect(payload.get('quality.coverage')).toBe('80%');
    expect(payload.get('quality.lint')).toBe('pass');
    expect(payload.get('quality.audit')).toBe('pass');
    expect(payload.get('quality.mutation')).toBe('70%');
    expect(payload.get('quality.complexity')).toBe('10');
    expectThresholdEvidence(payload);
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
