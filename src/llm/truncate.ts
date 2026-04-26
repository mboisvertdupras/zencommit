import type { DiffConfig } from '../config/types.js';
import { countTokens, type TokenEncoder } from './tokens.js';

export type TruncateMode = 'full' | 'byFile' | 'smart' | 'summaryOnly';

export interface TruncateResult {
  text: string;
  usedTokens: number;
  truncated: boolean;
  mode: TruncateMode;
}

interface DiffHunk {
  header: string;
  lines: string[];
  addedLines: string[];
  removedLines: string[];
  definitionLines: string[];
}

interface DiffFile {
  path: string;
  headerLines: string[];
  hunks: DiffHunk[];
  isBinary: boolean;
}

const TRUNCATION_MARKER = '... truncated';
const OMITTED_MARKER = (added: number, removed: number): string =>
  `... omitted (+${added} additions, -${removed} deletions)`;

const isDefinitionLine = (line: string): boolean => {
  if (!line.startsWith('+') || line.startsWith('+++')) {
    return false;
  }
  const content = line.slice(1).trim();
  return (
    /^(export\s+)?(async\s+)?(function|class|interface|type)\b/.test(content) ||
    /^def\s+/.test(content) ||
    /^fn\s+/.test(content) ||
    /^struct\s+/.test(content)
  );
};

const parseDiff = (diffText: string): DiffFile[] => {
  const lines = diffText.split(/\r?\n/);
  const files: DiffFile[] = [];
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;

  const finalizeFile = () => {
    if (currentFile) {
      files.push(currentFile);
    }
  };

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      finalizeFile();
      const match = /^diff --git\s+(\S+)\s+(\S+)/.exec(line);
      const pathRaw = match?.[2] ?? match?.[1] ?? 'unknown';
      const path = pathRaw.replace(/^a\//, '').replace(/^b\//, '');
      currentFile = {
        path,
        headerLines: [line],
        hunks: [],
        isBinary: false,
      };
      currentHunk = null;
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (line.startsWith('index ')) {
      continue;
    }

    if (line.startsWith('Binary files')) {
      currentFile.isBinary = true;
      currentFile.headerLines.push(line);
      continue;
    }

    if (line.startsWith('@@')) {
      currentHunk = {
        header: line,
        lines: [],
        addedLines: [],
        removedLines: [],
        definitionLines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (currentHunk) {
      currentHunk.lines.push(line);
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.addedLines.push(line);
        if (isDefinitionLine(line)) {
          currentHunk.definitionLines.push(line);
        }
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunk.removedLines.push(line);
      }
      continue;
    }

    currentFile.headerLines.push(line);
  }

  finalizeFile();
  return files;
};

const tokensForLines = (lines: string[], encoding: TokenEncoder): number => {
  if (lines.length === 0) {
    return 0;
  }
  return countTokens(`${lines.join('\n')}\n`, encoding);
};

const truncateLinesToBudget = (
  lines: string[],
  budget: number,
  encoding: TokenEncoder,
): string[] => {
  const output: string[] = [];
  let used = 0;
  for (const line of lines) {
    const lineTokens = countTokens(`${line}\n`, encoding);
    if (used + lineTokens > budget) {
      break;
    }
    output.push(line);
    used += lineTokens;
  }
  return output;
};

const buildByFileSection = (
  file: DiffFile,
  tokenBudget: number,
  encoding: TokenEncoder,
): { lines: string[]; truncated: boolean } => {
  const lines: string[] = [];
  let truncated = false;
  let usedTokens = 0;

  const headerTokens = tokensForLines(file.headerLines, encoding);
  if (headerTokens > tokenBudget) {
    const trimmedHeader = truncateLinesToBudget(file.headerLines, tokenBudget, encoding);
    return { lines: trimmedHeader, truncated: true };
  }

  lines.push(...file.headerLines);
  usedTokens += headerTokens;

  for (const hunk of file.hunks) {
    const hunkHeaderTokens = countTokens(`${hunk.header}\n`, encoding);
    if (usedTokens + hunkHeaderTokens > tokenBudget) {
      truncated = true;
      break;
    }
    lines.push(hunk.header);
    usedTokens += hunkHeaderTokens;

    for (const line of hunk.lines) {
      if (line.startsWith(' ') || line.startsWith('+++') || line.startsWith('---')) {
        continue;
      }
      const lineTokens = countTokens(`${line}\n`, encoding);
      if (usedTokens + lineTokens > tokenBudget) {
        truncated = true;
        break;
      }
      lines.push(line);
      usedTokens += lineTokens;
    }

    if (truncated) {
      break;
    }
  }

  if (truncated) {
    lines.push(TRUNCATION_MARKER);
  }

  return { lines, truncated };
};

const getFileTokenSize = (file: DiffFile, encoding: TokenEncoder): number => {
  const allLines: string[] = [...file.headerLines];
  for (const hunk of file.hunks) {
    allLines.push(hunk.header, ...hunk.lines.filter((line) => !line.startsWith(' ')));
  }
  return tokensForLines(allLines, encoding);
};

export const truncateDiffByFile = (
  diffText: string,
  budgetTokens: number,
  encoding: TokenEncoder,
): TruncateResult => {
  if (budgetTokens <= 0) {
    return { text: '', usedTokens: 0, truncated: true, mode: 'summaryOnly' };
  }

  const files = parseDiff(diffText);
  const fileSizes = files.map((file) => getFileTokenSize(file, encoding));
  const minQuota = 120;
  const allocations: number[] = Array.from({ length: files.length }, () => 0);
  let remaining = budgetTokens;

  for (let i = 0; i < files.length; i += 1) {
    const quota = Math.min(fileSizes[i] ?? 0, minQuota);
    const allocation = Math.min(quota, remaining);
    allocations[i] = allocation;
    remaining -= allocation;
    if (remaining <= 0) {
      break;
    }
  }

  if (remaining > 0) {
    const extras = fileSizes.map((size, index) => Math.max(0, size - (allocations[index] ?? 0)));
    const extrasTotal = extras.reduce((sum, size) => sum + size, 0);
    for (let i = 0; i < files.length; i += 1) {
      if (remaining <= 0) {
        break;
      }
      const extra = extras[i] ?? 0;
      const extraShare = extrasTotal > 0 ? Math.floor((extra / extrasTotal) * remaining) : 0;
      allocations[i] = (allocations[i] ?? 0) + extraShare;
    }
  }

  const outputLines: string[] = [];
  let truncated = false;
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    if (!file) {
      continue;
    }
    const allocation = allocations[i] ?? 0;
    if (allocation <= 0) {
      truncated = true;
      continue;
    }
    const section = buildByFileSection(file, allocation, encoding);
    if (outputLines.length > 0 && section.lines.length > 0) {
      outputLines.push('');
    }
    outputLines.push(...section.lines);
    truncated = truncated || section.truncated;
  }

  const text = outputLines.join('\n');
  const usedTokens = countTokens(text, encoding);

  return {
    text,
    usedTokens,
    truncated,
    mode: truncated ? 'byFile' : 'full',
  };
};

const GENERATED_PATH_PATTERNS = [
  /node_modules\//,
  /dist\//,
  /build\//,
  /vendor\//,
  /coverage\//,
  /\.min\./,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /bun\.lock$/,
];

const SOURCE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'cpp',
  'c',
  'h',
  'hpp',
  'cs',
  'rb',
  'php',
  'scala',
  'clj',
]);

const DOC_EXTENSIONS = new Set(['md', 'txt', 'rst']);

const isGeneratedPath = (filePath: string): boolean =>
  GENERATED_PATH_PATTERNS.some((pattern) => pattern.test(filePath));

const getExtension = (filePath: string): string | null => {
  const parts = filePath.split('.');
  if (parts.length <= 1) {
    return null;
  }
  return parts[parts.length - 1]?.toLowerCase() ?? null;
};

const scoreHunk = (filePath: string, hunk: DiffHunk): number => {
  let score = 1;
  const ext = getExtension(filePath);
  if (isGeneratedPath(filePath)) {
    score -= 2;
  }
  if (ext && SOURCE_EXTENSIONS.has(ext)) {
    score += 1;
  }
  if (ext && DOC_EXTENSIONS.has(ext)) {
    score -= 0.5;
  }
  score += Math.min(2, hunk.definitionLines.length * 0.5);
  const changes = hunk.addedLines.length + hunk.removedLines.length;
  score += 1 / (1 + changes / 10);
  return score;
};

interface HunkSelection {
  fileIndex: number;
  hunkIndex: number;
  score: number;
}

const selectHunkLines = (
  hunk: DiffHunk,
  config: DiffConfig,
): { lines: string[]; omittedAdded: number; omittedRemoved: number } => {
  const selected: string[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let omittedAdded = 0;
  let omittedRemoved = 0;

  for (const line of hunk.lines) {
    if (line.startsWith(' ') || line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }
    const isAdd = line.startsWith('+');
    const isRemove = line.startsWith('-');
    const isDefinition = isDefinitionLine(line);

    if (isAdd) {
      if (isDefinition || addedCount < config.smart.maxAddedLinesPerHunk) {
        selected.push(line);
        if (!isDefinition) {
          addedCount += 1;
        }
      } else {
        omittedAdded += 1;
      }
    } else if (isRemove) {
      if (removedCount < config.smart.maxRemovedLinesPerHunk) {
        selected.push(line);
        removedCount += 1;
      } else {
        omittedRemoved += 1;
      }
    }
  }

  return { lines: selected, omittedAdded, omittedRemoved };
};

const buildSmartDiff = (
  files: DiffFile[],
  selections: HunkSelection[],
  config: DiffConfig,
): string => {
  const selectedByFile = new Map<number, Set<number>>();
  for (const selection of selections) {
    if (!selectedByFile.has(selection.fileIndex)) {
      selectedByFile.set(selection.fileIndex, new Set());
    }
    selectedByFile.get(selection.fileIndex)?.add(selection.hunkIndex);
  }

  const lines: string[] = [];
  files.forEach((file, fileIndex) => {
    if (file.isBinary) {
      lines.push(`BINARY FILE CHANGED (${file.path})`);
      lines.push('');
      return;
    }

    const selectedHunks = selectedByFile.get(fileIndex);
    if (!selectedHunks || selectedHunks.size === 0) {
      return;
    }

    lines.push(...file.headerLines);
    file.hunks.forEach((hunk, hunkIndex) => {
      if (!selectedHunks.has(hunkIndex)) {
        return;
      }
      const selection = selectHunkLines(hunk, config);
      lines.push(hunk.header);
      lines.push(...selection.lines);
      if (selection.omittedAdded + selection.omittedRemoved > 0) {
        lines.push(OMITTED_MARKER(selection.omittedAdded, selection.omittedRemoved));
      }
    });
    lines.push('');
  });

  return lines.join('\n').trim();
};

const buildHeadersOnlyDiff = (files: DiffFile[], selections: HunkSelection[]): string => {
  const selectedByFile = new Map<number, Set<number>>();
  for (const selection of selections) {
    if (!selectedByFile.has(selection.fileIndex)) {
      selectedByFile.set(selection.fileIndex, new Set());
    }
    selectedByFile.get(selection.fileIndex)?.add(selection.hunkIndex);
  }

  const lines: string[] = [];
  files.forEach((file, fileIndex) => {
    const selectedHunks = selectedByFile.get(fileIndex);
    if (!selectedHunks || selectedHunks.size === 0) {
      return;
    }

    if (file.isBinary) {
      lines.push(`BINARY FILE CHANGED (${file.path})`);
      lines.push('');
      return;
    }

    lines.push(...file.headerLines);
    file.hunks.forEach((hunk, hunkIndex) => {
      if (selectedHunks.has(hunkIndex)) {
        lines.push(hunk.header);
      }
    });
    lines.push('');
  });

  return lines.join('\n').trim();
};

export const truncateDiffSmart = (
  fileSummary: string,
  diffText: string,
  budgetTokens: number,
  config: DiffConfig,
  encoding: TokenEncoder,
): TruncateResult => {
  if (budgetTokens <= 0) {
    return {
      text: fileSummary.trim(),
      usedTokens: countTokens(fileSummary, encoding),
      truncated: true,
      mode: 'summaryOnly',
    };
  }

  const summaryBlock = fileSummary.trim() ? `File summary:\n${fileSummary.trim()}\n` : '';
  const summaryTokens = countTokens(summaryBlock, encoding);
  if (summaryTokens >= budgetTokens) {
    const trimmed = truncateLinesToBudget(summaryBlock.split(/\r?\n/), budgetTokens, encoding).join(
      '\n',
    );
    return {
      text: trimmed,
      usedTokens: countTokens(trimmed, encoding),
      truncated: true,
      mode: 'summaryOnly',
    };
  }

  const files = parseDiff(diffText);
  const hunks: HunkSelection[] = [];

  files.forEach((file, fileIndex) => {
    file.hunks.forEach((hunk, hunkIndex) => {
      hunks.push({ fileIndex, hunkIndex, score: scoreHunk(file.path, hunk) });
    });
  });

  hunks.sort((a, b) => b.score - a.score);

  const selections: HunkSelection[] = [];
  let usedTokens = summaryTokens;
  const selectedFiles = new Set<number>();

  for (const hunk of hunks) {
    const file = files[hunk.fileIndex];
    const hunkData = file?.hunks[hunk.hunkIndex];
    if (!file || !hunkData) {
      continue;
    }

    const headerTokens = selectedFiles.has(hunk.fileIndex)
      ? 0
      : tokensForLines(file.headerLines, encoding);
    const selectionLines = selectHunkLines(hunkData, config);
    const hunkLines = [hunkData.header, ...selectionLines.lines];
    if (selectionLines.omittedAdded + selectionLines.omittedRemoved > 0) {
      hunkLines.push(OMITTED_MARKER(selectionLines.omittedAdded, selectionLines.omittedRemoved));
    }
    const hunkTokens = tokensForLines(hunkLines, encoding);

    if (usedTokens + headerTokens + hunkTokens > budgetTokens) {
      continue;
    }

    selections.push(hunk);
    usedTokens += headerTokens + hunkTokens;
    selectedFiles.add(hunk.fileIndex);
  }

  let diffBody = buildSmartDiff(files, selections, config);
  let diffTokens = countTokens(diffBody, encoding);
  let combined = `${summaryBlock}${diffBody}`.trim();
  let combinedTokens = countTokens(combined, encoding);

  if (combinedTokens > budgetTokens) {
    diffBody = buildHeadersOnlyDiff(files, selections);
    diffTokens = countTokens(diffBody, encoding);
    combined = `${summaryBlock}${diffBody}`.trim();
    combinedTokens = countTokens(combined, encoding);
  }

  if (combinedTokens > budgetTokens) {
    combined = summaryBlock.trim();
    combinedTokens = countTokens(combined, encoding);
    return { text: combined, usedTokens: combinedTokens, truncated: true, mode: 'summaryOnly' };
  }

  return {
    text: combined,
    usedTokens: combinedTokens,
    truncated: diffTokens < countTokens(diffText, encoding),
    mode: 'smart',
  };
};
