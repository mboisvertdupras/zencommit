import { describe, expect, it } from 'vitest';
import { computeTokenBudget, countTokens, freeEncoding, getEncodingForModel } from './tokens.js';

const limits = { context: 100, input: 80, output: 40 };

describe('computeTokenBudget', () => {
  it('computes budget from limits and output cap', () => {
    const budget = computeTokenBudget(limits, 30, 10);
    expect(budget.outputTokens).toBe(30);
    expect(budget.inputMaxTokens).toBe(70);
    expect(budget.availableTokens).toBe(60);
  });
});

describe('countTokens', () => {
  it('counts tokens for simple text', () => {
    const encoding = getEncodingForModel('openai/gpt-4o');
    const tokens = countTokens('hello world', encoding);
    freeEncoding(encoding);
    expect(tokens).toBeGreaterThan(0);
  });
});
