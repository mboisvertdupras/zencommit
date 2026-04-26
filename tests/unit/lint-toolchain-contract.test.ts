import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

type Tsconfig = {
  compilerOptions?: Record<string, unknown>;
};

type OxlintConfig = {
  plugins?: string[];
  options?: Record<string, unknown>;
  rules?: Record<string, unknown>;
};

const repoRoot = process.cwd();
const packageJsonPath = resolve(repoRoot, 'package.json');
const oxlintConfigPath = resolve(repoRoot, '.oxlintrc.json');
const tsconfigBuildPath = resolve(repoRoot, 'tsconfig.build.json');
const deletedLegacyArtifacts = ['eslint' + '.config.js', 'tsconfig.' + 'eslint.json'];
const activeRoots = ['src', 'tests', 'scripts'];
const activeConfigFiles = [
  'package.json',
  '.oxlintrc.json',
  'tsconfig.json',
  'tsconfig.build.json',
  'tsconfig.test.json',
];
const sourceExtensions = new Set(['.ts', '.js', '.mjs', '.cjs', '.json']);
const ignoredPathPrefixes = ['node_modules/', 'dist/', 'coverage/', '.gsd/', '.worktrees/'];
const legacyLintPackages = [
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'eslint',
  'eslint-config-prettier',
  'globals',
];

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

function collectActiveFiles() {
  const files: string[] = [];

  const visit = (absolutePath: string) => {
    const relativePath = relative(repoRoot, absolutePath);

    if (ignoredPathPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
      return;
    }

    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      for (const entry of readdirSync(absolutePath)) {
        visit(join(absolutePath, entry));
      }
      return;
    }

    if (!stats.isFile() || !sourceExtensions.has(extname(absolutePath))) {
      return;
    }

    files.push(relativePath);
  };

  for (const root of activeRoots) {
    visit(resolve(repoRoot, root));
  }

  for (const file of activeConfigFiles) {
    if (existsSync(resolve(repoRoot, file))) {
      files.push(file);
    }
  }

  return [...new Set(files)].sort();
}

function findForbiddenSuppressions() {
  const forbiddenSuppressions = [
    {
      name: 'broad legacy lint disable without rule names',
      pattern: new RegExp(
        String.raw`^\s*//\s*` + 'eslint-disable' + String.raw`(?:\s*(?:--.*)?)?$`,
        'm',
      ),
    },
    {
      name: 'TypeScript ignore directive',
      pattern: new RegExp(String.raw`^\s*//\s*@ts-` + 'ignore' + String.raw`\b`, 'm'),
    },
  ];

  const violations: string[] = [];

  for (const file of collectActiveFiles()) {
    const content = readFileSync(resolve(repoRoot, file), 'utf8');

    for (const suppression of forbiddenSuppressions) {
      suppression.pattern.lastIndex = 0;
      const match = suppression.pattern.exec(content);
      if (!match || match.index === undefined) {
        continue;
      }

      const line = content.slice(0, match.index).split('\n').length;
      violations.push(`${file}:${line}: ${suppression.name}`);
    }
  }

  return violations;
}

describe('lint toolchain contract', () => {
  it('uses Oxlint for lint scripts and keeps the required Oxlint package/config surface', () => {
    const packageJson = readJson<PackageJson>(packageJsonPath);
    const oxlintConfig = readJson<OxlintConfig>(oxlintConfigPath);

    const lint = readRequiredScript(packageJson, 'lint');
    const lintFix = readRequiredScript(packageJson, 'lint:fix');
    const allDependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(lint, 'scripts.lint must invoke Oxlint').toMatch(/^oxlint\b/);
    expect(lint, 'scripts.lint must not invoke legacy ESLint').not.toContain('eslint');
    expect(lint, 'scripts.lint must keep type-aware linting enabled').toContain('--type-aware');
    expect(lint, 'scripts.lint must keep type-check linting enabled').toContain('--type-check');
    expect(lint, 'scripts.lint must fail on Oxlint warnings').toContain('--deny-warnings');

    expect(lintFix, 'scripts.lint:fix must invoke Oxlint').toMatch(/^oxlint\b/);
    expect(lintFix, 'scripts.lint:fix must request autofixes').toContain('--fix');
    expect(lintFix, 'scripts.lint:fix must not invoke legacy ESLint').not.toContain('eslint');

    expect(allDependencies.oxlint, 'package.json must keep oxlint installed').toBeDefined();
    expect(
      allDependencies['oxlint-tsgolint'],
      'package.json must keep oxlint-tsgolint installed',
    ).toBeDefined();
    expect(existsSync(oxlintConfigPath), '.oxlintrc.json must exist').toBe(true);
    expect(oxlintConfig.plugins, '.oxlintrc.json must enable TypeScript coverage').toContain(
      'typescript',
    );
    expect(oxlintConfig.plugins, '.oxlintrc.json must enable unicorn coverage').toContain(
      'unicorn',
    );
    expect(oxlintConfig.plugins, '.oxlintrc.json must enable oxc coverage').toContain('oxc');
    expect(oxlintConfig.options?.typeAware, '.oxlintrc.json must enable type-aware mode').toBe(
      true,
    );
    expect(oxlintConfig.options?.typeCheck, '.oxlintrc.json must enable type-check mode').toBe(
      true,
    );
    expect(
      oxlintConfig.options?.reportUnusedDisableDirectives,
      '.oxlintrc.json must reject unused disable directives',
    ).toBe('error');
  });

  it('removes legacy ESLint artifacts, direct dependencies, and active tooling references', () => {
    const packageJson = readJson<PackageJson>(packageJsonPath);
    const dependencies = packageJson.dependencies ?? {};
    const devDependencies = packageJson.devDependencies ?? {};
    const activeFiles = collectActiveFiles();

    for (const artifact of deletedLegacyArtifacts) {
      expect(existsSync(resolve(repoRoot, artifact)), `${artifact} must be deleted`).toBe(false);
    }

    for (const packageName of legacyLintPackages) {
      expect(dependencies, `dependencies must not include ${packageName}`).not.toHaveProperty(
        packageName,
      );
      expect(devDependencies, `devDependencies must not include ${packageName}`).not.toHaveProperty(
        packageName,
      );
    }

    for (const file of activeFiles) {
      const content = readFileSync(resolve(repoRoot, file), 'utf8');
      expect(content, `${file} must not reference ${deletedLegacyArtifacts[0]}`).not.toContain(
        deletedLegacyArtifacts[0],
      );
      expect(content, `${file} must not reference ${deletedLegacyArtifacts[1]}`).not.toContain(
        deletedLegacyArtifacts[1],
      );
    }
  });

  it('guards against broad unsafe suppression comments in active tracked files', () => {
    expect(findForbiddenSuppressions()).toEqual([]);
  });

  it('keeps unchecked build emit protected by the explicit typecheck gate', () => {
    const packageJson = readJson<PackageJson>(packageJsonPath);
    const tsconfigBuild = readJsonWithLineComments<Tsconfig>(tsconfigBuildPath);

    const typecheck = readRequiredScript(packageJson, 'typecheck');
    const build = readRequiredScript(packageJson, 'build');
    const buildCommands = splitShellSequence(build);

    expect(typecheck, 'scripts.typecheck must run the tracked TypeScript config').toContain(
      'tsc -p tsconfig.json',
    );
    expect(typecheck, 'scripts.typecheck must not emit artifacts').toContain('--noEmit');
    expect(buildCommands[0], 'scripts.build must start with npm run typecheck').toBe(
      'npm run typecheck',
    );
    expect(buildCommands, 'scripts.build must typecheck before noCheck build emit').toContain(
      'npm run build:ts',
    );
    expect(
      buildCommands.indexOf('npm run typecheck'),
      'scripts.build must run typecheck before build:ts',
    ).toBeLessThan(buildCommands.indexOf('npm run build:ts'));
    expect(
      tsconfigBuild.compilerOptions?.noCheck,
      'tsconfig.build.json emits with noCheck, so scripts.build must stay typecheck-gated',
    ).toBe(true);
  });
});
