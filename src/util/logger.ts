let verbosity = 0;

const clampVerbosity = (level: number): number => {
  if (!Number.isFinite(level)) {
    return 0;
  }
  return Math.max(0, Math.min(3, Math.floor(level)));
};

export const setVerbosity = (level: number): void => {
  verbosity = clampVerbosity(level);
};

export const getVerbosity = (): number => verbosity;

const prefix = (level: number): string => `[v${level}]`;

export const logVerbose = (level: number, message: string, data?: unknown): void => {
  if (verbosity < level) {
    return;
  }
  if (data !== undefined) {
    console.error(`${prefix(level)} ${message}`, data);
    return;
  }
  console.error(`${prefix(level)} ${message}`);
};

export const logBlock = (level: number, label: string, content?: unknown): void => {
  if (verbosity < level) {
    return;
  }
  console.error(`${prefix(level)} ${label}`);
  if (content === undefined) {
    return;
  }
  if (typeof content === 'string') {
    const trimmed = content.trimEnd();
    console.error(trimmed.length > 0 ? trimmed : '(empty)');
    return;
  }
  console.error(JSON.stringify(content, null, 2));
};

export const logJson = (level: number, label: string, value: unknown): void => {
  if (verbosity < level) {
    return;
  }
  logBlock(level, label, JSON.stringify(value, null, 2));
};
