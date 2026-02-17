import { ExecError, exec } from '../util/exec.js';

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

export interface SecretStore {
  set(envKey: string, value: string): Promise<void>;
  get(envKey: string): Promise<string | null>;
  delete(envKey: string): Promise<void>;
}

export class SecretStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretStoreUnavailableError';
  }
}

const buildUnavailableMessage = (): string => {
  if (process.platform === 'darwin') {
    return 'Secure store unavailable: macOS Keychain access failed. Use environment variables for credentials.';
  }
  return `Secure store unavailable on platform ${process.platform}. Use environment variables for credentials.`;
};

const isMissingSecretMessage = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('could not be found') ||
    normalized.includes('item not found') ||
    normalized.includes('secitemnotfound')
  );
};

const toUnavailableError = (error: unknown): SecretStoreUnavailableError | null => {
  if (error instanceof SecretStoreUnavailableError) {
    return error;
  }
  if (process.platform !== 'darwin') {
    return new SecretStoreUnavailableError(buildUnavailableMessage());
  }
  if (error instanceof ExecError) {
    const details = `${error.stderr}\n${error.message}`.toLowerCase();
    if (details.includes('enoent') || details.includes('not found')) {
      return new SecretStoreUnavailableError(buildUnavailableMessage());
    }
  }
  return null;
};

class MacOsKeychainSecretStore implements SecretStore {
  constructor(private readonly service: string) {}

  private assertSupportedPlatform(): void {
    if (process.platform !== 'darwin') {
      throw new SecretStoreUnavailableError(buildUnavailableMessage());
    }
  }

  async set(envKey: string, value: string): Promise<void> {
    this.assertSupportedPlatform();
    await exec([
      'security',
      'add-generic-password',
      '-U',
      '-s',
      this.service,
      '-a',
      envKey,
      '-w',
      value,
    ]);
  }

  async get(envKey: string): Promise<string | null> {
    this.assertSupportedPlatform();

    const result = await exec(
      ['security', 'find-generic-password', '-s', this.service, '-a', envKey, '-w'],
      { allowFailure: true },
    );

    if (result.exitCode !== 0) {
      if (isMissingSecretMessage(result.stderr)) {
        return null;
      }
      throw new Error(
        `Failed to read ${envKey} from secure store: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
      );
    }

    const value = result.stdout.replace(/[\r\n]+$/g, '');
    return value.length > 0 ? value : null;
  }

  async delete(envKey: string): Promise<void> {
    this.assertSupportedPlatform();

    const result = await exec(
      ['security', 'delete-generic-password', '-s', this.service, '-a', envKey],
      { allowFailure: true },
    );

    if (result.exitCode !== 0 && !isMissingSecretMessage(result.stderr)) {
      throw new Error(
        `Failed to remove ${envKey} from secure store: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
      );
    }
  }
}

const createDefaultSecretStore = (): SecretStore => new MacOsKeychainSecretStore(SECRET_SERVICE);

let secretStore: SecretStore = createDefaultSecretStore();

export const setSecretStoreForTesting = (store: SecretStore): void => {
  secretStore = store;
};

export const resetSecretStoreForTesting = (): void => {
  secretStore = createDefaultSecretStore();
};

export const isSecretStoreUnavailableError = (
  error: unknown,
): error is SecretStoreUnavailableError => error instanceof SecretStoreUnavailableError;

export const getSecretLabel = (envKey: string): string => `${SECRET_SERVICE}:${envKey}`;

export const setSecret = async (envKey: string, value: string): Promise<void> => {
  try {
    await secretStore.set(envKey, value);
  } catch (error) {
    const unavailable = toUnavailableError(error);
    if (unavailable) {
      throw unavailable;
    }
    throw error;
  }
};

export const getSecret = async (envKey: string): Promise<string | null> => {
  try {
    return await secretStore.get(envKey);
  } catch (error) {
    const unavailable = toUnavailableError(error);
    if (unavailable) {
      return null;
    }
    throw error;
  }
};

export const deleteSecret = async (envKey: string): Promise<void> => {
  try {
    await secretStore.delete(envKey);
  } catch (error) {
    const unavailable = toUnavailableError(error);
    if (unavailable) {
      throw unavailable;
    }
    throw error;
  }
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
