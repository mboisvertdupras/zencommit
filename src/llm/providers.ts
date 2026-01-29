import { bedrock } from '@ai-sdk/amazon-bedrock';
import { anthropic } from '@ai-sdk/anthropic';
import { azure } from '@ai-sdk/azure';
import { cerebras } from '@ai-sdk/cerebras';
import { cohere } from '@ai-sdk/cohere';
import { deepinfra } from '@ai-sdk/deepinfra';
import { gateway } from '@ai-sdk/gateway';
import { google } from '@ai-sdk/google';
import { vertex } from '@ai-sdk/google-vertex';
import { vertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { groq } from '@ai-sdk/groq';
import { mistral } from '@ai-sdk/mistral';
import { openai } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { perplexity } from '@ai-sdk/perplexity';
import { togetherai } from '@ai-sdk/togetherai';
import { vercel } from '@ai-sdk/vercel';
import { xai } from '@ai-sdk/xai';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { gitlab } from '@gitlab/gitlab-ai-provider';
import type { LanguageModel } from 'ai';

const PROVIDER_FACTORIES: Record<string, (modelName: string) => LanguageModel> = {
  openai: (modelName) => openai(modelName),
  anthropic: (modelName) => anthropic(modelName),
  google: (modelName) => google(modelName),
  'vertex-anthropic': (modelName) => vertexAnthropic(modelName),
  xai: (modelName) => xai(modelName),
  vercel: (modelName) => vercel(modelName),
  azure: (modelName) => azure(modelName),
  bedrock: (modelName) => bedrock(modelName),
  groq: (modelName) => groq(modelName),
  deepinfra: (modelName) => deepinfra(modelName),
  vertex: (modelName) => vertex(modelName),
  mistral: (modelName) => mistral(modelName),
  togetherai: (modelName) => togetherai(modelName),
  cohere: (modelName) => cohere(modelName),
  cerebras: (modelName) => cerebras(modelName),
  perplexity: (modelName) => perplexity(modelName),
  gateway: (modelName) => gateway(modelName),
  openrouter: (modelName) => openrouter(modelName),
  gitlab: (modelName) => gitlab(modelName),
};

const PROVIDER_ALIASES: Record<string, string> = {
  'azure-openai': 'azure',
  'amazon-bedrock': 'bedrock',
  'aws-bedrock': 'bedrock',
  'google-vertex': 'vertex',
  'google-vertex-ai': 'vertex',
  'google-vertex-anthropic': 'vertex-anthropic',
  'vertex-anthropic': 'vertex-anthropic',
  'google-generative-ai': 'google',
  gemini: 'google',
  'openai-compatible': 'openai-compatible',
  openrouter: 'openrouter',
  'open-router': 'openrouter',
  gitlab: 'gitlab',
  'gitlab-ai': 'gitlab',
  'gitlab-duo': 'gitlab',
  'together.ai': 'togetherai',
  'xai-grok': 'xai',
  'vercel-ai-gateway': 'gateway',
  'ai-gateway': 'gateway',
};

const normalizeProviderId = (provider: string): string =>
  PROVIDER_ALIASES[provider.toLowerCase()] ?? provider.toLowerCase();

export interface ProviderResolutionOptions {
  openaiCompatible?: {
    baseUrl?: string;
    name?: string;
  };
}

export const resolveLanguageModel = (
  modelId: string,
  options: ProviderResolutionOptions = {},
): LanguageModel => {
  const [rawProvider, ...rest] = modelId.split('/');
  const modelName = rest.join('/');
  if (!rawProvider || !modelName) {
    throw new Error('Model id must be in the format provider/model');
  }
  const provider = normalizeProviderId(rawProvider);
  if (provider === 'openai-compatible') {
    const baseURL = options.openaiCompatible?.baseUrl ?? process.env.OPENAI_COMPATIBLE_BASE_URL;
    if (!baseURL) {
      throw new Error('OPENAI_COMPATIBLE_BASE_URL is required for openai-compatible models.');
    }
    const name =
      options.openaiCompatible?.name ?? process.env.OPENAI_COMPATIBLE_NAME ?? 'openai-compatible';
    const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
    return createOpenAICompatible({ baseURL, name, apiKey })(modelName);
  }
  const factory = PROVIDER_FACTORIES[provider];
  if (!factory) {
    throw new Error(`Unsupported model provider: ${rawProvider}`);
  }
  return factory(modelName);
};
