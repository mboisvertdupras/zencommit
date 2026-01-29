/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const run = (args: string[], cwd: string, env: Record<string, string>) =>
  new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
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

describe('zencommit default command', () => {
  it('runs with dry-run and mock output', async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const entry = path.join(__dirname, '..', '..', 'index.ts');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zencommit-int-'));
    execFileSync('git', ['init'], { cwd: dir });
    await fs.writeFile(path.join(dir, 'file.txt'), 'hello\n', 'utf8');
    execFileSync('git', ['add', '-A'], { cwd: dir });

    const mock = JSON.stringify({ subject: 'feat: test commit', body: 'Body' });
    const result = await run(['bun', entry, '--dry-run', '--yes'], dir, {
      ZENCOMMIT_MOCK_RESPONSE: mock,
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('feat: test commit');
  });
});
