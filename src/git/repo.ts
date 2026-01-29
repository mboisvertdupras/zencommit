import { exec } from '../util/exec.js';

export const getRepoRoot = async (): Promise<string | null> => {
  try {
    const result = await exec(['git', 'rev-parse', '--show-toplevel']);
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
};
