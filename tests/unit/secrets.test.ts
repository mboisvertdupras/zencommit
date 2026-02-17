import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAuthStatus } from '../../src/commands/auth.js';
import {
  deleteSecret,
  getSecret,
  resetSecretStoreForTesting,
  resolveRuntimeSecrets,
  SecretStoreUnavailableError,
  setSecret,
  setSecretStoreForTesting,
  type SecretStore,
} from '../../src/auth/secrets.js';

describe('secrets adapter', () => {
  afterEach(() => {
    resetSecretStoreForTesting();
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    vi.restoreAllMocks();
  });

  it('supports set/get/delete through the configured secret store', async () => {
    const values = new Map<string, string>();
    const set = vi.fn((envKey: string, value: string): Promise<void> => {
      values.set(envKey, value);
      return Promise.resolve();
    });
    const get = vi.fn(
      (envKey: string): Promise<string | null> => Promise.resolve(values.get(envKey) ?? null),
    );
    const remove = vi.fn((envKey: string): Promise<void> => {
      values.delete(envKey);
      return Promise.resolve();
    });

    const mockStore: SecretStore = {
      set,
      get,
      delete: remove,
    };

    setSecretStoreForTesting(mockStore);

    await setSecret('OPENAI_API_KEY', 'sk-test-token');
    await expect(getSecret('OPENAI_API_KEY')).resolves.toBe('sk-test-token');

    await deleteSecret('OPENAI_API_KEY');
    await expect(getSecret('OPENAI_API_KEY')).resolves.toBeNull();

    expect(set).toHaveBeenCalledWith('OPENAI_API_KEY', 'sk-test-token');
    expect(remove).toHaveBeenCalledWith('OPENAI_API_KEY');
  });

  it('resolves runtime secrets with env fallback and alias fallback', async () => {
    const mockStore: SecretStore = {
      set: (): Promise<void> => Promise.resolve(),
      get: (envKey: string): Promise<string | null> => {
        if (envKey === 'GEMINI_API_KEY') {
          return Promise.resolve('alias-secret-value');
        }
        return Promise.resolve(null);
      },
      delete: (): Promise<void> => Promise.resolve(),
    };

    setSecretStoreForTesting(mockStore);
    process.env.OPENAI_API_KEY = 'env-openai-key';

    const resolved = await resolveRuntimeSecrets([
      'OPENAI_API_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY',
    ]);

    expect(resolved).toEqual({
      OPENAI_API_KEY: 'env-openai-key',
      GOOGLE_GENERATIVE_AI_API_KEY: 'alias-secret-value',
    });
  });

  it('uses redacted output in auth status', async () => {
    const token = 'sk-secret-token-1234';

    const mockStore: SecretStore = {
      set: (): Promise<void> => Promise.resolve(),
      get: (envKey: string): Promise<string | null> =>
        Promise.resolve(envKey === 'OPENAI_API_KEY' ? token : null),
      delete: (): Promise<void> => Promise.resolve(),
    };

    setSecretStoreForTesting(mockStore);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAuthStatus();

    const openaiLine = logSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.startsWith('OPENAI_API_KEY:'));

    expect(openaiLine).toBeDefined();
    expect(openaiLine).toContain('stored (');
    expect(openaiLine).toContain('1234');
    expect(openaiLine).not.toContain(token);
  });

  it('falls back to environment lookup when secure store is unavailable', async () => {
    const unavailableStore: SecretStore = {
      set: (): Promise<void> => Promise.reject(new SecretStoreUnavailableError('unavailable')),
      get: (): Promise<string | null> =>
        Promise.reject(new SecretStoreUnavailableError('unavailable')),
      delete: (): Promise<void> => Promise.reject(new SecretStoreUnavailableError('unavailable')),
    };

    setSecretStoreForTesting(unavailableStore);
    process.env.OPENAI_API_KEY = 'env-fallback-token';

    await expect(getSecret('OPENAI_API_KEY')).resolves.toBeNull();
    await expect(resolveRuntimeSecrets(['OPENAI_API_KEY'])).resolves.toEqual({
      OPENAI_API_KEY: 'env-fallback-token',
    });
    await expect(setSecret('OPENAI_API_KEY', 'ignored')).rejects.toThrow(
      SecretStoreUnavailableError,
    );
  });
});
