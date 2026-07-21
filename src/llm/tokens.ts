import { encodingForModel, getEncoding } from 'js-tiktoken';
import type { ModelLimits } from '../metadata/types.js';

export interface TokenBudget {
  inputMaxTokens: number;
  outputTokens: number;
  availableTokens: number;
  overheadTokens: number;
}

const DEFAULT_ENCODING = 'cl100k_base';

export type TokenEncoder = {
  encode: (text: string) => number[];
  free?: () => void;
};

export const getEncodingForModel = (modelId: string): TokenEncoder => {
  const modelName = modelId.includes('/') ? (modelId.split('/')[1] ?? modelId) : modelId;
  try {
    return encodingForModel(modelName as Parameters<typeof encodingForModel>[0]);
  } catch {
    return getEncoding(DEFAULT_ENCODING);
  }
};

export const countTokens = (text: string, encoding: TokenEncoder): number => {
  if (!text) {
    return 0;
  }
  return encoding.encode(text).length;
};

export const freeEncoding = (encoding: TokenEncoder): void => {
  encoding.free?.();
};

export const computeTokenBudget = (
  limits: ModelLimits,
  maxOutputTokens: number,
  overheadTokens: number,
): TokenBudget => {
  const contextLimit = limits.context ?? Number.POSITIVE_INFINITY;
  const inputLimit = limits.input ?? limits.context ?? Number.POSITIVE_INFINITY;
  const outputLimit = limits.output ?? Number.POSITIVE_INFINITY;
  const outputTokens = Math.min(maxOutputTokens, outputLimit);
  const inputMaxTokens = Math.min(inputLimit, contextLimit - outputTokens);
  const availableTokens = Math.max(0, inputMaxTokens - overheadTokens);
  return {
    inputMaxTokens,
    outputTokens,
    availableTokens,
    overheadTokens,
  };
};
