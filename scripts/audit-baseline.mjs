import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

export const INVENTORY_RELATIVE_PATH = 'docs/quality-audit-baseline.md';
export const SCAN_TIMEOUT_MS = 3000;

export const REQUIRED_HEADINGS = [
  'Repo Area Coverage',
  'Command Baselines',
  'Audit Findings',
  'Downstream Ownership',
];

export const REQUIRED_AREAS = [
  {
    id: 'source',
    paths: [
      'src/index.ts',
      'src/auth/secrets.ts',
      'src/config/load.ts',
      'src/git/diff.ts',
      'src/llm/generate.ts',
      'src/llm/prompts/base.md',
      'src/metadata/providers/modelsdev.ts',
    ],
  },
  {
    id: 'tests',
    paths: [
      'src/config/load.test.ts',
      'src/llm/truncate.test.ts',
      'tests/helpers/cli.ts',
      'tests/integration/default.test.ts',
      'tests/integration/cli-behavior.test.ts',
      'tests/integration/parity-baseline.test.ts',
      'tests/unit/default-flow.test.ts',
      'tests/unit/install-surface-contract.test.ts',
      'tests/unit/quality-gate-contract.test.ts',
      'tests/unit/secrets.test.ts',
    ],
  },
  {
    id: 'scripts',
    paths: [
      'scripts/audit-baseline.mjs',
      'scripts/smoke-install-matrix.mjs',
      'scripts/verify-dist.mjs',
    ],
  },
  {
    id: 'workflows',
    paths: ['.github/workflows/ci.yml', '.github/workflows/release.yml'],
  },
  {
    id: 'package',
    paths: ['package.json', 'package-lock.json'],
  },
  {
    id: 'docs',
    paths: [
      'README.md',
      'docs/spec.md',
      'docs/node-native-inventory.md',
      'docs/node-native-release-readiness.md',
      'docs/quality-audit-baseline.md',
    ],
  },
];

export const REQUIRED_COMMANDS = [
  'npm run typecheck',
  'npm run build',
  'npm test -- tests/unit/quality-gate-contract.test.ts',
  'node scripts/audit-baseline.mjs --check',
  'npm run lint',
  'npm run format:check',
  'npm audit --audit-level=low',
  'npm outdated --json',
  'npm run smoke:install-matrix',
];

export const REQUIRED_OWNER_IDS = ['S02', 'S03', 'S04', 'S05', 'S06', 'S07'];

export const DISALLOWED_REQUIRED_PREFIXES = [
  '.gsd/',
  '.planning/',
  'node_modules/',
  'dist/',
  'coverage/',
];

export const REQUIRED_QA005_EVIDENCE = [
  'tests/helpers/cli.ts',
  'tests/integration/default.test.ts',
  'tests/integration/cli-behavior.test.ts',
  'tests/integration/parity-baseline.test.ts',
  'tests/unit/default-flow.test.ts',
  'tests/unit/install-surface-contract.test.ts',
  'tests/unit/secrets.test.ts',
];

export const REQUIRED_QA006_EVIDENCE = [
  'tests/integration/docs-parity.test.ts',
  'README.md',
  'docs/spec.md',
  'docs/node-native-release-readiness.md',
  'docs/node-native-inventory.md',
  'AGENTS.md',
];

export const REQUIRED_QA007_EVIDENCE = [
  'docs/quality-audit-baseline.md',
  'docs/node-native-release-readiness.md',
];

export const REQUIRED_QA007_COMMAND_MARKERS = [
  'npm run typecheck',
  'npm run build',
  'npm test',
  'npm run lint',
  'npm run format:check',
  'node scripts/audit-baseline.mjs --check',
  'npm audit --audit-level=low',
  'npm outdated --json',
  'npm run smoke:install-matrix',
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeCell = (value) =>
  value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*/g, '')
    .trim();

const normalizePath = (value) => value.replace(/\\/g, '/').replace(/^\.\//, '');

const looksLikeTrackedPathRef = (value) =>
  !/\s/.test(value) && (/\//.test(value) || /\.[A-Za-z0-9]+$/.test(value));

const extractCodeSpans = (markdown) =>
  [...markdown.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '');

const hasHeading = (markdown, heading) => {
  const regex = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, 'm');
  return regex.test(markdown);
};

const getSection = (markdown, heading, level = 2) => {
  const lines = markdown.split(/\r?\n/);
  const headingPrefix = `${'#'.repeat(level)} `;
  const start = lines.findIndex((line) => line.trim() === `${headingPrefix}${heading}`);

  if (start === -1) {
    return null;
  }

  let end = lines.length;
  const boundary = new RegExp(`^#{1,${level}}\\s+`);

  for (let index = start + 1; index < lines.length; index += 1) {
    if (boundary.test(lines[index]?.trim() ?? '')) {
      end = index;
      break;
    }
  }

  return lines.slice(start + 1, end).join('\n');
};

const parseMarkdownTable = (section) =>
  section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));

const findAreaRows = (section) => {
  const rows = parseMarkdownTable(section);
  const dataRows = rows.filter((cells) => normalizeCell(cells[0] ?? '').toLowerCase() !== 'area');
  const byArea = new Map();

  for (const cells of dataRows) {
    const areaId = normalizeCell(cells[0] ?? '').toLowerCase();
    if (areaId) {
      byArea.set(areaId, cells.join(' | '));
    }
  }

  return byArea;
};

const findCommandRow = (section, command) =>
  parseMarkdownTable(section).find((cells) => cells.join(' | ').includes(`\`${command}\``));

const isPassingResult = (rowText) =>
  /\b(?:exit\s*0|passes|passing|pass(?:ed)?|✅)\b/i.test(rowText);

const findFindingRow = (markdown, findingId) => {
  const section = getSection(markdown, 'Audit Findings');

  if (section === null) {
    return null;
  }

  return (
    parseMarkdownTable(section).find((cells) => normalizeCell(cells[0] ?? '') === findingId) ?? null
  );
};

const hasFindingClosure = (markdown, findingId, ownerId) => {
  const row = findFindingRow(markdown, findingId);

  if (row === null) {
    return false;
  }

  const rowText = row.join(' | ');

  return (
    new RegExp(`\\b${escapeRegex(ownerId)}\\s+closed\\b`, 'i').test(rowText) ||
    new RegExp(`\\bclosed\\s+by\\s+${escapeRegex(ownerId)}\\b`, 'i').test(rowText)
  );
};

const validateDisallowedRequiredPaths = (section, errors) => {
  for (const rawPath of extractCodeSpans(section)) {
    const pathRef = normalizePath(rawPath);
    for (const prefix of DISALLOWED_REQUIRED_PREFIXES) {
      if (pathRef === prefix.slice(0, -1) || pathRef.startsWith(prefix)) {
        errors.push(`repo area coverage references ignored path as required fixture: ${pathRef}`);
      }
    }
  }
};

const validateRepoAreaCoverage = (markdown, trackableFiles, errors) => {
  const section = getSection(markdown, 'Repo Area Coverage');

  if (section === null) {
    errors.push('missing required heading: Repo Area Coverage');
    return;
  }

  validateDisallowedRequiredPaths(section, errors);

  const areaRows = findAreaRows(section);
  for (const area of REQUIRED_AREAS) {
    const row = areaRows.get(area.id);

    if (!row) {
      errors.push(`missing repo area row: ${area.id}`);
      continue;
    }

    for (const requiredPath of area.paths) {
      if (!row.includes(`\`${requiredPath}\``)) {
        errors.push(`repo area '${area.id}' missing required tracked path marker: ${requiredPath}`);
      }

      if (!trackableFiles.has(requiredPath)) {
        errors.push(`required path is not tracked or trackable: ${requiredPath}`);
      }
    }
  }
};

const validateCommandBaselines = (markdown, errors) => {
  const section = getSection(markdown, 'Command Baselines');

  if (section === null) {
    errors.push('missing required heading: Command Baselines');
    return;
  }

  for (const command of REQUIRED_COMMANDS) {
    const commandRow = findCommandRow(section, command);

    if (!commandRow) {
      errors.push(`missing command baseline: ${command}`);
      continue;
    }

    const rowText = commandRow.join(' | ');

    if (!REQUIRED_OWNER_IDS.some((ownerId) => rowText.includes(ownerId))) {
      errors.push(`command baseline '${command}' missing S02-S07 owner marker`);
    }

    if (!/\b(?:exit\s*\d+|timed?\s*out|timeout)\b/i.test(rowText)) {
      errors.push(`command baseline '${command}' missing recorded exit or timeout result`);
    }
  }

  const auditRowText = findCommandRow(section, 'npm audit --audit-level=low')?.join(' | ') ?? '';
  const outdatedRowText = findCommandRow(section, 'npm outdated --json')?.join(' | ') ?? '';
  const auditClosed = hasFindingClosure(markdown, 'QA-003', 'S04');
  const outdatedClosed = hasFindingClosure(markdown, 'QA-004', 'S04');
  const auditPasses = isPassingResult(auditRowText);
  const outdatedPasses = isPassingResult(outdatedRowText);

  if (auditPasses && !auditClosed) {
    errors.push(
      "command baseline 'npm audit --audit-level=low' passes before QA-003 records S04 closure",
    );
  }

  if (auditClosed && !auditPasses) {
    errors.push('QA-003 records S04 closure but npm audit baseline is not passing');
  }

  if (outdatedPasses && !outdatedClosed) {
    errors.push("command baseline 'npm outdated --json' passes before QA-004 records S04 closure");
  }

  if (outdatedClosed && !outdatedPasses) {
    errors.push('QA-004 records S04 closure but npm outdated baseline is not passing');
  }
};

const validateFindings = (markdown, errors) => {
  const section = getSection(markdown, 'Audit Findings');

  if (section === null) {
    errors.push('missing required heading: Audit Findings');
    return;
  }

  const rows = parseMarkdownTable(section).filter(
    (cells) => normalizeCell(cells[0] ?? '').toLowerCase() !== 'id',
  );

  if (rows.length === 0) {
    errors.push('Audit Findings table must include at least one finding row');
    return;
  }

  for (const cells of rows) {
    const rowText = cells.join(' | ');
    const findingId = normalizeCell(cells[0] ?? 'unknown finding');
    const ownerCell = cells[cells.length - 1] ?? '';
    const owners = ownerCell.match(/\bS0[2-7]\b/g) ?? [];
    const invalidOwners =
      ownerCell.match(/\bS0[0-9]\b/g)?.filter((owner) => !REQUIRED_OWNER_IDS.includes(owner)) ?? [];

    if (!/^QA-\d{3}$/.test(findingId)) {
      errors.push(`finding row has malformed id: ${findingId}`);
    }

    if (owners.length === 0) {
      errors.push(`finding ${findingId} missing S02-S07 owner marker`);
    }

    for (const invalidOwner of invalidOwners) {
      errors.push(`finding ${findingId} uses unsupported owner marker: ${invalidOwner}`);
    }

    if (/\bTBD\b|\?\?/.test(rowText)) {
      errors.push(`finding ${findingId} contains unresolved placeholder text`);
    }
  }
};

const validateQa005Closure = (markdown, errors) => {
  const row = findFindingRow(markdown, 'QA-005');

  if (row === null) {
    errors.push('missing audit finding row: QA-005');
    return;
  }

  const rowText = row.join(' | ');

  if (!hasFindingClosure(markdown, 'QA-005', 'S05')) {
    errors.push('finding QA-005 must record S05 closure');
  }

  for (const evidencePath of REQUIRED_QA005_EVIDENCE) {
    if (!rowText.includes(evidencePath)) {
      errors.push(`finding QA-005 closure missing evidence marker: ${evidencePath}`);
    }
  }
};

const validateQa006Closure = (markdown, trackableFiles, errors) => {
  const row = findFindingRow(markdown, 'QA-006');

  if (row === null) {
    errors.push('missing audit finding row: QA-006');
    return;
  }

  const rowText = row.join(' | ');

  if (!hasFindingClosure(markdown, 'QA-006', 'S06')) {
    errors.push('finding QA-006 must record S06 closure');
  }

  for (const evidencePath of REQUIRED_QA006_EVIDENCE) {
    if (!rowText.includes(evidencePath)) {
      errors.push(`finding QA-006 closure missing evidence marker: ${evidencePath}`);
    }

    if (!trackableFiles.has(evidencePath)) {
      errors.push(
        `finding QA-006 closure evidence path is not tracked or trackable: ${evidencePath}`,
      );
    }
  }

  if (!/historical migration context|migration history/i.test(rowText)) {
    errors.push(
      'finding QA-006 closure must classify docs/node-native-inventory.md Bun references as historical migration context',
    );
  }

  if (!/not current setup guidance/i.test(rowText)) {
    errors.push(
      'finding QA-006 closure must state docs/node-native-inventory.md Bun references are not current setup guidance',
    );
  }
};

const validateQa007Closure = (markdown, trackableFiles, errors, { requireClosed = false } = {}) => {
  const row = findFindingRow(markdown, 'QA-007');

  if (row === null) {
    errors.push('missing audit finding row: QA-007');
    return;
  }

  const rowText = row.join(' | ');
  const findingText = row.slice(0, 3).join(' | ');
  const hasClosureClaim = /\bclosed\b/i.test(findingText);
  const hasS07Closure = hasFindingClosure(markdown, 'QA-007', 'S07');

  if (!hasS07Closure) {
    if (requireClosed || hasClosureClaim) {
      errors.push('finding QA-007 must record S07 closure');
    }

    return;
  }

  if (!/final(?:\s+integrated)?\s+gate|integrated\s+gate/i.test(rowText)) {
    errors.push('finding QA-007 closure must name final integrated gate evidence');
  }

  for (const command of REQUIRED_QA007_COMMAND_MARKERS) {
    if (!rowText.includes(command)) {
      errors.push(`finding QA-007 closure missing command marker: ${command}`);
    }
  }

  for (const evidencePath of REQUIRED_QA007_EVIDENCE) {
    if (!rowText.includes(evidencePath)) {
      errors.push(`finding QA-007 closure missing evidence marker: ${evidencePath}`);
    }

    if (!trackableFiles.has(evidencePath)) {
      errors.push(
        `finding QA-007 closure evidence path is not tracked or trackable: ${evidencePath}`,
      );
    }
  }

  for (const rawPath of extractCodeSpans(rowText)) {
    const pathRef = normalizePath(rawPath);

    if (!looksLikeTrackedPathRef(pathRef)) {
      continue;
    }

    for (const prefix of DISALLOWED_REQUIRED_PREFIXES) {
      if (pathRef === prefix.slice(0, -1) || pathRef.startsWith(prefix)) {
        errors.push(`finding QA-007 closure references ignored path as evidence: ${pathRef}`);
      }
    }

    if (!trackableFiles.has(pathRef)) {
      errors.push(`finding QA-007 closure evidence path is not tracked or trackable: ${pathRef}`);
    }
  }
};

const sortErrors = (errors) =>
  [...new Set(errors)].sort((left, right) => left.localeCompare(right));

export const validateQa007FinalGateClosure = (markdown, trackableFileList) => {
  const errors = [];
  const trackableFiles = new Set(trackableFileList.map(normalizePath));

  validateQa007Closure(markdown, trackableFiles, errors, { requireClosed: true });

  return sortErrors(errors);
};

const validateDownstreamOwnership = (markdown, errors) => {
  const section = getSection(markdown, 'Downstream Ownership');

  if (section === null) {
    errors.push('missing required heading: Downstream Ownership');
    return;
  }

  for (const ownerId of REQUIRED_OWNER_IDS) {
    if (!new RegExp(`\\b${ownerId}\\b`).test(section)) {
      errors.push(`downstream ownership section missing owner marker: ${ownerId}`);
    }
  }
};

export const validateInventoryMarkdown = (markdown, trackableFileList) => {
  const errors = [];
  const trackableFiles = new Set(trackableFileList.map(normalizePath));

  for (const heading of REQUIRED_HEADINGS) {
    if (!hasHeading(markdown, heading)) {
      errors.push(`missing required heading: ${heading}`);
    }
  }

  validateRepoAreaCoverage(markdown, trackableFiles, errors);
  validateCommandBaselines(markdown, errors);
  validateFindings(markdown, errors);
  validateQa005Closure(markdown, errors);
  validateQa006Closure(markdown, trackableFiles, errors);
  validateQa007Closure(markdown, trackableFiles, errors);
  validateDownstreamOwnership(markdown, errors);

  return sortErrors(errors);
};

const listTrackableFiles = async () => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', pkgRoot, 'ls-files', '--cached', '--others', '--exclude-standard'],
      {
        timeout: SCAN_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );

    return stdout
      .split(/\r?\n/)
      .map((entry) => normalizePath(entry.trim()))
      .filter((entry) => entry.length > 0);
  } catch (error) {
    if (error?.killed || error?.signal === 'SIGTERM') {
      throw new Error(`tracked-file scan timed out after ${SCAN_TIMEOUT_MS}ms`);
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`tracked-file scan failed during git/local filesystem phase: ${message}`);
  }
};

export const checkInventory = async () => {
  const inventoryPath = path.join(pkgRoot, INVENTORY_RELATIVE_PATH);
  let markdown;

  try {
    markdown = await fs.readFile(inventoryPath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`missing audit inventory file: ${INVENTORY_RELATIVE_PATH} (${message})`);
  }

  const trackableFiles = await listTrackableFiles();
  const errors = validateInventoryMarkdown(markdown, trackableFiles);

  return { errors, trackableFiles };
};

const run = async () => {
  if (!process.argv.includes('--check')) {
    console.log('Usage: node scripts/audit-baseline.mjs --check');
    return;
  }

  const { errors, trackableFiles } = await checkInventory();

  if (errors.length > 0) {
    console.error('Audit baseline validation failed:');
    for (const error of errors) {
      console.error(`- ${String(error)}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Audit baseline inventory covers ${REQUIRED_AREAS.length} repo areas, ${REQUIRED_COMMANDS.length} command baselines, and ${trackableFiles.length} tracked/trackable files.`,
  );
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
