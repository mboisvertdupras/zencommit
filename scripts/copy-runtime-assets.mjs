import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

const assets = [
  {
    from: path.join(pkgRoot, 'src', 'llm', 'prompts'),
    to: path.join(pkgRoot, 'dist', 'llm', 'prompts'),
  },
];

for (const asset of assets) {
  await fs.mkdir(path.dirname(asset.to), { recursive: true });
  await fs.cp(asset.from, asset.to, { recursive: true, force: true });
}
