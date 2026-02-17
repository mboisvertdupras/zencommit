import { spawn } from 'node:child_process';
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

const runCommand = (command: string[], options: ExecOptions): Promise<ExecResult> => {
  const [file, ...args] = command;
  if (!file) {
    return Promise.reject(new ExecError('Command failed: (empty)', 1, '', 'No command provided'));
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(file, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');

    proc.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    proc.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    proc.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new ExecError(`Command failed: ${command.join(' ')}`, 1, stdout, error.message));
    });

    proc.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
};

export const exec = async (command: string[], options: ExecOptions = {}): Promise<ExecResult> => {
  if (getVerbosity() >= 2) {
    logVerbose(2, `exec: ${command.join(' ')}`);
  }

  const { stdout, stderr, exitCode } = await runCommand(command, options);

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
