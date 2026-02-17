import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

const sourceRoots = ['src', 'tests', 'scripts'];
const sourceExtensions = new Set(['.ts', '.js', '.mjs', '.cjs']);
const ignoredPaths = new Set(['scripts/guard-no-bun-runtime.mjs']);
const extraFiles = ['index.ts', 'eslint.config.js'];

const violations = [];

const disallowedPatterns = [
  {
    name: 'Bun runtime API reference',
    regex: /\bBun\b/g,
  },
  {
    name: 'bun shebang',
    regex: /^#!\/usr\/bin\/env bun\b/gm,
  },
];

const addViolations = (relativePath, content) => {
  for (const pattern of disallowedPatterns) {
    pattern.regex.lastIndex = 0;
    let match = pattern.regex.exec(content);
    while (match) {
      const before = content.slice(0, match.index);
      const line = before.split('\n').length;
      violations.push(`${relativePath}:${line}: ${pattern.name}`);
      match = pattern.regex.exec(content);
    }
  }
};

const scanFile = async (absolutePath) => {
  const relativePath = path.relative(pkgRoot, absolutePath);
  if (ignoredPaths.has(relativePath)) {
    return;
  }
  const content = await fs.readFile(absolutePath, 'utf8');
  addViolations(relativePath, content);
};

const scanTree = async (absoluteDir) => {
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      await scanTree(entryPath);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!sourceExtensions.has(path.extname(entry.name))) {
      continue;
    }
    await scanFile(entryPath);
  }
};

for (const root of sourceRoots) {
  await scanTree(path.join(pkgRoot, root));
}

for (const file of extraFiles) {
  await scanFile(path.join(pkgRoot, file));
}

const packageJsonPath = path.join(pkgRoot, 'package.json');
const packageRaw = await fs.readFile(packageJsonPath, 'utf8');
const packageJson = JSON.parse(packageRaw);

if (packageJson.devDependencies?.['@types/bun']) {
  violations.push('package.json: devDependencies contains @types/bun');
}

if (violations.length > 0) {
  console.error('Bun runtime references detected:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('No Bun runtime references detected in active source paths.');
