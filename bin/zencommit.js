#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getInstallPath } from '../scripts/platform.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

let binaryPath;
try {
  binaryPath = getInstallPath(pkgRoot);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`zencommit: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(binaryPath)) {
  console.error('zencommit: binary not found.');
  console.error('zencommit: reinstall the package to download the executable.');
  process.exit(1);
}

const child = spawn(binaryPath, process.argv.slice(2), { stdio: 'inherit' });
child.on('error', (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`zencommit: failed to launch: ${message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});
