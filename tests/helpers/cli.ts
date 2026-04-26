import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const distEntry = path.join(workspaceRoot, 'dist', 'index.js');

export type CliResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  command: string[];
  cwd: string;
};

export type RunCliOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
};

export type CreateTempRepoOptions = {
  prefix?: string;
  withStagedChange?: boolean;
};

export const normalizeOutput = (text: string): string => text.replace(/\r\n/g, '\n');

export const toNormalizedLines = (text: string): string[] =>
  normalizeOutput(text)
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0);

export const runCli = (
  args: readonly string[],
  options: RunCliOptions = {},
): Promise<CliResult> => {
  const cwd = options.cwd ?? workspaceRoot;
  const command: [string, ...string[]] = [process.execPath, distEntry, ...args];

  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const [key, value] of Object.entries(options.env ?? {})) {
      if (value === undefined) {
        delete env[key];
      } else {
        env[key] = value;
      }
    }

    const proc: ChildProcessWithoutNullStreams = spawn(command[0], command.slice(1), {
      cwd,
      env,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (result: CliResult): void => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('error', (error: Error) => {
      settle({
        code: null,
        stdout,
        stderr: `${stderr}${error.message}`,
        command,
        cwd,
      });
    });
    proc.on('close', (code: number | null) => {
      settle({ code, stdout, stderr, command, cwd });
    });
  });
};

const runGit = (args: readonly string[], cwd: string): void => {
  try {
    execFileSync('git', [...args], { cwd, stdio: 'pipe' });
  } catch (error) {
    const result = error as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const stderr = result.stderr?.toString().trim();
    const stdout = result.stdout?.toString().trim();
    const details = [
      `git ${args.join(' ')}`,
      `cwd: ${cwd}`,
      stdout ? `stdout: ${stdout}` : undefined,
      stderr ? `stderr: ${stderr}` : undefined,
      result.message ? `message: ${result.message}` : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');
    throw new Error(`Git temp repository setup failed:\n${details}`);
  }
};

export const createTempRepo = async (options: CreateTempRepoOptions = {}): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), options.prefix ?? 'zencommit-int-'));
  runGit(['init'], dir);

  if (options.withStagedChange === true) {
    await fs.writeFile(path.join(dir, 'file.txt'), 'hello\n', 'utf8');
    runGit(['add', '-A'], dir);
  }

  return dir;
};
