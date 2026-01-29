const SENSITIVE_KEY_RE = /(key|token|secret|password)/i;

export const redactValue = (value: string, keep = 4): string => {
  if (!value) {
    return '';
  }
  if (value.length <= keep) {
    return '*'.repeat(value.length);
  }
  const visible = value.slice(-keep);
  return `${'*'.repeat(Math.max(0, value.length - keep))}${visible}`;
};

export const redactObject = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => redactObject(entry));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string' && SENSITIVE_KEY_RE.test(key)) {
        result[key] = redactValue(entry);
      } else {
        result[key] = redactObject(entry);
      }
    }
    return result;
  }
  return value;
};
