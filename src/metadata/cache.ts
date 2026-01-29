import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureDir } from '../util/fs.js';

export const readCache = async (
  cachePath: string,
): Promise<{ data: unknown; mtimeMs: number } | null> => {
  try {
    const stat = await fs.stat(cachePath);
    const content = await fs.readFile(cachePath, 'utf8');
    return { data: JSON.parse(content), mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
};

export const writeCache = async (cachePath: string, data: unknown): Promise<void> => {
  await ensureDir(path.dirname(cachePath));
  await fs.writeFile(cachePath, `${JSON.stringify(data)}\n`, 'utf8');
};

export const isCacheFresh = (mtimeMs: number, ttlHours: number): boolean => {
  if (!Number.isFinite(ttlHours)) {
    return false;
  }
  const ttlMs = ttlHours * 60 * 60 * 1000;
  return Date.now() - mtimeMs <= ttlMs;
};
