import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getDiff, getFileList, getFileSummary } from '../../src/git/diff.js';
import { pushChanges } from '../../src/git/commit.js';
import { getRepoRoot } from '../../src/git/repo.js';
import { exec } from '../../src/util/exec.js';
import type { ExecError } from '../../src/util/exec.js';

const tempDirs: string[] = [];

const makeTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zencommit-git-runtime-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('git runtime diagnostics', () => {
  it('returns null for repository root lookup outside git repositories', async () => {
    const dir = await makeTempDir();

    await expect(getRepoRoot(dir)).resolves.toBeNull();
  });

  it('adds operation context to git diff failures outside repositories', async () => {
    const dir = await makeTempDir();

    await expect(getDiff({ mode: 'staged', cwd: dir })).rejects.toSatisfy((error: unknown) => {
      const execError = error as ExecError;
      expect(execError.name).toBe('ExecError');
      expect(execError.operation).toBe('git diff (staged)');
      expect(execError.commandDisplay).toContain('git diff --cached --no-color');
      expect(execError.exitCode).not.toBe(0);
      return true;
    });
  });

  it('keeps no-diff git paths behavior-compatible', async () => {
    const dir = await makeTempDir();
    await exec(['git', 'init'], { cwd: dir, operation: 'test git init' });

    await expect(getDiff({ mode: 'unstaged', cwd: dir })).resolves.toBe('');
    await expect(getFileList({ mode: 'unstaged', cwd: dir })).resolves.toEqual([]);
    await expect(getFileSummary({ mode: 'unstaged', cwd: dir })).resolves.toBe('');
  });

  it('adds operation context to git push failures', async () => {
    const dir = await makeTempDir();

    await expect(pushChanges(dir)).rejects.toSatisfy((error: unknown) => {
      const execError = error as ExecError;
      expect(execError.name).toBe('ExecError');
      expect(execError.operation).toBe('git push');
      expect(execError.commandDisplay).toBe('git push');
      return true;
    });
  });
});
