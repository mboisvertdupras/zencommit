import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJsonPath = resolve(process.cwd(), 'package.json');
const launcherPath = resolve(process.cwd(), 'bin/zencommit.js');
const smokeMatrixPath = resolve(process.cwd(), 'scripts/smoke-install-matrix.mjs');

type PackageJson = {
  main?: string;
  bin?: Record<string, string>;
  files?: string[];
  scripts?: Record<string, string>;
};

function readText(path: string) {
  return readFileSync(path, 'utf8');
}

function readJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

function readRequiredScript(packageJson: PackageJson, scriptName: string) {
  const script = packageJson.scripts?.[scriptName];

  if (typeof script !== 'string') {
    throw new Error(`package.json must define scripts.${scriptName}`);
  }

  expect(script, `package.json scripts.${scriptName} must not be empty`).not.toHaveLength(0);

  return script;
}

function extractArrowFunctionBody(source: string, functionName: string) {
  const declaration = `const ${functionName} = async (tarballPath) => {`;
  const start = source.indexOf(declaration);

  expect(start, `smoke matrix must define ${functionName}`).not.toBe(-1);

  let depth = 0;
  for (let index = start + declaration.length - 1; index < source.length; index += 1) {
    const char = source[index];

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not find complete function body for ${functionName}`);
}

describe('install surface contract', () => {
  it('publishes the built CLI entrypoint and install smoke matrix script', () => {
    const packageJson = readJson<PackageJson>(packageJsonPath);

    expect(packageJson.main, 'package.json main must point at the built ESM entrypoint').toBe(
      './dist/index.js',
    );
    expect(packageJson.bin?.zencommit, 'npm bin.zencommit must point at the tracked launcher').toBe(
      'bin/zencommit.js',
    );
    expect(packageJson.files, 'published package must include compiled runtime artifacts').toEqual(
      expect.arrayContaining(['dist', 'bin']),
    );
    expect(readRequiredScript(packageJson, 'prepack'), 'npm pack must rebuild dist first').toBe(
      'npm run build',
    );
    expect(
      readRequiredScript(packageJson, 'smoke:install-matrix'),
      'smoke:install-matrix must execute the tracked install smoke script',
    ).toBe('node scripts/smoke-install-matrix.mjs');
  });

  it('keeps the npm launcher executable under Node and wired to dist/index.js', () => {
    const launcher = readText(launcherPath);
    const distEntrySpecifier = ['..', 'dist', 'index.js'].join('/');
    const distEntryImportStatement = `import '${distEntrySpecifier}';`;

    expect(launcher, 'bin/zencommit.js must keep the Node shebang for global installs').toMatch(
      /^#!\/usr\/bin\/env node\r?\n/,
    );
    expect(launcher, 'bin/zencommit.js must load the compiled CLI entrypoint').toContain(
      distEntryImportStatement,
    );
  });

  it('keeps global, npx, and local smoke modes on dry-run mock-output coverage', () => {
    const smokeMatrix = readText(smokeMatrixPath);

    expect(
      smokeMatrix,
      'smoke matrix must inject mock output instead of requiring live provider credentials',
    ).toContain('ZENCOMMIT_MOCK_RESPONSE: JSON.stringify(mockResponse)');
    expect(smokeMatrix, 'smoke matrix must assert both generated commit output fields').toContain(
      'const expectedOutput = [mockResponse.subject, mockResponse.body];',
    );

    const globalSmoke = extractArrowFunctionBody(smokeMatrix, 'runGlobalSmoke');
    const npxSmoke = extractArrowFunctionBody(smokeMatrix, 'runNpxSmoke');
    const localSmoke = extractArrowFunctionBody(smokeMatrix, 'runLocalSmoke');

    expect(
      globalSmoke,
      'global smoke must execute zencommit in dry-run non-interactive mode',
    ).toContain("run(command, ['--dry-run', '--yes']");
    expect(globalSmoke, 'global smoke must run with the mock response environment').toContain(
      'env: smokeEnv',
    );
    expect(globalSmoke, 'global smoke must validate mock output').toContain(
      "assertSmokeResult('global', result);",
    );

    expect(npxSmoke, 'npx smoke must execute zencommit from the packed tarball').toContain(
      "['--yes', '--package', tarballPath, 'zencommit', '--dry-run', '--yes']",
    );
    expect(npxSmoke, 'npx smoke must run with the mock response environment').toContain(
      'env: smokeEnv',
    );
    expect(npxSmoke, 'npx smoke must validate mock output').toContain(
      "assertSmokeResult('npx', result);",
    );

    expect(localSmoke, 'local smoke must execute zencommit through npm exec').toContain(
      "['exec', '--yes', 'zencommit', '--', '--dry-run', '--yes']",
    );
    expect(localSmoke, 'local smoke must run with the mock response environment').toContain(
      'env: smokeEnv',
    );
    expect(localSmoke, 'local smoke must validate mock output').toContain(
      "assertSmokeResult('local', result);",
    );
  });
});
