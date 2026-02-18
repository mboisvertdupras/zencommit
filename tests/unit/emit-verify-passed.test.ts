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
  it('prints a flattened verify payload with required quality keys', () => {
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

    const payload = JSON.parse(result.stdout.trim()) as Record<string, string>;

    expect(payload).toEqual({
      task_id: 'task-123',
      commit: 'abc1234',
      summary: 'Verifier checks passed',
      'quality.tests': 'pass',
      'quality.coverage': 'not_configured',
      'quality.lint': 'pass',
      'quality.audit': 'pass',
      'quality.mutation': 'not_configured',
      'quality.complexity': 'not_configured',
    });
    expect(Object.hasOwn(payload, 'quality')).toBe(false);
    expect(Object.hasOwn(payload, 'quality_handoff')).toBe(false);
  });

  it('fails when required quality flags are missing', () => {
    const result = runEmitVerifyPassed(['--tests', 'pass', '--dry-run']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing required quality flags');
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
});
