import { describe, expect, it } from 'vitest';
import { deepMerge } from './merge.js';

describe('deepMerge', () => {
  it('merges nested objects', () => {
    const base = { a: { b: 1, c: 2 }, d: 3 };
    const override = { a: { b: 9 } };
    const result = deepMerge(base, override);
    expect(result).toEqual({ a: { b: 9, c: 2 }, d: 3 });
  });

  it('replaces arrays', () => {
    const base = { items: [1, 2, 3] };
    const override = { items: [9] };
    const result = deepMerge(base, override);
    expect(result).toEqual({ items: [9] });
  });

  it('replaces scalars', () => {
    const base = { value: 1 };
    const override = { value: 2 };
    const result = deepMerge(base, override);
    expect(result).toEqual({ value: 2 });
  });
});
