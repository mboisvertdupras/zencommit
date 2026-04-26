import { spawn } from 'node:child_process';
import { getVerbosity, logBlock, logVerbose } from './logger.js';

const DEFAULT_DISPLAY_LIMIT = 4000;
const REDACTED = '<redacted>';

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /\b(?:api[_-]?key|token|secret|password)=([^\s]+)/gi,
];

export interface CommandDisplayOptions {
  redactedArgs?: number[];
}

export interface SanitizeOutputOptions {
  knownSecrets?: string[];
  limit?: number;
  redactAll?: boolean;
}

export interface ExecErrorContext {
  command?: string[];
  commandDisplay?: string;
  operation?: string;
  safeStdout?: string;
  safeStderr?: string;
}

const quoteArg = (arg: string): string => {
  if (arg.length === 0) {
    return "''";
  }
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replaceAll("'", "'\\''")}'`;
};

const redactedIndexSet = (redactedArgs: number[] | undefined): Set<number> =>
  new Set(redactedArgs ?? []);

const redactSecretPatterns = (text: string): string =>
  SECRET_PATTERNS.reduce((result, pattern) => {
    if (pattern.source.includes('api')) {
      return result.replace(pattern, (match, value: string) => match.replace(value, REDACTED));
    }
    return result.replace(pattern, REDACTED);
  }, text);

const redactKnownSecrets = (text: string, knownSecrets: string[]): string => {
  let result = text;
  for (const secret of knownSecrets) {
    if (!secret) {
      continue;
    }
    result = result.split(secret).join(REDACTED);
  }
  return result;
};

export const sanitizeCommandOutput = (
  text: string,
  {
    knownSecrets = [],
    limit = DEFAULT_DISPLAY_LIMIT,
    redactAll = false,
  }: SanitizeOutputOptions = {},
): string => {
  if (!text) {
    return '';
  }
  if (redactAll) {
    return REDACTED;
  }
  const redacted = redactSecretPatterns(redactKnownSecrets(text, knownSecrets)).trim();
  if (redacted.length <= limit) {
    return redacted;
  }
  return `${redacted.slice(0, limit)}… [truncated ${redacted.length - limit} chars]`;
};

export const getRedactedCommandValues = (
  command: string[],
  redactedArgs: number[] | undefined,
): string[] => {
  const redacted = redactedIndexSet(redactedArgs);
  return command.filter((value, index) => redacted.has(index) && value.length > 0);
};

export const formatCommandForDisplay = (
  command: string[],
  { redactedArgs }: CommandDisplayOptions = {},
): string => {
  if (command.length === 0) {
    return '(empty)';
  }
  const redacted = redactedIndexSet(redactedArgs);
  return command
    .map((arg, index) => (redacted.has(index) ? REDACTED : quoteArg(sanitizeCommandOutput(arg))))
    .join(' ');
};

const buildExecMessage = (commandDisplay: string, exitCode: number, operation?: string): string => {
  const prefix = operation ? `${operation} failed` : 'Command failed';
  return `${prefix}: ${commandDisplay} (exit ${exitCode})`;
};

export class ExecError extends Error {
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string[];
  commandDisplay: string;
  operation?: string;
  safeStdout: string;
  safeStderr: string;

  constructor(
    message: string,
    exitCode: number,
    stdout: string,
    stderr: string,
    context: ExecErrorContext = {},
  ) {
    super(message);
    this.name = 'ExecError';
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
    this.command = context.command ?? [];
    this.commandDisplay = context.commandDisplay ?? '(unknown)';
    this.operation = context.operation;
    this.safeStdout = context.safeStdout ?? sanitizeCommandOutput(stdout);
    this.safeStderr = context.safeStderr ?? sanitizeCommandOutput(stderr);
  }
}

export interface ExecOptions {
  cwd?: string;
  allowFailure?: boolean;
  env?: Record<string, string | undefined>;
  operation?: string;
  redactedArgs?: number[];
  redactStdout?: boolean;
  redactStderr?: boolean;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ExecContext {
  commandDisplay: string;
  knownSecrets: string[];
  operation?: string;
  redactStdout?: boolean;
  redactStderr?: boolean;
}

const makeSafeStdout = (stdout: string, context: ExecContext): string =>
  sanitizeCommandOutput(stdout, {
    knownSecrets: context.knownSecrets,
    redactAll: context.redactStdout,
  });

const makeSafeStderr = (stderr: string, context: ExecContext): string =>
  sanitizeCommandOutput(stderr, {
    knownSecrets: context.knownSecrets,
    redactAll: context.redactStderr,
  });

const createExecError = (
  command: string[],
  exitCode: number,
  stdout: string,
  stderr: string,
  context: ExecContext,
): ExecError =>
  new ExecError(
    buildExecMessage(context.commandDisplay, exitCode, context.operation),
    exitCode,
    stdout,
    stderr,
    {
      command,
      commandDisplay: context.commandDisplay,
      operation: context.operation,
      safeStdout: makeSafeStdout(stdout, context),
      safeStderr: makeSafeStderr(stderr, context),
    },
  );

const runCommand = (
  command: string[],
  options: ExecOptions,
  context: ExecContext,
): Promise<ExecResult> => {
  const [file, ...args] = command;
  if (!file) {
    return Promise.reject(
      createExecError(command, 1, '', 'No command provided', {
        ...context,
        commandDisplay: '(empty)',
      }),
    );
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
      reject(createExecError(command, 1, stdout, error.message, context));
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
  const context: ExecContext = {
    commandDisplay: formatCommandForDisplay(command, { redactedArgs: options.redactedArgs }),
    knownSecrets: getRedactedCommandValues(command, options.redactedArgs),
    operation: options.operation,
    redactStdout: options.redactStdout,
    redactStderr: options.redactStderr,
  };

  if (getVerbosity() >= 2) {
    const operation = context.operation ? ` operation=${context.operation}` : '';
    logVerbose(2, `exec:${operation} ${context.commandDisplay}`);
  }

  const { stdout, stderr, exitCode } = await runCommand(command, options, context);

  if (getVerbosity() >= 3) {
    logVerbose(3, `exec exit: ${exitCode}`);
    logBlock(3, 'exec stdout', makeSafeStdout(stdout, context));
    logBlock(3, 'exec stderr', makeSafeStderr(stderr, context));
  }

  if (exitCode !== 0 && !options.allowFailure) {
    throw createExecError(command, exitCode, stdout, stderr, context);
  }

  return { stdout, stderr, exitCode };
};
