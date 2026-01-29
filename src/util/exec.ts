import { getVerbosity, logBlock, logVerbose } from './logger.js';

export class ExecError extends Error {
  exitCode: number;
  stdout: string;
  stderr: string;

  constructor(message: string, exitCode: number, stdout: string, stderr: string) {
    super(message);
    this.name = 'ExecError';
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export interface ExecOptions {
  cwd?: string;
  allowFailure?: boolean;
  env?: Record<string, string | undefined>;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const exec = async (command: string[], options: ExecOptions = {}): Promise<ExecResult> => {
  if (getVerbosity() >= 2) {
    logVerbose(2, `exec: ${command.join(' ')}`);
  }
  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (getVerbosity() >= 3) {
    logVerbose(3, `exec exit: ${exitCode}`);
    logBlock(3, 'exec stdout', stdout);
    logBlock(3, 'exec stderr', stderr);
  }

  if (exitCode !== 0 && !options.allowFailure) {
    throw new ExecError(`Command failed: ${command.join(' ')}`, exitCode, stdout, stderr);
  }

  return { stdout, stderr, exitCode };
};
