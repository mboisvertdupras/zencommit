import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { getAssetName, getInstallPath } from './platform.mjs';

const REPO = 'mboisvertdupras/zencommit';
const USER_AGENT = 'zencommit-installer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

const skipChecksum =
  process.env.ZENCOMMIT_SKIP_CHECKSUM === '1' || process.env.ZENCOMMIT_SKIP_CHECKSUM === 'true';

function getReleaseBase(version) {
  const base =
    process.env.ZENCOMMIT_RELEASES_BASE_URL ??
    `https://github.com/${REPO}/releases/download`;
  const normalized = base.replace(/\/$/, '');
  return `${normalized}/v${version}`;
}

function request(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(
      url,
      {
        headers: { 'User-Agent': USER_AGENT },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        const isRedirect = [301, 302, 303, 307, 308].includes(status);
        if (isRedirect && location) {
          if (redirects <= 0) {
            res.resume();
            reject(new Error(`Too many redirects for ${url}`));
            return;
          }
          res.resume();
          const nextUrl = new URL(location, url).toString();
          request(nextUrl, redirects - 1).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`Request failed: ${status} ${res.statusMessage ?? ''} (${url})`));
          return;
        }
        resolve(res);
      },
    );
    req.on('error', reject);
  });
}

async function downloadText(url) {
  const res = await request(url);
  const chunks = [];
  for await (const chunk of res) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function downloadFile(url, destPath) {
  const res = await request(url);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const hash = crypto.createHash('sha256');
  const hashStream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(res, hashStream, createWriteStream(destPath));
  return hash.digest('hex');
}

function parseChecksum(text, assetName) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  for (const line of lines) {
    if (!line) continue;
    const [hash, file] = line.split(/\s+/);
    if (!hash || !file) continue;
    const normalized = file.replace(/^\*/, '');
    if (normalized === assetName) {
      return hash;
    }
  }
  return null;
}

async function main() {
  const pkgRaw = await fs.readFile(path.join(pkgRoot, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const version = pkg.version;
  if (!version) {
    throw new Error('package.json version is missing');
  }

  const assetName = getAssetName(version);
  const installPath = getInstallPath(pkgRoot);
  const tmpPath = `${installPath}.tmp`;
  const releaseBase = getReleaseBase(version);
  const assetUrl = `${releaseBase}/${assetName}`;
  const checksumsUrl = `${releaseBase}/checksums.txt`;

  let expectedHash = null;
  if (!skipChecksum) {
    const checksums = await downloadText(checksumsUrl);
    expectedHash = parseChecksum(checksums, assetName);
    if (!expectedHash) {
      throw new Error(`Missing checksum for ${assetName}`);
    }
  }

  await fs.rm(installPath, { force: true });
  await fs.rm(tmpPath, { force: true });
  const actualHash = await downloadFile(assetUrl, tmpPath);

  if (!skipChecksum && expectedHash && actualHash !== expectedHash) {
    await fs.rm(tmpPath, { force: true });
    throw new Error(`Checksum mismatch for ${assetName}`);
  }

  await fs.rename(tmpPath, installPath);
  if (process.platform !== 'win32') {
    await fs.chmod(installPath, 0o755);
  }

  console.log(`Installed ${assetName}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`zencommit install failed: ${message}`);
  process.exit(1);
});
