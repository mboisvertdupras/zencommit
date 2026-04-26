import { exec } from '../util/exec.js';

export const getRepoRoot = async (cwd?: string): Promise<string | null> => {
  try {
    const result = await exec(['git', 'rev-parse', '--show-toplevel'], {
      cwd,
      operation: 'git repository root lookup',
    });
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
};
