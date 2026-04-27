import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

const requiredFiles = [
  'dist/index.js',
  'dist/llm/prompts/base.md',
  'dist/llm/prompts/conventional.md',
  'dist/llm/prompts/gitmoji.md',
  'dist/llm/prompts/system.md',
];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(pkgRoot, relativePath);
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`Missing required build artifact: ${relativePath}`);
  }
}

const distEntrypoint = path.join(pkgRoot, 'dist', 'index.js');
const entrypoint = await fs.readFile(distEntrypoint, 'utf8');
if (!entrypoint.startsWith('#!/usr/bin/env node')) {
  throw new Error('dist/index.js must preserve a Node shebang.');
}

console.log('dist artifact verification passed');
