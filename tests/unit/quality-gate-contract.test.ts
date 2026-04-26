import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageJsonPath = resolve(process.cwd(), 'package.json');
const tsconfigPath = resolve(process.cwd(), 'tsconfig.json');
const tsconfigBuildPath = resolve(process.cwd(), 'tsconfig.build.json');
const ciWorkflowPath = resolve(process.cwd(), '.github/workflows/ci.yml');
const releaseWorkflowPath = resolve(process.cwd(), '.github/workflows/release.yml');
const dependencyModernizationContractPath = resolve(
  process.cwd(),
  'tests/unit/dependency-modernization-contract.test.ts',
);
const auditBaselineScriptPath = resolve(process.cwd(), 'scripts/audit-baseline.mjs');
const auditBaselineDocPath = resolve(process.cwd(), 'docs/quality-audit-baseline.md');
const auditBaselineModuleUrl = pathToFileURL(auditBaselineScriptPath).href;

type PackageJson = {
  scripts?: Record<string, string>;
};

type Tsconfig = {
  compilerOptions?: Record<string, unknown>;
};

type AuditBaselineModule = {
  REQUIRED_AREAS: Array<{ id: string; paths: string[] }>;
  REQUIRED_COMMANDS: string[];
  REQUIRED_QA005_EVIDENCE: string[];
  REQUIRED_QA006_EVIDENCE: string[];
  REQUIRED_QA007_COMMAND_MARKERS: string[];
  REQUIRED_QA007_EVIDENCE: string[];
  validateInventoryMarkdown: (markdown: string, trackableFileList: string[]) => string[];
  validateQa007FinalGateClosure: (markdown: string, trackableFileList: string[]) => string[];
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function readJsonWithLineComments<T>(path: string): T {
  const jsonc = readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(jsonc) as T;
}

function readRequiredScript(packageJson: PackageJson, scriptName: string) {
  const script = packageJson.scripts?.[scriptName];

  if (typeof script !== 'string') {
    throw new Error(`package.json must define scripts.${scriptName}`);
  }

  expect(script, `package.json scripts.${scriptName} must not be empty`).not.toHaveLength(0);

  return script;
}

function splitShellSequence(script: string) {
  return script
    .split('&&')
    .map((command) => command.trim())
    .filter((command) => command.length > 0);
}

function readWorkflow(path: string) {
  return readFileSync(path, 'utf8');
}

async function loadAuditBaselineModule() {
  return (await import(auditBaselineModuleUrl)) as AuditBaselineModule;
}

function requiredAuditFixturePaths(module: AuditBaselineModule) {
  return [
    ...new Set([
      ...module.REQUIRED_AREAS.flatMap((area) => area.paths),
      ...module.REQUIRED_QA005_EVIDENCE,
      ...module.REQUIRED_QA006_EVIDENCE,
      ...module.REQUIRED_QA007_EVIDENCE,
    ]),
  ];
}

function makeMinimalAuditInventory(module: AuditBaselineModule) {
  const areaRows = module.REQUIRED_AREAS.map(
    (area) =>
      `| ${area.id} | ${area.paths.map((path) => `\`${path}\``).join(', ')} | covered | S07 |`,
  ).join('\n');
  const commandRows = module.REQUIRED_COMMANDS.map((command) => {
    const exitResult = ['npm audit --audit-level=low', 'npm outdated --json'].includes(command)
      ? 'exit 1 baseline'
      : 'exit 0 baseline';

    return `| \`${command}\` | ${exitResult} | S07 |`;
  }).join('\n');

  return [
    '# Test Audit Inventory',
    '',
    '## Repo Area Coverage',
    '',
    '| Area | Required tracked paths | Baseline checked | Downstream owner(s) |',
    '| --- | --- | --- | --- |',
    areaRows,
    '',
    '## Command Baselines',
    '',
    '| Command | Current baseline | Downstream owner(s) |',
    '| --- | --- | --- |',
    commandRows,
    '',
    '## Audit Findings',
    '',
    '| ID | Area | Finding | Evidence baseline | Downstream owner(s) |',
    '| --- | --- | --- | --- | --- |',
    '| QA-001 | source | Test finding. | Test evidence. | S02 |',
    `| QA-005 | tests | S05 closed behavioral regression coverage. | Closure evidence: ${module.REQUIRED_QA005_EVIDENCE.map((evidencePath) => `\`${evidencePath}\``).join(', ')}. | S05 |`,
    `| QA-006 | docs | S06 closed docs parity coverage. | Closure evidence: ${module.REQUIRED_QA006_EVIDENCE.map((evidencePath) => `\`${evidencePath}\``).join(', ')}. Bun references in docs/node-native-inventory.md are classified as historical migration context, not current setup guidance. | S06 |`,
    `| QA-007 | scripts/workflows/package | S07 closed final integrated gate evidence. | Closure evidence: ${module.REQUIRED_QA007_EVIDENCE.map((evidencePath) => `\`${evidencePath}\``).join(', ')} plus command markers ${module.REQUIRED_QA007_COMMAND_MARKERS.map((command) => `\`${command}\``).join(', ')}. | S07 |`,
    '',
    '## Downstream Ownership',
    '',
    '- S02 owns runtime hardening.',
    '- S03 owns lint migration.',
    '- S04 owns dependency modernization.',
    '- S05 owns regression tests.',
    '- S06 owns docs parity.',
    '- S07 owns final integration.',
  ].join('\n');
}

function extractJobBlock(workflowText: string, jobName: string) {
  const jobHeader = `  ${jobName}:\n`;
  const start = workflowText.indexOf(jobHeader);

  expect(start, `workflow must define jobs.${jobName}`).not.toBe(-1);

  const afterStart = workflowText.slice(start + jobHeader.length);
  const nextJobMatch = afterStart.match(/\n {2}[A-Za-z0-9_-]+:\n/);

  if (!nextJobMatch || nextJobMatch.index === undefined) {
    return workflowText.slice(start);
  }

  return workflowText.slice(start, start + jobHeader.length + nextJobMatch.index);
}

function extractRunCommands(jobBlock: string) {
  return [...jobBlock.matchAll(/^\s*- run: (.+)$/gm)].map((match) => match[1]?.trim() ?? '');
}

function extractTableRow(markdown: string, rowMarker: string) {
  const row = markdown
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith('|') && line.includes(rowMarker));

  expect(row, `audit baseline must include row marker ${rowMarker}`).toBeDefined();

  return row ?? '';
}

function expectCommandOrder(commands: string[], earlier: string, later: string, context: string) {
  const earlierIndex = commands.indexOf(earlier);
  const laterIndex = commands.indexOf(later);

  expect(earlierIndex, `${context} must run ${earlier}`).not.toBe(-1);
  expect(laterIndex, `${context} must run ${later}`).not.toBe(-1);
  expect(earlierIndex, `${context} must run ${earlier} before ${later}`).toBeLessThan(laterIndex);
}

describe('quality gate contract', () => {
  it('keeps the standalone typecheck script strict and no-emit', () => {
    const packageJson = readJson<PackageJson>(packageJsonPath);
    const tsconfig = readJsonWithLineComments<Tsconfig>(tsconfigPath);

    const typecheck = readRequiredScript(packageJson, 'typecheck');

    expect(typecheck, 'scripts.typecheck must invoke the tracked TypeScript config').toContain(
      'tsc -p tsconfig.json',
    );
    expect(typecheck, 'scripts.typecheck must not emit artifacts').toContain('--noEmit');
    expect(typecheck, 'scripts.typecheck must expose stable file/line diagnostics').toContain(
      '--pretty false',
    );
    expect(
      tsconfig.compilerOptions?.strict,
      'tsconfig.json must keep strict type checking enabled',
    ).toBe(true);
  });

  it('requires build to pass typecheck before unchecked TypeScript emit', () => {
    const packageJson = readJson<PackageJson>(packageJsonPath);
    const tsconfigBuild = readJsonWithLineComments<Tsconfig>(tsconfigBuildPath);

    const build = readRequiredScript(packageJson, 'build');
    const commands = splitShellSequence(build);

    expect(commands[0], 'scripts.build must start with npm run typecheck').toBe(
      'npm run typecheck',
    );
    expectCommandOrder(commands, 'npm run typecheck', 'npm run build:ts', 'scripts.build');
    expect(
      tsconfigBuild.compilerOptions?.noCheck,
      'tsconfig.build.json currently emits with noCheck, so scripts.build must remain typecheck-gated',
    ).toBe(true);
  });

  it('keeps npm test gated while giving workflows a raw test command to avoid duplicate builds', () => {
    const packageJson = readJson<PackageJson>(packageJsonPath);

    const pretest = readRequiredScript(packageJson, 'pretest');
    const test = readRequiredScript(packageJson, 'test');
    const testRun = readRequiredScript(packageJson, 'test:run');

    expect(pretest, 'npm test must keep the build/typecheck lifecycle gate').toBe('npm run build');
    expect(test, 'scripts.test must delegate to the raw test runner script').toBe(
      'npm run test:run',
    );
    expect(testRun, 'scripts.test:run must execute Vitest without triggering another build').toBe(
      'vitest run',
    );
  });

  it('keeps the S04 dependency modernization contract in the quality-gate test surface', () => {
    expect(
      existsSync(dependencyModernizationContractPath),
      'S04 must keep a tracked dependency-modernization contract test',
    ).toBe(true);

    const contract = readFileSync(dependencyModernizationContractPath, 'utf8');

    expect(contract, 'S04 contract must protect package/lockfile Node floor alignment').toContain(
      'package-lock root engines.node must match package.json',
    );
    expect(contract, 'S04 contract must protect setup-node workflow alignment').toContain(
      'workflow node-version must not be an ambiguous major-only Node floor',
    );
    expect(contract, 'S04 contract must expose override regressions').toContain(
      'undocumented overrides',
    );
    expect(contract, 'S04 contract must keep the Vitest/Vite path diagnosable').toContain(
      'stale Vite paths are diagnosable',
    );
  });

  it('requires CI validation to run build before raw tests', () => {
    const workflow = readWorkflow(ciWorkflowPath);
    const ciJob = extractJobBlock(workflow, 'ci');
    const commands = extractRunCommands(ciJob);

    expectCommandOrder(commands, 'npm run build', 'npm run test:run', 'CI workflow');
    expect(
      commands,
      'CI workflow must not use npm test after an explicit build because pretest duplicates the gate',
    ).not.toContain('npm test');
  });

  it('requires release validation to run build before raw tests and packaging smoke checks', () => {
    const workflow = readWorkflow(releaseWorkflowPath);
    const validateJob = extractJobBlock(workflow, 'validate');
    const commands = extractRunCommands(validateJob);

    expectCommandOrder(commands, 'npm run build', 'npm run test:run', 'release validate job');
    expectCommandOrder(
      commands,
      'npm run build',
      'npm run smoke:install-matrix',
      'release validate job',
    );
    expect(
      commands,
      'release validate job must not use npm test after an explicit build because pretest duplicates the gate',
    ).not.toContain('npm test');
  });

  it('requires the audit baseline checker to pass against the repo inventory', () => {
    const stdout = execFileSync(process.execPath, [auditBaselineScriptPath, '--check'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const baseline = readFileSync(auditBaselineDocPath, 'utf8');

    expect(stdout).toContain('Audit baseline inventory covers');
    expect(baseline).toContain('## Repo Area Coverage');
    expect(baseline).toContain('## Command Baselines');
    expect(baseline).toContain('## Audit Findings');
    expect(baseline).toContain('## Downstream Ownership');
  });

  it('records npm run lint as the S03 Oxlint command baseline', () => {
    const baseline = readFileSync(auditBaselineDocPath, 'utf8');
    const lintRow = extractTableRow(baseline, '`npm run lint`');

    expect(lintRow, 'lint baseline must record a concrete command result').toMatch(/Exit\s+0/i);
    expect(lintRow, 'lint baseline must name Oxlint as the active surface').toContain('Oxlint');
    expect(lintRow, 'lint baseline must preserve type-aware coverage evidence').toContain(
      '--type-aware',
    );
    expect(lintRow, 'lint baseline must preserve type-check coverage evidence').toContain(
      '--type-check',
    );
    expect(lintRow, 'lint baseline must remain owned by S03/S07').toContain('S03');
    expect(lintRow, 'lint baseline must not describe the pre-S03 ESLint state').not.toContain(
      'ESLint remains',
    );
  });

  it('records QA-002 as closed by S03 and QA-003/QA-004 as closed by S04', () => {
    const baseline = readFileSync(auditBaselineDocPath, 'utf8');
    const auditRow = extractTableRow(baseline, '`npm audit --audit-level=low`');
    const outdatedRow = extractTableRow(baseline, '`npm outdated --json`');
    const qa002Row = extractTableRow(baseline, '| QA-002 |');
    const qa003Row = extractTableRow(baseline, '| QA-003 |');
    const qa004Row = extractTableRow(baseline, '| QA-004 |');

    expect(qa002Row, 'QA-002 must be an S03 closure row').toContain('S03 closed');
    expect(qa002Row, 'QA-002 closure must cite the lint-toolchain contract').toContain(
      'tests/unit/lint-toolchain-contract.test.ts',
    );
    expect(qa002Row, 'QA-002 closure must cite Oxlint evidence').toContain('Oxlint');
    expect(qa002Row, 'QA-002 closure must cite typecheck/build safety').toMatch(/typecheck|build/i);
    expect(qa002Row, 'QA-002 must not retain the old open-finding wording').not.toContain(
      'ESLint is still the lint command',
    );
    expect(qa002Row, 'QA-002 must not retain old package.json ESLint evidence').not.toContain(
      'still exposes `eslint .`',
    );
    expect(qa003Row, 'QA-003 must be an S04 audit closure row').toContain('S04 closed');
    expect(qa003Row, 'QA-003 closure must cite the low-threshold audit command').toContain(
      'npm audit --audit-level=low',
    );
    expect(qa003Row, 'QA-003 closure must cite zero vulnerabilities').toMatch(
      /0\s+vulnerabilities|total\s+0/i,
    );
    expect(qa004Row, 'QA-004 must be an S04 outdated closure row').toContain('S04 closed');
    expect(qa004Row, 'QA-004 closure must cite npm outdated').toContain('npm outdated --json');
    expect(qa004Row, 'QA-004 closure must state no direct dependency drift remains').toMatch(
      /no direct dependency drift|empty JSON object/i,
    );
    expect(auditRow, 'audit baseline may pass only with QA-003 closed').toMatch(/Exit\s+0/i);
    expect(outdatedRow, 'outdated baseline may pass only with QA-004 closed').toMatch(/Exit\s+0/i);
  });

  it('records QA-005 as closed by S05 with behavior regression evidence', () => {
    const baseline = readFileSync(auditBaselineDocPath, 'utf8');
    const qa005Row = extractTableRow(baseline, '| QA-005 |');

    expect(qa005Row, 'QA-005 must be an S05 closure row').toContain('S05 closed');
    expect(qa005Row, 'QA-005 closure must cite the shared built-CLI helper').toContain(
      'tests/helpers/cli.ts',
    );
    expect(qa005Row, 'QA-005 closure must cite the default dry-run integration flow').toContain(
      'tests/integration/default.test.ts',
    );
    expect(qa005Row, 'QA-005 closure must cite CLI behavior regression coverage').toContain(
      'tests/integration/cli-behavior.test.ts',
    );
    expect(qa005Row, 'QA-005 closure must cite existing parity evidence').toContain(
      'tests/integration/parity-baseline.test.ts',
    );
    expect(qa005Row, 'QA-005 closure must cite default-flow seam coverage').toContain(
      'tests/unit/default-flow.test.ts',
    );
    expect(qa005Row, 'QA-005 closure must cite install-surface evidence').toContain(
      'tests/unit/install-surface-contract.test.ts',
    );
    expect(qa005Row, 'QA-005 closure must cite auth fallback evidence').toContain(
      'tests/unit/secrets.test.ts',
    );
    expect(qa005Row, 'QA-005 closure must name config precedence behavior').toContain(
      'config precedence',
    );
    expect(qa005Row, 'QA-005 closure must name auth fallback behavior').toContain('auth fallback');
    expect(qa005Row, 'QA-005 closure must name install-sensitive behavior').toContain(
      'install-sensitive',
    );
    expect(qa005Row, 'QA-005 must not retain the old open-finding wording').not.toContain(
      'needs to move beyond tooling contracts',
    );
  });

  it('records QA-006 as closed by S06 with executable docs parity evidence', () => {
    const baseline = readFileSync(auditBaselineDocPath, 'utf8');
    const qa006Row = extractTableRow(baseline, '| QA-006 |');
    const qa007Row = extractTableRow(baseline, '| QA-007 |');

    expect(qa006Row, 'QA-006 must be an S06 closure row').toContain('S06 closed');
    expect(qa006Row, 'QA-006 closure must cite executable docs parity coverage').toContain(
      'tests/integration/docs-parity.test.ts',
    );
    expect(qa006Row, 'QA-006 closure must cite README parity evidence').toContain('README.md');
    expect(qa006Row, 'QA-006 closure must cite legacy spec parity evidence').toContain(
      'docs/spec.md',
    );
    expect(qa006Row, 'QA-006 closure must cite release readiness parity evidence').toContain(
      'docs/node-native-release-readiness.md',
    );
    expect(qa006Row, 'QA-006 closure must cite migration inventory classification').toContain(
      'docs/node-native-inventory.md',
    );
    expect(qa006Row, 'QA-006 closure must cite maintainer guidance parity evidence').toContain(
      'AGENTS.md',
    );
    expect(qa006Row, 'QA-006 must classify Bun references as historical context').toMatch(
      /historical migration context|migration history/i,
    );
    expect(qa006Row, 'QA-006 must state Bun references are not current setup guidance').toContain(
      'not current setup guidance',
    );
    expect(qa006Row, 'QA-006 must not retain the old open-finding wording').not.toContain(
      'need parity cleanup',
    );
    expect(qa007Row, 'QA-007 must record S07 final integration closure').toContain('S07 closed');
    expect(qa007Row, 'QA-007 closure must cite quality audit evidence').toContain(
      'docs/quality-audit-baseline.md',
    );
    expect(qa007Row, 'QA-007 closure must cite release readiness evidence').toContain(
      'docs/node-native-release-readiness.md',
    );
    expect(qa007Row, 'QA-007 closure must cite the full test command marker').toContain('npm test');
    expect(qa007Row, 'QA-007 closure must cite packed install smoke evidence').toContain(
      'npm run smoke:install-matrix',
    );
    expect(qa007Row, 'S06 must not claim final integrated gate closure').not.toMatch(
      /S06\s+closed/i,
    );
  });

  it('enforces QA-007 final-gate closure evidence when closure is claimed', async () => {
    const auditBaseline = await loadAuditBaselineModule();
    const trackablePaths = requiredAuditFixturePaths(auditBaseline);
    const validInventory = makeMinimalAuditInventory(auditBaseline);

    expect(auditBaseline.validateQa007FinalGateClosure(validInventory, trackablePaths)).toEqual([]);

    const qa007Open = validInventory.replace(
      'S07 closed final integrated gate evidence.',
      'Final integrated gate remains open.',
    );
    expect(auditBaseline.validateQa007FinalGateClosure(qa007Open, trackablePaths)).toContain(
      'finding QA-007 must record S07 closure',
    );

    const missingFullTestCommand = validInventory.replace('`npm test`, ', '');
    expect(
      auditBaseline.validateQa007FinalGateClosure(missingFullTestCommand, trackablePaths),
    ).toContain('finding QA-007 closure missing command marker: npm test');

    const missingReleaseReadinessEvidence = validInventory.replace(
      'Closure evidence: `docs/quality-audit-baseline.md`, `docs/node-native-release-readiness.md` plus command markers',
      'Closure evidence: `docs/quality-audit-baseline.md`, `docs/release-readiness.md` plus command markers',
    );
    expect(
      auditBaseline.validateQa007FinalGateClosure(missingReleaseReadinessEvidence, trackablePaths),
    ).toEqual(
      expect.arrayContaining([
        'finding QA-007 closure missing evidence marker: docs/node-native-release-readiness.md',
        'finding QA-007 closure evidence path is not tracked or trackable: docs/release-readiness.md',
      ]),
    );

    const ignoredLocalEvidence = validInventory.replace(
      'Closure evidence: `docs/quality-audit-baseline.md`, `docs/node-native-release-readiness.md` plus command markers',
      'Closure evidence: `.gsd/final-gate.md`, `docs/quality-audit-baseline.md`, `docs/node-native-release-readiness.md` plus command markers',
    );
    expect(
      auditBaseline.validateQa007FinalGateClosure(ignoredLocalEvidence, trackablePaths),
    ).toEqual(
      expect.arrayContaining([
        'finding QA-007 closure references ignored path as evidence: .gsd/final-gate.md',
        'finding QA-007 closure evidence path is not tracked or trackable: .gsd/final-gate.md',
      ]),
    );
  });

  it('rejects audit inventories with missing areas, ownerless findings, or ignored fixtures', async () => {
    const auditBaseline = await loadAuditBaselineModule();
    const trackablePaths = requiredAuditFixturePaths(auditBaseline);
    const validInventory = makeMinimalAuditInventory(auditBaseline);

    expect(auditBaseline.validateInventoryMarkdown(validInventory, trackablePaths)).toEqual([]);

    const missingScriptsArea = validInventory.replace(/^\| scripts \|.*\n/m, '');
    expect(auditBaseline.validateInventoryMarkdown(missingScriptsArea, trackablePaths)).toContain(
      'missing repo area row: scripts',
    );

    const ownerlessFinding = validInventory.replace(
      '| QA-001 | source | Test finding. | Test evidence. | S02 |',
      '| QA-001 | source | Test finding. | Test evidence. |  |',
    );
    expect(auditBaseline.validateInventoryMarkdown(ownerlessFinding, trackablePaths)).toContain(
      'finding QA-001 missing S02-S07 owner marker',
    );

    const ignoredFixture = validInventory.replace(
      '`scripts/audit-baseline.mjs`',
      '`.gsd/local-only.md`, `scripts/audit-baseline.mjs`',
    );
    expect(auditBaseline.validateInventoryMarkdown(ignoredFixture, trackablePaths)).toContain(
      'repo area coverage references ignored path as required fixture: .gsd/local-only.md',
    );

    const missingCommandResult = validInventory.replace(
      '| `npm run lint` | exit 0 baseline | S07 |',
      '| `npm run lint` | baseline | S07 |',
    );
    expect(auditBaseline.validateInventoryMarkdown(missingCommandResult, trackablePaths)).toContain(
      "command baseline 'npm run lint' missing recorded exit or timeout result",
    );

    const missingOutdatedBaseline = validInventory.replace(/^\| `npm outdated --json` \|.*\n/m, '');
    expect(
      auditBaseline.validateInventoryMarkdown(missingOutdatedBaseline, trackablePaths),
    ).toContain('missing command baseline: npm outdated --json');

    const falsePassingAudit = validInventory.replace(
      '| `npm audit --audit-level=low` | exit 1 baseline | S07 |',
      '| `npm audit --audit-level=low` | exit 0 passing baseline | S04 |',
    );
    expect(auditBaseline.validateInventoryMarkdown(falsePassingAudit, trackablePaths)).toContain(
      "command baseline 'npm audit --audit-level=low' passes before QA-003 records S04 closure",
    );

    const falsePassingOutdated = validInventory.replace(
      '| `npm outdated --json` | exit 1 baseline | S07 |',
      '| `npm outdated --json` | exit 0 empty JSON object | S04 |',
    );
    expect(auditBaseline.validateInventoryMarkdown(falsePassingOutdated, trackablePaths)).toContain(
      "command baseline 'npm outdated --json' passes before QA-004 records S04 closure",
    );

    const missingCliHelperFixture = validInventory.replace('`tests/helpers/cli.ts`, ', '');
    expect(
      auditBaseline.validateInventoryMarkdown(missingCliHelperFixture, trackablePaths),
    ).toContain("repo area 'tests' missing required tracked path marker: tests/helpers/cli.ts");

    const missingCliBehaviorFixture = validInventory.replace(
      '`tests/integration/cli-behavior.test.ts`, ',
      '',
    );
    expect(
      auditBaseline.validateInventoryMarkdown(missingCliBehaviorFixture, trackablePaths),
    ).toContain(
      "repo area 'tests' missing required tracked path marker: tests/integration/cli-behavior.test.ts",
    );

    const missingInstallSurfaceFixture = validInventory.replace(
      '`tests/unit/install-surface-contract.test.ts`, ',
      '',
    );
    expect(
      auditBaseline.validateInventoryMarkdown(missingInstallSurfaceFixture, trackablePaths),
    ).toContain(
      "repo area 'tests' missing required tracked path marker: tests/unit/install-surface-contract.test.ts",
    );

    const qa005Open = validInventory.replace('S05 closed behavioral regression coverage.', 'Open.');
    expect(auditBaseline.validateInventoryMarkdown(qa005Open, trackablePaths)).toContain(
      'finding QA-005 must record S05 closure',
    );

    const qa005MissingAuthEvidence = validInventory.replace(
      '`tests/unit/secrets.test.ts`. | S05 |',
      '| S05 |',
    );
    expect(
      auditBaseline.validateInventoryMarkdown(qa005MissingAuthEvidence, trackablePaths),
    ).toContain('finding QA-005 closure missing evidence marker: tests/unit/secrets.test.ts');

    const qa006Open = validInventory.replace('S06 closed docs parity coverage.', 'Open.');
    expect(auditBaseline.validateInventoryMarkdown(qa006Open, trackablePaths)).toContain(
      'finding QA-006 must record S06 closure',
    );

    const qa006MissingDocsParityEvidence = validInventory.replace(
      '`tests/integration/docs-parity.test.ts`, ',
      '',
    );
    expect(
      auditBaseline.validateInventoryMarkdown(qa006MissingDocsParityEvidence, trackablePaths),
    ).toContain(
      'finding QA-006 closure missing evidence marker: tests/integration/docs-parity.test.ts',
    );

    const qa006MissingInventoryHistoryClassification = validInventory.replace(
      'Bun references in docs/node-native-inventory.md are classified as historical migration context, not current setup guidance.',
      'Bun references remain documented.',
    );
    expect(
      auditBaseline.validateInventoryMarkdown(
        qa006MissingInventoryHistoryClassification,
        trackablePaths,
      ),
    ).toEqual(
      expect.arrayContaining([
        'finding QA-006 closure must classify docs/node-native-inventory.md Bun references as historical migration context',
        'finding QA-006 closure must state docs/node-native-inventory.md Bun references are not current setup guidance',
      ]),
    );
  });
});
