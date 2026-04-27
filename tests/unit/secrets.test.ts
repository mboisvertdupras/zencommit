import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAuthStatus } from '../../src/commands/auth.js';
import {
  deleteSecret,
  getSecret,
  MacOsKeychainSecretStore,
  resetSecretStoreForTesting,
  resolveRuntimeSecrets,
  SecretStoreUnavailableError,
  setSecret,
  setSecretStoreForTesting,
  type ExecRunner,
  type SecretStore,
} from '../../src/auth/secrets.js';
import { ExecError, formatCommandForDisplay } from '../../src/util/exec.js';

describe('secrets adapter', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  const usePlatform = (platform: NodeJS.Platform): void => {
    Object.defineProperty(process, 'platform', { value: platform });
  };

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
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

    expect(openaiLine).toMatch(/^OPENAI_API_KEY: stored \(.+1234\)$/);
    expect(openaiLine).not.toContain(token);
  });

  it('reports environment fallback in auth status without printing the token', async () => {
    const token = 'env-fallback-token-1234';
    const unavailableStore: SecretStore = {
      set: (): Promise<void> => Promise.reject(new SecretStoreUnavailableError('unavailable')),
      get: (): Promise<string | null> =>
        Promise.reject(new SecretStoreUnavailableError('unavailable')),
      delete: (): Promise<void> => Promise.reject(new SecretStoreUnavailableError('unavailable')),
    };

    setSecretStoreForTesting(unavailableStore);
    process.env.OPENAI_API_KEY = token;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAuthStatus();

    const lines = logSpy.mock.calls.map((call) => String(call[0]));
    const openaiLine = lines.find((line) => line.startsWith('OPENAI_API_KEY:'));

    expect(openaiLine).toBe('OPENAI_API_KEY: set in environment');
    expect(lines.join('\n')).not.toContain(token);
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

  it('redacts macOS keychain password arguments when storing secrets', async () => {
    usePlatform('darwin');
    const fakeToken = 'sk-secret-token-1234';
    let capturedCommand: string[] | null = null;
    let capturedRedactedArgs: number[] = [];
    const runner: ExecRunner = (command, options = {}) => {
      capturedCommand = command;
      capturedRedactedArgs = options.redactedArgs ?? [];
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
    };

    const store = new MacOsKeychainSecretStore('zencommit-test', runner);
    await store.set('OPENAI_API_KEY', fakeToken);

    expect(capturedCommand).toEqual([
      'security',
      'add-generic-password',
      '-U',
      '-s',
      'zencommit-test',
      '-a',
      'OPENAI_API_KEY',
      '-w',
      fakeToken,
    ]);
    expect(capturedRedactedArgs).toEqual([8]);
  });

  it('treats missing macOS keychain entries as absent secrets', async () => {
    usePlatform('darwin');
    const runner: ExecRunner = () =>
      Promise.resolve({
        stdout: '',
        stderr:
          'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.',
        exitCode: 44,
      });

    const store = new MacOsKeychainSecretStore('zencommit-test', runner);

    await expect(store.get('OPENAI_API_KEY')).resolves.toBeNull();
    await store.delete('OPENAI_API_KEY');
  });

  it('converts keychain failures into bounded secret-safe guidance', async () => {
    usePlatform('darwin');
    const fakeToken = 'sk-secret-token-1234';
    const longStderr = `security denied ${fakeToken} ${'x'.repeat(6000)}`;
    const command = [
      'security',
      'add-generic-password',
      '-U',
      '-s',
      'zencommit-test',
      '-a',
      'OPENAI_API_KEY',
      '-w',
      fakeToken,
    ];
    const runner: ExecRunner = () =>
      Promise.reject(
        new ExecError('Command failed: security add-generic-password', 51, '', longStderr, {
          command,
          commandDisplay: formatCommandForDisplay(command, { redactedArgs: [8] }),
          operation: 'macOS Keychain store OPENAI_API_KEY',
          safeStderr: 'security denied <redacted> ' + 'x'.repeat(6000),
        }),
      );

    const store = new MacOsKeychainSecretStore('zencommit-test', runner);

    await expect(store.set('OPENAI_API_KEY', fakeToken)).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message;
      expect(message).toContain('Failed to store OPENAI_API_KEY in macOS Keychain');
      expect(message).toContain(
        'Use the OPENAI_API_KEY environment variable or run `zencommit auth login`.',
      );
      expect(message).not.toContain(fakeToken);
      expect(message.length).toBeLessThan(4500);
      return true;
    });
  });
});
