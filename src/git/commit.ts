import { exec } from '../util/exec.js';

export const commitMessage = async (
  subject: string,
  body: string,
  extraArgs: string[] = [],
  cwd?: string,
): Promise<void> => {
  const args = ['git', 'commit', '-m', subject];
  if (body && body.trim().length > 0) {
    args.push('-m', body.trim());
  }
  if (extraArgs.length > 0) {
    args.push(...extraArgs);
  }
  await exec(args, { cwd });
};

export const pushChanges = async (cwd?: string): Promise<void> => {
  await exec(['git', 'push'], { cwd });
};
