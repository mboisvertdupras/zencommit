import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateObject, generateText } from 'ai';
import {
  generateCommitMessage,
  type CommitMessage,
  type GenerateInput,
} from '../../src/llm/generate.js';
import {
  resetSecretStoreForTesting,
  setSecretStoreForTesting,
  type SecretStore,
} from '../../src/auth/secrets.js';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  jsonSchema: (schema: unknown) => schema,
}));

const mockedGenerateObject = vi.mocked(generateObject);
const mockedGenerateText = vi.mocked(generateText);

const baseInput = (overrides: Partial<GenerateInput> = {}): GenerateInput => ({
  modelId: 'openai/gpt-4o-mini',
  system: 'Write a commit message.',
  user: 'Diff content',
  temperature: 0.2,
  maxOutputTokens: 200,
  timeoutMs: 1_000,
  maxSubjectChars: 50,
  style: 'conventional',
  ...overrides,
});

const noSecretsStore: SecretStore = {
  set: () => Promise.resolve(),
  get: () => Promise.resolve(null),
  delete: () => Promise.resolve(),
};

const expectSecretSafe = (message: string): void => {
  expect(message).not.toContain('sk-fake-secret-1234');
  expect(message).not.toContain('raw-response-payload');
};

describe('generateCommitMessage', () => {
  afterEach(() => {
    delete process.env.ZENCOMMIT_MOCK_RESPONSE;
    delete process.env.OPENAI_API_KEY;
    resetSecretStoreForTesting();
    vi.clearAllMocks();
  });

  it('parses and normalizes a mock response through the shared validation seam', async () => {
    process.env.ZENCOMMIT_MOCK_RESPONSE = JSON.stringify({
      subject: '  feat: trim subject  ',
      body: '  Body text\r\n',
    });

    await expect(generateCommitMessage(baseInput())).resolves.toEqual({
      subject: 'feat: trim subject',
      body: 'Body text',
    });
    expect(mockedGenerateObject).not.toHaveBeenCalled();
  });

  it('rejects malformed mock JSON without echoing the raw response', async () => {
    process.env.ZENCOMMIT_MOCK_RESPONSE = '{"subject":"raw-response-payload"';

    await expect(generateCommitMessage(baseInput())).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message;
      expect(message).toContain('Invalid commit message response during mock response');
      expect(message).toContain('expected valid JSON object');
      expectSecretSafe(message);
      return true;
    });
  });

  it.each([
    ['missing subject', { body: 'Body' }],
    ['non-string subject', { subject: 42, body: 'Body' }],
    ['empty subject', { subject: '   ', body: 'Body' }],
  ])('rejects a mock response with %s', async (_name, mockResponse) => {
    process.env.ZENCOMMIT_MOCK_RESPONSE = JSON.stringify({
      ...mockResponse,
      body: 'Body with sk-fake-secret-1234',
    });

    await expect(generateCommitMessage(baseInput())).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message;
      expect(message).toContain('Invalid commit message response during mock response');
      expect(message).toContain('non-empty string subject');
      expectSecretSafe(message);
      return true;
    });
  });

  it('repairs invalid text fallback JSON through the same validation seam', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    setSecretStoreForTesting(noSecretsStore);
    mockedGenerateObject.mockRejectedValueOnce(new Error('structured output failed'));
    mockedGenerateText
      .mockResolvedValueOnce({ text: 'raw-response-payload' } as Awaited<
        ReturnType<typeof generateText>
      >)
      .mockResolvedValueOnce({
        text: JSON.stringify({ subject: ' fix: repaired ', body: ' repaired body ' }),
      } as Awaited<ReturnType<typeof generateText>>);

    await expect(generateCommitMessage(baseInput())).resolves.toEqual({
      subject: 'fix: repaired',
      body: 'repaired body',
    });
    expect(mockedGenerateText).toHaveBeenCalledTimes(2);
  });

  it('omits temperature when model metadata marks it unsupported', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    setSecretStoreForTesting(noSecretsStore);
    mockedGenerateObject.mockResolvedValueOnce({
      object: { subject: 'fix: avoid unsupported temperature', body: '' },
    } as Awaited<ReturnType<typeof generateObject>>);

    await expect(
      generateCommitMessage(
        baseInput({
          modelId: 'openai/gpt-5.4-mini',
          modelCapabilities: { reasoning: true, temperature: false },
        }),
      ),
    ).resolves.toEqual({
      subject: 'fix: avoid unsupported temperature',
      body: '',
    });

    expect(mockedGenerateObject).toHaveBeenCalledTimes(1);
    const request = mockedGenerateObject.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).toHaveProperty('maxOutputTokens', 200);
    expect(request).not.toHaveProperty('temperature');
  });

  it('omits temperature for reasoning models when cached metadata lacks an explicit flag', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    setSecretStoreForTesting(noSecretsStore);
    mockedGenerateObject.mockResolvedValueOnce({
      object: { subject: 'fix: handle stale metadata', body: '' },
    } as Awaited<ReturnType<typeof generateObject>>);

    await expect(
      generateCommitMessage(
        baseInput({
          modelId: 'openai/gpt-5.4-mini',
          modelCapabilities: { reasoning: true },
        }),
      ),
    ).resolves.toEqual({
      subject: 'fix: handle stale metadata',
      body: '',
    });

    const request = mockedGenerateObject.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).not.toHaveProperty('temperature');
  });

  it('passes system instructions through the AI SDK system option', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    setSecretStoreForTesting(noSecretsStore);
    mockedGenerateObject.mockResolvedValueOnce({
      object: { subject: 'fix: use system option', body: '' },
    } as Awaited<ReturnType<typeof generateObject>>);

    await expect(generateCommitMessage(baseInput())).resolves.toEqual({
      subject: 'fix: use system option',
      body: '',
    });

    const request = mockedGenerateObject.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).toMatchObject({
      system: 'Write a commit message.',
      prompt: 'Diff content',
    });
    expect(request).not.toHaveProperty('messages');
  });

  it('rejects invalid repair JSON without echoing model output', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    setSecretStoreForTesting(noSecretsStore);
    mockedGenerateObject.mockRejectedValueOnce(new Error('structured output failed'));
    mockedGenerateText
      .mockResolvedValueOnce({ text: 'raw-response-payload' } as Awaited<
        ReturnType<typeof generateText>
      >)
      .mockResolvedValueOnce({ text: 'sk-fake-secret-1234' } as Awaited<
        ReturnType<typeof generateText>
      >);

    await expect(generateCommitMessage(baseInput())).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message;
      expect(message).toContain('Invalid commit message response during repair response');
      expect(message).toContain('expected valid JSON object');
      expectSecretSafe(message);
      return true;
    });
  });

  it('retries overlong subjects and trims when the retry is still too long', async () => {
    const callModel = vi
      .fn<(input: GenerateInput) => Promise<CommitMessage>>()
      .mockResolvedValueOnce({ subject: 'x'.repeat(20), body: ' First body ' })
      .mockResolvedValueOnce({ subject: 'y'.repeat(20), body: ' Second body ' });

    await expect(
      generateCommitMessage(baseInput({ maxSubjectChars: 10 }), { callModel }),
    ).resolves.toEqual({
      subject: 'yyyyyyy...',
      body: 'Second body',
    });

    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it('rejects injected model responses that would otherwise become an empty subject', async () => {
    const callModel = vi.fn<(input: GenerateInput) => Promise<CommitMessage>>().mockResolvedValue({
      subject: '   ',
      body: 'sk-fake-secret-1234',
    });

    await expect(generateCommitMessage(baseInput(), { callModel })).rejects.toSatisfy(
      (error: unknown) => {
        const message = (error as Error).message;
        expect(message).toContain('Invalid commit message response during model response');
        expect(message).toContain('non-empty string subject');
        expectSecretSafe(message);
        return true;
      },
    );
  });

  it('reports unsupported provider ids without leaking credentials', async () => {
    process.env.OPENAI_API_KEY = 'sk-fake-secret-1234';
    setSecretStoreForTesting(noSecretsStore);

    await expect(
      generateCommitMessage(baseInput({ modelId: 'unsupported-provider/model' })),
    ).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message;
      expect(message).toBe('Unsupported model provider: unsupported-provider');
      expectSecretSafe(message);
      return true;
    });
  });

  it('reports missing API keys with env/auth guidance and no secret value', async () => {
    setSecretStoreForTesting(noSecretsStore);

    await expect(generateCommitMessage(baseInput())).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message;
      expect(message).toContain('Missing API key for OPENAI_API_KEY');
      expect(message).toContain('Set OPENAI_API_KEY or run `zencommit auth login`.');
      expectSecretSafe(message);
      return true;
    });
  });

  it('preserves the model timeout signal instead of falling back with noisy output', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    setSecretStoreForTesting(noSecretsStore);
    mockedGenerateObject.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ object: {} } as never), 50)),
    );

    await expect(generateCommitMessage(baseInput({ timeoutMs: 1 }))).rejects.toThrow(
      'Model call timed out',
    );
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });
});
