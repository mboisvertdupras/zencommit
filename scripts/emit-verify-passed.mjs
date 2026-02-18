#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const ALLOWED_STATUSES = new Set([
  'pass',
  'fail',
  'fail_known_preexisting',
  'not_configured',
]);

const DEFAULT_STATUS = 'not_configured';

const QUALITY_FLAGS = [
  'tests',
  'coverage',
  'lint',
  'audit',
  'mutation',
  'complexity',
];

const METADATA_FLAGS = ['task-id', 'task_id', 'taskId', 'commit', 'summary'];
const QUALITY_DOTTED_KEYS = QUALITY_FLAGS.map((flag) => `quality.${flag}`);

const BOOLEAN_FLAGS = new Set(['dry-run', 'help', 'h']);
const VALUE_FLAGS = new Set([...QUALITY_FLAGS, ...METADATA_FLAGS]);

function printUsage() {
  console.error(`Usage:
  node scripts/emit-verify-passed.mjs \\
    [--tests <status>] [--coverage <status>] [--lint <status>] \\
    [--audit <status>] [--mutation <status>] [--complexity <status>] \\
    [--task-id <id>] [--commit <sha>] [--summary <text>] [--dry-run]

Allowed status values:
  pass | fail | fail_known_preexisting | not_configured

Omitted quality flags default to:
  not_configured`);
}

function parseArgs(argv) {
  const result = {
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '-h') {
      result.help = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }

    const raw = token.slice(2);
    const separatorIndex = raw.indexOf('=');
    const key = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
    const inlineValue = separatorIndex >= 0 ? raw.slice(separatorIndex + 1) : undefined;

    if (BOOLEAN_FLAGS.has(key)) {
      if (inlineValue !== undefined) {
        throw new Error(`Flag --${key} does not take a value`);
      }

      if (key === 'dry-run') {
        result.dryRun = true;
      }

      if (key === 'help' || key === 'h') {
        result.help = true;
      }

      continue;
    }

    if (!VALUE_FLAGS.has(key)) {
      throw new Error(`Unknown flag: --${key}`);
    }

    const value = inlineValue ?? argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    result[key] = value;

    if (inlineValue === undefined) {
      i += 1;
    }
  }

  return result;
}

function resolveTaskId(options) {
  return options['task-id'] ?? options.task_id ?? options.taskId;
}

function resolveQualityStatuses(options) {
  const statuses = {};

  for (const flag of QUALITY_FLAGS) {
    const value = typeof options[flag] === 'string' ? options[flag] : DEFAULT_STATUS;
    if (!ALLOWED_STATUSES.has(value)) {
      throw new Error(`Invalid status for --${flag}: ${value}`);
    }

    statuses[flag] = value;
  }

  return statuses;
}

function buildPayload(options) {
  const statuses = resolveQualityStatuses(options);

  const quality = Object.fromEntries(QUALITY_FLAGS.map((flag) => [flag, statuses[flag]]));

  const payload = {
    quality,
  };

  for (const [index, flag] of QUALITY_FLAGS.entries()) {
    payload[QUALITY_DOTTED_KEYS[index]] = quality[flag];
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

function assertCanonicalQualityPayload(payload) {
  const quality = payload.quality;

  if (!quality || typeof quality !== 'object' || Array.isArray(quality)) {
    throw new Error('Payload must include a grouped quality object');
  }

  for (const [index, flag] of QUALITY_FLAGS.entries()) {
    const groupedValue = quality[flag];
    if (typeof groupedValue !== 'string') {
      throw new Error(`Payload is missing quality.${flag} in grouped quality object`);
    }

    if (!ALLOWED_STATUSES.has(groupedValue)) {
      throw new Error(`Grouped quality.${flag} has invalid status: ${groupedValue}`);
    }

    const dottedKey = QUALITY_DOTTED_KEYS[index];
    const dottedValue = payload[dottedKey];

    if (typeof dottedValue !== 'string') {
      throw new Error(`Payload is missing top-level ${dottedKey}`);
    }

    if (!ALLOWED_STATUSES.has(dottedValue)) {
      throw new Error(`Top-level ${dottedKey} has invalid status: ${dottedValue}`);
    }

    if (groupedValue !== dottedValue) {
      throw new Error(`Payload mismatch: ${dottedKey} does not match grouped quality.${flag}`);
    }
  }
}

function serializeCanonicalPayload(payload) {
  const payloadJson = JSON.stringify(payload);
  const roundTrippedPayload = JSON.parse(payloadJson);

  // Validate the exact JSON string that will be handed to `ralph emit`.
  assertCanonicalQualityPayload(roundTrippedPayload);

  return payloadJson;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const payload = buildPayload(options);
  assertCanonicalQualityPayload(payload);
  const payloadJson = serializeCanonicalPayload(payload);

  if (options.dryRun) {
    process.stdout.write(`${payloadJson}\n`);
    return;
  }

  const emitResult = spawnSync('ralph', ['emit', 'verify.passed', '--json', payloadJson], {
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
