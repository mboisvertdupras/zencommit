import { describe, expect, it } from 'vitest';
import { computeTokenBudget } from './tokens.js';

const limits = { context: 100, input: 80, output: 40 };

describe('computeTokenBudget', () => {
  it('computes budget from limits and output cap', () => {
    const budget = computeTokenBudget(limits, 30, 10);
    expect(budget.outputTokens).toBe(30);
    expect(budget.inputMaxTokens).toBe(70);
    expect(budget.availableTokens).toBe(60);
  });
});
