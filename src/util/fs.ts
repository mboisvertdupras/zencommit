import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const getConfigRoot = (): string =>
  process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');

export const getCacheRoot = (): string =>
  process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');

export const ensureDir = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const readJsonFile = async <T>(filePath: string): Promise<T | null> => {
  if (!(await fileExists(filePath))) {
    return null;
  }
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
};

export const writeJsonFile = async (filePath: string, data: unknown): Promise<void> => {
  await ensureDir(path.dirname(filePath));
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(filePath, content, 'utf8');
};

export const resolvePath = (inputPath: string, baseDir?: string): string => {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  if (baseDir) {
    return path.join(baseDir, inputPath);
  }
  return path.resolve(inputPath);
};
