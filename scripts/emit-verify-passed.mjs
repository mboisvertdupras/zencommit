#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const ALLOWED_STATUSES = new Set([
  'pass',
  'fail',
  'fail_known_preexisting',
  'not_configured',
]);

const QUALITY_FLAGS = [
  'tests',
  'coverage',
  'lint',
  'audit',
  'mutation',
  'complexity',
];

function printUsage() {
  console.error(`Usage:
  node scripts/emit-verify-passed.mjs \\
    --tests <status> --coverage <status> --lint <status> \\
    --audit <status> --mutation <status> --complexity <status> \\
    [--task-id <id>] [--commit <sha>] [--summary <text>] [--dry-run]

Allowed status values:
  pass | fail | fail_known_preexisting | not_configured`);
}

function parseArgs(argv) {
  const result = {
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--dry-run') {
      result.dryRun = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      result.help = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    result[key] = value;
    i += 1;
  }

  return result;
}

function resolveTaskId(options) {
  return options['task-id'] ?? options.task_id ?? options.taskId;
}

function buildPayload(options) {
  const missingFlags = QUALITY_FLAGS.filter((flag) => typeof options[flag] !== 'string');
  if (missingFlags.length > 0) {
    throw new Error(`Missing required quality flags: ${missingFlags.map((flag) => `--${flag}`).join(', ')}`);
  }

  const payload = {
    'quality.tests': options.tests,
    'quality.coverage': options.coverage,
    'quality.lint': options.lint,
    'quality.audit': options.audit,
    'quality.mutation': options.mutation,
    'quality.complexity': options.complexity,
  };

  for (const flag of QUALITY_FLAGS) {
    const value = options[flag];
    if (!ALLOWED_STATUSES.has(value)) {
      throw new Error(`Invalid status for --${flag}: ${value}`);
    }
  }

  const taskId = resolveTaskId(options);
  if (taskId) {
    payload.task_id = taskId;
  }

  if (options.commit) {
    payload.commit = options.commit;
  }

  if (options.summary) {
    payload.summary = options.summary;
  }

  return payload;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const payload = buildPayload(options);

  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  const emitResult = spawnSync('ralph', ['emit', 'verify.passed', '--json', JSON.stringify(payload)], {
    stdio: 'inherit',
  });

  if (emitResult.error) {
    throw emitResult.error;
  }

  process.exit(emitResult.status ?? 1);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`emit-verify-passed error: ${message}`);
  printUsage();
  process.exit(1);
}
