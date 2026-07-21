import type { LanguageModel } from 'ai';

const PROVIDER_FACTORIES: Record<string, (modelName: string) => Promise<LanguageModel>> = {
  openai: async (m) => (await import('@ai-sdk/openai')).openai(m),
  anthropic: async (m) => (await import('@ai-sdk/anthropic')).anthropic(m),
  google: async (m) => (await import('@ai-sdk/google')).google(m),
  'google-vertex-anthropic': async (m) =>
    (await import('@ai-sdk/google-vertex/anthropic')).vertexAnthropic(m),
  xai: async (m) => (await import('@ai-sdk/xai')).xai(m),
  vercel: async (m) => (await import('@ai-sdk/vercel')).vercel(m),
  azure: async (m) => (await import('@ai-sdk/azure')).azure(m),
  'amazon-bedrock': async (m) => (await import('@ai-sdk/amazon-bedrock')).bedrock(m),
  groq: async (m) => (await import('@ai-sdk/groq')).groq(m),
  deepinfra: async (m) => (await import('@ai-sdk/deepinfra')).deepinfra(m),
  'google-vertex': async (m) => (await import('@ai-sdk/google-vertex')).vertex(m),
  mistral: async (m) => (await import('@ai-sdk/mistral')).mistral(m),
  togetherai: async (m) => (await import('@ai-sdk/togetherai')).togetherai(m),
  cohere: async (m) => (await import('@ai-sdk/cohere')).cohere(m),
  cerebras: async (m) => (await import('@ai-sdk/cerebras')).cerebras(m),
  perplexity: async (m) => (await import('@ai-sdk/perplexity')).perplexity(m),
  gateway: async (m) => (await import('@ai-sdk/gateway')).gateway(m),
  openrouter: async (m) => (await import('@openrouter/ai-sdk-provider')).openrouter(m),
  gitlab: async (m) => (await import('gitlab-ai-provider')).gitlab(m),
};

const SUPPORTED_PROVIDERS = (): string =>
  [...Object.keys(PROVIDER_FACTORIES), 'openai-compatible'].sort().join(', ');

export interface ProviderResolutionOptions {
  openaiCompatible?: {
    baseUrl?: string;
    name?: string;
  };
}

export const resolveLanguageModel = async (
  modelId: string,
  options: ProviderResolutionOptions = {},
): Promise<LanguageModel> => {
  const [rawProvider, ...rest] = modelId.split('/');
  const modelName = rest.join('/');
  if (!rawProvider || !modelName) {
    throw new Error('Model id must be in the format provider/model');
  }
  const provider = rawProvider.toLowerCase();
  if (provider === 'openai-compatible') {
    const baseURL = options.openaiCompatible?.baseUrl ?? process.env.OPENAI_COMPATIBLE_BASE_URL;
    if (!baseURL) {
      throw new Error('OPENAI_COMPATIBLE_BASE_URL is required for openai-compatible models.');
    }
    const name =
      options.openaiCompatible?.name ?? process.env.OPENAI_COMPATIBLE_NAME ?? 'openai-compatible';
    const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
    const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
    return createOpenAICompatible({ baseURL, name, apiKey })(modelName);
  }
  const factory = PROVIDER_FACTORIES[provider];
  if (!factory) {
    throw new Error(
      `Unsupported model provider: ${rawProvider}. Supported providers: ${SUPPORTED_PROVIDERS()}`,
    );
  }
  return factory(modelName);
};
