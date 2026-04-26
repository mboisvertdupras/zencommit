import type { DiffMode } from '../config/types.js';
import { exec } from '../util/exec.js';

export interface DiffOptions {
  mode: DiffMode;
  cwd?: string;
  compact?: boolean;
}

const diffBaseArgs = (mode: DiffMode): string[] => {
  if (mode === 'staged') {
    return ['diff', '--cached'];
  }
  return ['diff'];
};

const diffOperation = (mode: DiffMode, suffix?: string): string =>
  suffix ? `git diff (${mode}) ${suffix}` : `git diff (${mode})`;

export const getDiff = async ({ mode, cwd, compact }: DiffOptions): Promise<string> => {
  const args = diffBaseArgs(mode);
  if (compact) {
    args.push(
      '--unified=0',
      '--no-color',
      '--no-ext-diff',
      '--diff-algorithm=histogram',
      '--no-prefix',
    );
  } else {
    args.push('--no-color');
  }
  const result = await exec(['git', ...args], { cwd, operation: diffOperation(mode) });
  return result.stdout;
};

export const getFileList = async ({ mode, cwd }: DiffOptions): Promise<string[]> => {
  const args = diffBaseArgs(mode);
  args.push('--name-only');
  const result = await exec(['git', ...args], { cwd, operation: diffOperation(mode, 'file list') });
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const parseNumstat = (
  raw: string,
): Map<string, { added: number | null; removed: number | null }> => {
  const map = new Map<string, { added: number | null; removed: number | null }>();
  const lines = raw.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const [addedRaw, removedRaw, ...pathParts] = line.split('\t');
    const filePath = pathParts.join('\t');
    const added = addedRaw === '-' ? null : Number(addedRaw);
    const removed = removedRaw === '-' ? null : Number(removedRaw);
    map.set(filePath, {
      added: Number.isFinite(added) ? added : null,
      removed: Number.isFinite(removed) ? removed : null,
    });
  }
  return map;
};

export const getFileSummary = async ({ mode, cwd }: DiffOptions): Promise<string> => {
  const baseArgs = diffBaseArgs(mode);
  const [nameStatus, numstat] = await Promise.all([
    exec(['git', ...baseArgs, '--name-status'], {
      cwd,
      operation: diffOperation(mode, 'name status'),
    }),
    exec(['git', ...baseArgs, '--numstat'], { cwd, operation: diffOperation(mode, 'numstat') }),
  ]);

  const numstatMap = parseNumstat(numstat.stdout);
  const lines = nameStatus.stdout.split(/\r?\n/).filter(Boolean);

  const summaryLines = lines.map((line) => {
    const parts = line.split('\t');
    const status = parts[0] ?? '';
    const pathPart = parts.length > 2 ? `${parts[1]} -> ${parts[2]}` : (parts[1] ?? '');
    const numstatEntry =
      numstatMap.get(parts[2] ?? '') ??
      numstatMap.get(parts[1] ?? '') ??
      numstatMap.get(pathPart) ??
      null;
    const added = numstatEntry?.added ?? null;
    const removed = numstatEntry?.removed ?? null;
    const addedText = added === null ? '?' : String(added);
    const removedText = removed === null ? '?' : String(removed);
    return `${status} ${pathPart} (+${addedText} -${removedText})`.trim();
  });

  return summaryLines.join('\n');
};
