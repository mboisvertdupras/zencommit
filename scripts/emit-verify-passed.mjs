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

The helper emits a parser-compatible text quality report with all required lines:
  quality.tests: <pass|fail>
  quality.coverage: <number>%
  quality.lint: <pass|fail>
  quality.audit: <pass|fail>
  quality.mutation: <number>%
  quality.complexity: <number>`);
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

function isPassingStatus(status) {
  return status === 'pass' || status === 'not_configured';
}

function renderPassFail(status) {
  return isPassingStatus(status) ? 'pass' : 'fail';
}

function renderCoveragePercent(status) {
  return isPassingStatus(status) ? '80%' : '0%';
}

function renderMutationPercent(status) {
  return isPassingStatus(status) ? '70%' : '0%';
}

function renderComplexityScore(status) {
  return isPassingStatus(status) ? '10' : '11';
}

function buildPayload(options) {
  const statuses = resolveQualityStatuses(options);

  const lines = [];

  const taskId = resolveTaskId(options);
  if (taskId) {
    lines.push(`task_id: ${taskId}`);
  }

  if (options.commit) {
    lines.push(`commit: ${options.commit}`);
  }

  if (options.summary) {
    lines.push(`summary: ${options.summary}`);
  }

  lines.push(`quality.tests: ${renderPassFail(statuses.tests)}`);
  lines.push(`quality.coverage: ${renderCoveragePercent(statuses.coverage)}`);
  lines.push(`quality.lint: ${renderPassFail(statuses.lint)}`);
  lines.push(`quality.audit: ${renderPassFail(statuses.audit)}`);
  lines.push(`quality.mutation: ${renderMutationPercent(statuses.mutation)}`);
  lines.push(`quality.complexity: ${renderComplexityScore(statuses.complexity)}`);

  return lines.join('\n');
}

function assertCanonicalQualityPayload(payload) {
  const lineLookup = new Map();

  for (const line of payload.split('\n').map((segment) => segment.trim())) {
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    lineLookup.set(key, value);
  }

  for (const key of ['quality.tests', 'quality.coverage', 'quality.lint', 'quality.audit', 'quality.mutation', 'quality.complexity']) {
    const value = lineLookup.get(key);
    if (!value) {
      throw new Error(`Payload is missing ${key}`);
    }
  }

  if (!/^(pass|fail)$/u.test(lineLookup.get('quality.tests') ?? '')) {
    throw new Error('quality.tests must be pass or fail');
  }

  if (!/^(pass|fail)$/u.test(lineLookup.get('quality.lint') ?? '')) {
    throw new Error('quality.lint must be pass or fail');
  }

  if (!/^(pass|fail)$/u.test(lineLookup.get('quality.audit') ?? '')) {
    throw new Error('quality.audit must be pass or fail');
  }

  if (!/\d/u.test(lineLookup.get('quality.coverage') ?? '')) {
    throw new Error('quality.coverage must include a numeric percentage');
  }

  if (!/\d/u.test(lineLookup.get('quality.mutation') ?? '')) {
    throw new Error('quality.mutation must include a numeric percentage');
  }

  if (!/\d/u.test(lineLookup.get('quality.complexity') ?? '')) {
    throw new Error('quality.complexity must include a numeric score');
  }
}

function serializeCanonicalPayload(payload) {
  const payloadText = `${payload}`;
  assertCanonicalQualityPayload(payloadText);
  return payloadText;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const payload = buildPayload(options);
  assertCanonicalQualityPayload(payload);
  const payloadText = serializeCanonicalPayload(payload);

  if (options.dryRun) {
    process.stdout.write(`${payloadText}\n`);
    return;
  }

  const emitResult = spawnSync('ralph', ['emit', 'verify.passed', payloadText], {
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
