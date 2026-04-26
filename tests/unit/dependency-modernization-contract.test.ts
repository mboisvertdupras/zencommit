import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const packageJsonPath = resolve(repoRoot, 'package.json');
const packageLockPath = resolve(repoRoot, 'package-lock.json');
const ciWorkflowPath = resolve(repoRoot, '.github/workflows/ci.yml');
const releaseWorkflowPath = resolve(repoRoot, '.github/workflows/release.yml');
const auditBaselineDocPath = resolve(repoRoot, 'docs/quality-audit-baseline.md');
const dependencyUpgradeNotesPath = resolve(repoRoot, 'docs/dependency-upgrade-notes.md');

const requiredNodeEngine = '>=22.14.0';
const requiredWorkflowNode = '22.14.0';

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  overrides?: unknown;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

type PackageLock = {
  overrides?: unknown;
  packages?: Record<
    string,
    {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      engines?: Record<string, string>;
      overrides?: unknown;
      peerDependencies?: Record<string, string>;
      version?: string;
    }
  >;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function readWorkflow(path: string) {
  return readFileSync(path, 'utf8');
}

function getMarkdownSection(markdown: string, heading: string) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);

  expect(start, `${heading} section must exist`).not.toBe(-1);

  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
  return lines.slice(start + 1, end === -1 ? lines.length : end).join('\n');
}

function parseMajor(version: string | undefined, context: string) {
  const major = Number(version?.split('.')[0]);

  expect(Number.isInteger(major), `${context} must expose a parseable semver major`).toBe(true);

  return major;
}

function parseSemver(version: string | undefined, context: string) {
  const [major, minor, patch] = version?.split('.').map((part) => Number(part)) ?? [];

  expect(
    [major, minor, patch].every((part) => Number.isInteger(part)),
    `${context} must expose a parseable semver version`,
  ).toBe(true);

  return { major: major ?? 0, minor: minor ?? 0, patch: patch ?? 0 };
}

function expectAtLeastVersion(version: string | undefined, minimum: string, context: string) {
  const actual = parseSemver(version, context);
  const expected = parseSemver(minimum, `${context} minimum`);
  const actualParts = [actual.major, actual.minor, actual.patch];
  const expectedParts = [expected.major, expected.minor, expected.patch];

  for (const [index, actualPart] of actualParts.entries()) {
    const expectedPart = expectedParts[index] ?? 0;

    if (actualPart !== expectedPart) {
      expect(actualPart, `${context} must be at least ${minimum}`).toBeGreaterThan(expectedPart);
      return;
    }
  }
}

function parseRangeMajor(range: string | undefined, context: string) {
  const major = Number(range?.match(/\d+/)?.[0]);

  expect(Number.isInteger(major), `${context} must expose a parseable semver major`).toBe(true);

  return major;
}

function extractSetupNodeVersions(workflowText: string, workflowName: string) {
  const matches = [...workflowText.matchAll(/^\s+node-version:\s*['"]?([^'"\n]+)['"]?\s*$/gm)].map(
    (match) => match[1] ?? '',
  );

  expect(
    matches,
    `${workflowName} must configure actions/setup-node with node-version`,
  ).not.toEqual([]);

  return matches;
}

describe('dependency modernization contract', () => {
  it('aligns the public Node floor across package metadata and the npm lock root', () => {
    const packageJson = readJson<PackageJson>(packageJsonPath);
    const packageLock = readJson<PackageLock>(packageLockPath);
    const lockRoot = packageLock.packages?.[''];

    expect(
      packageJson.engines?.node,
      'package.json engines.node must declare the S04 Node floor',
    ).toBe(requiredNodeEngine);
    expect(lockRoot?.engines?.node, 'package-lock root engines.node must match package.json').toBe(
      packageJson.engines?.node,
    );
  });

  it('runs CI and release validation on the explicit S04 Node floor instead of bare Node 22', () => {
    const workflowVersions = [
      ...extractSetupNodeVersions(readWorkflow(ciWorkflowPath), 'CI workflow'),
      ...extractSetupNodeVersions(readWorkflow(releaseWorkflowPath), 'release workflow'),
    ];

    expect(workflowVersions).toEqual(
      expect.arrayContaining([requiredWorkflowNode, requiredWorkflowNode, requiredWorkflowNode]),
    );

    for (const version of workflowVersions) {
      expect(
        version,
        'workflow node-version must not be an ambiguous major-only Node floor',
      ).not.toBe('22');
      expect(
        version,
        'workflow node-version must use the exact S04 Node 22.14+ floor until a later explicit floor is approved',
      ).toBe(requiredWorkflowNode);
    }
  });

  it('does not hide dependency issues behind undocumented npm overrides', () => {
    const packageJson = readJson<PackageJson>(packageJsonPath);
    const packageLock = readJson<PackageLock>(packageLockPath);
    const lockRoot = packageLock.packages?.[''];

    expect(
      packageJson.overrides,
      'package.json must not use dependency overrides for S04',
    ).toBeUndefined();
    expect(
      packageLock.overrides,
      'package-lock must not contain top-level undocumented overrides',
    ).toBeUndefined();
    expect(
      lockRoot?.overrides,
      'package-lock root must not contain undocumented overrides',
    ).toBeUndefined();
  });

  it('keeps the Vitest/Vite lockfile path on Vite 8 with explicit package-script ownership', () => {
    const packageJson = readJson<PackageJson>(packageJsonPath);
    const packageLock = readJson<PackageLock>(packageLockPath);
    const packages = packageLock.packages ?? {};
    const vite = packages['node_modules/vite'];

    if (vite === undefined) {
      return;
    }

    const postcss = packages['node_modules/postcss'];
    const vitest = packages['node_modules/vitest'];
    const testRun = packageJson.scripts?.['test:run'];

    expect(testRun, 'scripts.test:run must keep invoking Vitest while Vite is in the graph').toBe(
      'vitest run',
    );
    expect(
      packageJson.devDependencies?.vitest,
      'package.json must keep Vitest as the tracked test runner while Vite is in the graph',
    ).toBeDefined();
    expect(
      packageJson.devDependencies?.vite,
      'package.json must keep direct Vite ownership so the lockfile resolves the approved Vite 8 path',
    ).toBeDefined();
    expect(
      parseRangeMajor(packageJson.devDependencies?.vite, 'package.json devDependencies.vite'),
      'package.json must track Vite major 8 while Vitest leaves Vite in the dependency graph',
    ).toBeGreaterThanOrEqual(8);
    expect(
      parseRangeMajor(packageJson.devDependencies?.vitest, 'package.json devDependencies.vitest'),
      'package.json must track modern Vitest for the Vite 8 path',
    ).toBeGreaterThanOrEqual(4);
    expect(
      vitest,
      'node_modules/vitest must be locked when node_modules/vite is locked',
    ).toBeDefined();
    expect(
      vitest?.dependencies?.vite,
      'Vitest must keep declaring the Vite range it resolves so stale Vite paths are diagnosable',
    ).toContain('^8.0.0');
    expect(
      parseMajor(vitest?.version, 'locked Vitest version'),
      'locked Vitest must stay on the modern Vitest major for the Vite 8 proof path',
    ).toBeGreaterThanOrEqual(4);
    expect(
      parseMajor(vite.version, 'locked Vite version'),
      'locked Vite must resolve to major 8 or newer when Vite remains in the graph',
    ).toBeGreaterThanOrEqual(8);
    expectAtLeastVersion(postcss?.version, '8.5.10', 'locked PostCSS version');
  });

  it('keeps TypeScript package metadata aligned with the upgraded compiler', () => {
    const packageJson = readJson<PackageJson>(packageJsonPath);
    const packageLock = readJson<PackageLock>(packageLockPath);
    const lockRoot = packageLock.packages?.[''];
    const lockedTypeScript = packageLock.packages?.['node_modules/typescript'];

    expect(packageJson.devDependencies?.typescript, 'package.json must track TypeScript 6').toBe(
      '^6.0.3',
    );
    expect(
      packageJson.peerDependencies?.typescript,
      'public TypeScript peer must match dev compiler',
    ).toBe(packageJson.devDependencies?.typescript);
    expect(
      lockRoot?.peerDependencies?.typescript,
      'package-lock root TypeScript peer must match package.json',
    ).toBe(packageJson.peerDependencies?.typescript);
    expect(
      parseMajor(lockedTypeScript?.version, 'locked TypeScript version'),
      'locked TypeScript must resolve to the upgraded compiler major',
    ).toBeGreaterThanOrEqual(6);
  });

  it('locks patched transitive audit dependencies without package overrides', () => {
    const packageLock = readJson<PackageLock>(packageLockPath);
    const packages = packageLock.packages ?? {};
    const lockedMinimatch = packages['node_modules/minimatch'];
    const lockedBraceExpansion = packages['node_modules/brace-expansion'];

    expectAtLeastVersion(
      lockedMinimatch?.version,
      '9.0.7',
      'locked minimatch version used by glob',
    );
    expectAtLeastVersion(
      lockedBraceExpansion?.version,
      '2.0.3',
      'locked brace-expansion version used by minimatch',
    );
    expect(
      packages['node_modules/glob']?.dependencies?.minimatch,
      'glob must keep using its normal minimatch range rather than an override-only fix',
    ).toContain('^9.0.4');
  });

  it('documents direct dependency currency, exception policy, and S04 audit closure', () => {
    const packageJson = readJson<PackageJson>(packageJsonPath);
    const auditBaseline = readFileSync(auditBaselineDocPath, 'utf8');
    const dependencyNotes = readFileSync(dependencyUpgradeNotesPath, 'utf8');
    const exceptionSection = getMarkdownSection(
      dependencyNotes,
      'Intentional Runtime Pins / Exceptions',
    );

    expect(
      Object.keys(packageJson.dependencies ?? {}),
      'runtime dependencies must be explicit',
    ).not.toHaveLength(0);
    expect(auditBaseline, 'QA-003 must record S04 audit closure').toContain('S04 closed');
    expect(auditBaseline, 'audit baseline must record low-threshold audit pass').toContain(
      '`npm audit --audit-level=low`',
    );
    expect(auditBaseline, 'QA-004 must record empty outdated JSON evidence').toContain(
      'empty JSON object',
    );
    expect(
      dependencyNotes,
      'dependency notes must record the final outdated command result',
    ).toContain('`npm outdated --json` returned an empty JSON object');
    expect(
      exceptionSection,
      'S04 must either say no direct dependency exceptions remain or list package/version/reason/follow-up fields',
    ).toMatch(/None for direct runtime or dev dependencies/i);
  });
});
