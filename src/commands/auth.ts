import { generateText } from 'ai';
import { ConfigLoadError, resolveConfig } from '../config/load.js';
import { getRepoRoot } from '../git/repo.js';
import {
  deleteSecret,
  getKnownEnvKeys,
  getSecret,
  isSecretStoreUnavailableError,
  resolveProviderAuth,
  setSecret,
} from '../auth/secrets.js';
import { promptForSecret, selectProviderKey } from '../ui/prompts.js';
import { redactValue } from '../util/redact.js';
import { logVerbose } from '../util/logger.js';
import { resolveLanguageModel } from '../llm/providers.js';

interface AuthArgs {
  envKey?: string;
  token?: string;
}

const validateEnvKey = (envKey: string): void => {
  const supported = new Set(getKnownEnvKeys());
  if (!supported.has(envKey)) {
    throw new Error(`Unsupported env key: ${envKey}`);
  }
};

const resolveModel = (modelId: string, openaiCompatible?: { baseUrl?: string; name?: string }) => {
  try {
    return resolveLanguageModel(modelId, { openaiCompatible });
  } catch {
    return null;
  }
};

const verifyCredentials = async (
  modelId: string,
  timeoutMs = 5000,
  openaiCompatible?: { baseUrl?: string; name?: string },
): Promise<boolean> => {
  const model = resolveModel(modelId, openaiCompatible);
  if (!model) {
    logVerbose(1, `auth verify: skipping unsupported model ${modelId}`);
    return true;
  }
  try {
    await Promise.race([
      generateText({
        model,
        messages: [
          { role: 'system', content: 'Reply with OK.' },
          { role: 'user', content: 'OK' },
        ],
        maxOutputTokens: 4,
        temperature: 0,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  }
};

export const runAuthLogin = async (args: AuthArgs): Promise<void> => {
  const envKey = args.envKey ?? (await selectProviderKey());
  if (!envKey) {
    process.exit(0);
  }
  logVerbose(1, `auth login: env key ${envKey}`);
  try {
    validateEnvKey(envKey);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }

  const token = args.token ?? (await promptForSecret(envKey));
  if (!token) {
    process.exit(0);
  }
  logVerbose(2, `auth login: storing secret for ${envKey}`);

  try {
    await setSecret(envKey, token);
  } catch (error) {
    if (isSecretStoreUnavailableError(error)) {
      console.error(error.message);
      console.error(`Set ${envKey} in your environment and retry.`);
      process.exit(2);
    }
    throw error;
  }
  process.env[envKey] = token;

  try {
    const repoRoot = await getRepoRoot();
    const config = await resolveConfig(repoRoot);
    const auth = resolveProviderAuth(config.ai.model);
    if (auth && auth.envKeys.includes(envKey)) {
      logVerbose(2, `auth login: verifying model ${config.ai.model}`);
      const ok = await verifyCredentials(config.ai.model, 5000, config.ai.openaiCompatible);
      if (!ok) {
        console.warn('Stored secret but verification failed. Check your key and network.');
      }
    }
  } catch (error) {
    if (error instanceof ConfigLoadError) {
      console.warn(`Config load failed; skipping verification: ${error.message}`);
    } else {
      console.warn('Verification skipped due to unexpected error.');
    }
  }

  console.log(`Stored ${envKey} in secure store.`);
};

export const runAuthLogout = async (args: AuthArgs): Promise<void> => {
  const envKey = args.envKey ?? (await selectProviderKey());
  if (!envKey) {
    process.exit(0);
  }
  logVerbose(1, `auth logout: env key ${envKey}`);
  try {
    validateEnvKey(envKey);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  try {
    await deleteSecret(envKey);
  } catch (error) {
    if (isSecretStoreUnavailableError(error)) {
      console.error(error.message);
      console.error(`Unset ${envKey} in your environment if it was exported there.`);
      process.exit(2);
    }
    throw error;
  }
  console.log(`Removed ${envKey} from secure store.`);
};

export const runAuthStatus = async (): Promise<void> => {
  const keys = getKnownEnvKeys();
  logVerbose(1, `auth status: checking ${keys.length} keys`);
  for (const envKey of keys) {
    const secret = await getSecret(envKey);
    if (secret) {
      console.log(`${envKey}: stored (${redactValue(secret)})`);
    } else if (process.env[envKey]) {
      console.log(`${envKey}: set in environment`);
    } else {
      console.log(`${envKey}: missing`);
    }
  }
};
