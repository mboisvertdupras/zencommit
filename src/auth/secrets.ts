export interface ProviderAuthConfig {
  id: string;
  name: string;
  envKeys: string[];
  required: boolean;
  primaryEnvKey?: string;
  providerIds?: string[];
}

const PROVIDER_AUTH_CONFIGS: ProviderAuthConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    envKeys: ['OPENAI_API_KEY'],
    required: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    envKeys: ['ANTHROPIC_API_KEY'],
    required: true,
    primaryEnvKey: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'google',
    name: 'Google Generative AI',
    envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
    required: true,
    primaryEnvKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    providerIds: ['google-generative-ai', 'gemini'],
  },
  {
    id: 'vertex',
    name: 'Google Vertex AI',
    envKeys: ['GOOGLE_VERTEX_API_KEY'],
    required: false,
    providerIds: ['google-vertex', 'google-vertex-ai'],
  },
  {
    id: 'vertex-anthropic',
    name: 'Google Vertex Anthropic',
    envKeys: ['GOOGLE_VERTEX_API_KEY'],
    required: false,
    providerIds: ['google-vertex-anthropic'],
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    envKeys: ['XAI_API_KEY'],
    required: true,
    providerIds: ['xai-grok', 'grok'],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    envKeys: ['VERCEL_API_KEY'],
    required: true,
  },
  {
    id: 'gateway',
    name: 'Vercel AI Gateway',
    envKeys: ['AI_GATEWAY_API_KEY'],
    required: true,
    providerIds: ['ai-gateway', 'vercel-ai-gateway'],
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    envKeys: ['AZURE_API_KEY'],
    required: true,
    providerIds: ['azure-openai'],
  },
  {
    id: 'bedrock',
    name: 'Amazon Bedrock',
    envKeys: [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SESSION_TOKEN',
      'AWS_BEARER_TOKEN_BEDROCK',
    ],
    required: true,
    providerIds: ['amazon-bedrock', 'aws-bedrock'],
  },
  {
    id: 'groq',
    name: 'Groq',
    envKeys: ['GROQ_API_KEY'],
    required: true,
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    envKeys: ['DEEPINFRA_API_KEY'],
    required: true,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    envKeys: ['MISTRAL_API_KEY'],
    required: true,
  },
  {
    id: 'togetherai',
    name: 'Together.ai',
    envKeys: ['TOGETHER_AI_API_KEY'],
    required: true,
    providerIds: ['together.ai'],
  },
  {
    id: 'cohere',
    name: 'Cohere',
    envKeys: ['COHERE_API_KEY'],
    required: true,
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    envKeys: ['CEREBRAS_API_KEY'],
    required: true,
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    envKeys: ['PERPLEXITY_API_KEY'],
    required: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    envKeys: ['OPENROUTER_API_KEY'],
    required: true,
    providerIds: ['open-router'],
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI Compatible',
    envKeys: ['OPENAI_COMPATIBLE_API_KEY'],
    required: true,
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    envKeys: ['GITLAB_TOKEN'],
    required: true,
    providerIds: ['gitlab-ai', 'gitlab-duo'],
  },
];

const ENV_KEY_ALIASES: Record<string, string[]> = {
  GOOGLE_GENERATIVE_AI_API_KEY: ['GEMINI_API_KEY'],
};

const SECRET_SERVICE = 'zencommit';

export const getSecretLabel = (envKey: string): string => `${SECRET_SERVICE}:${envKey}`;

const toSecretOptions = (envKey: string): { service: string; name: string } => ({
  service: SECRET_SERVICE,
  name: envKey,
});

export const setSecret = async (envKey: string, value: string): Promise<void> => {
  await Bun.secrets.set(toSecretOptions(envKey), value);
};

export const getSecret = async (envKey: string): Promise<string | null> => {
  const value = await Bun.secrets.get(toSecretOptions(envKey));
  if (!value) {
    return null;
  }
  return value;
};

export const deleteSecret = async (envKey: string): Promise<void> => {
  await Bun.secrets.delete(toSecretOptions(envKey));
};

const PROVIDER_AUTH_INDEX: Map<string, ProviderAuthConfig> = new Map(
  PROVIDER_AUTH_CONFIGS.flatMap((config) => {
    const aliases = config.providerIds ?? [];
    return [config.id, ...aliases].map((id) => [id.toLowerCase(), config]);
  }),
);

export const getProviderAuthConfigs = (): ProviderAuthConfig[] => [...PROVIDER_AUTH_CONFIGS];

export const resolveProviderAuth = (modelId: string): ProviderAuthConfig | null => {
  const provider = modelId.split('/')[0];
  if (!provider) {
    return null;
  }
  return PROVIDER_AUTH_INDEX.get(provider.toLowerCase()) ?? null;
};

export const getKnownEnvKeys = (): string[] => {
  const keys = new Set<string>();
  for (const config of PROVIDER_AUTH_CONFIGS) {
    for (const envKey of config.envKeys) {
      keys.add(envKey);
    }
  }
  return Array.from(keys).sort();
};

export const resolveRuntimeSecrets = async (envKeys: string[]): Promise<Record<string, string>> => {
  const resolved: Record<string, string> = {};
  for (const envKey of envKeys) {
    const secret = await getSecret(envKey);
    if (secret) {
      resolved[envKey] = secret;
      continue;
    }
    const envValue = process.env[envKey];
    if (envValue) {
      resolved[envKey] = envValue;
      continue;
    }
    const aliases = ENV_KEY_ALIASES[envKey] ?? [];
    for (const alias of aliases) {
      const aliasSecret = await getSecret(alias);
      if (aliasSecret) {
        resolved[envKey] = aliasSecret;
        break;
      }
      const aliasValue = process.env[alias];
      if (aliasValue) {
        resolved[envKey] = aliasValue;
        break;
      }
    }
  }
  return resolved;
};
