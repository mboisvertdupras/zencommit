import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveLanguageModel } from './providers.js';

describe('resolveLanguageModel', () => {
  const envKeys = [
    'AWS_REGION',
    'GOOGLE_VERTEX_PROJECT',
    'GOOGLE_VERTEX_LOCATION',
    'AZURE_RESOURCE_NAME',
    'OPENAI_COMPATIBLE_BASE_URL',
    'OPENAI_COMPATIBLE_NAME',
  ];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
    }
    process.env.AWS_REGION = 'us-east-1';
    process.env.GOOGLE_VERTEX_PROJECT = 'test';
    process.env.GOOGLE_VERTEX_LOCATION = 'us-central1';
    process.env.AZURE_RESOURCE_NAME = 'test';
    delete process.env.OPENAI_COMPATIBLE_BASE_URL;
    delete process.env.OPENAI_COMPATIBLE_NAME;
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it.each([
    'amazon-bedrock/anthropic.claude-3-5-sonnet',
    'google-vertex/gemini-2.0-flash',
    'google-vertex-anthropic/claude-sonnet-4-20250514',
    'openai/gpt-4o',
  ])('resolves canonical id %s', async (modelId) => {
    await expect(resolveLanguageModel(modelId)).resolves.toBeTruthy();
  });

  it.each(['bedrock', 'vertex', 'vertex-anthropic'])(
    'rejects renamed old canonical id %s',
    async (provider) => {
      await expect(resolveLanguageModel(`${provider}/m`)).rejects.toThrow(
        new RegExp(`Unsupported model provider: ${provider}.*Supported providers:`),
      );
    },
  );

  it.each([
    'aws-bedrock',
    'google-vertex-ai',
    'gemini',
    'google-generative-ai',
    'azure-openai',
    'together.ai',
    'xai-grok',
    'grok',
    'open-router',
    'vercel-ai-gateway',
    'ai-gateway',
    'gitlab-ai',
    'gitlab-duo',
  ])('rejects deleted alias spelling %s', async (provider) => {
    await expect(resolveLanguageModel(`${provider}/m`)).rejects.toThrow(
      new RegExp(`Unsupported model provider: ${provider}.*Supported providers:`),
    );
  });

  it.each(['OpenAI/gpt-4o', 'Amazon-Bedrock/m'])('folds case for %s', async (modelId) => {
    await expect(resolveLanguageModel(modelId)).resolves.toBeTruthy();
  });

  it('rejects a model id without a slash', async () => {
    await expect(resolveLanguageModel('gpt-4o')).rejects.toThrow(
      'Model id must be in the format provider/model',
    );
  });

  it('reports the raw provider id for an unsupported provider', async () => {
    await expect(resolveLanguageModel('nope/whatever')).rejects.toThrow(
      /Unsupported model provider: nope\. Supported providers:/,
    );
  });

  it.each(['anthropic/claude-sonnet-4-5', 'groq/llama-3.3-70b'])(
    'constructs a model for %s',
    async (modelId) => {
      await expect(resolveLanguageModel(modelId)).resolves.toBeTruthy();
    },
  );

  it('resolves a repeated dynamic import on the second call', async () => {
    await expect(resolveLanguageModel('openai/gpt-4o')).resolves.toBeTruthy();
    await expect(resolveLanguageModel('openai/gpt-4o')).resolves.toBeTruthy();
  });

  describe('openai-compatible', () => {
    it('throws when no base url is provided', async () => {
      await expect(resolveLanguageModel('openai-compatible/m')).rejects.toThrow(
        'OPENAI_COMPATIBLE_BASE_URL is required for openai-compatible models.',
      );
    });

    it('resolves with a base url from options', async () => {
      await expect(
        resolveLanguageModel('openai-compatible/m', {
          openaiCompatible: { baseUrl: 'https://example.test/v1', name: 'custom' },
        }),
      ).resolves.toBeTruthy();
    });

    it('resolves with a base url from the environment', async () => {
      process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://example.test/v1';
      await expect(resolveLanguageModel('openai-compatible/m')).resolves.toBeTruthy();
    });
  });
});
