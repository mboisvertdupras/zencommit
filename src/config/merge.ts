const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
};

export const deepMerge = <T>(base: T, override: Partial<T>): T => {
  if (Array.isArray(base) || Array.isArray(override)) {
    return (override ?? base) as T;
  }
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override ?? base) as T;
  }

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = (base as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      result[key] = value;
    } else if (isPlainObject(value) && isPlainObject(baseValue)) {
      result[key] = deepMerge(baseValue, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  return result as T;
};
