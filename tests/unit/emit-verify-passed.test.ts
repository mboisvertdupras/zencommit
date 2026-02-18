import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptPath = resolve(process.cwd(), 'scripts/emit-verify-passed.mjs');

function runEmitVerifyPassed(args: string[]) {
  return spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
  });
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
