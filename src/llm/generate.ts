import { generateObject, generateText, jsonSchema } from 'ai';
import { resolveProviderAuth, resolveRuntimeSecrets } from '../auth/secrets.js';
import { getVerbosity, logVerbose } from '../util/logger.js';
import {
  normalizeCommitMessageField,
  parseCommitMessageOutput,
  validateCommitMessageOutput,
  type CommitMessage,
} from './output.js';
import { resolveLanguageModel } from './providers.js';
import type { ModelCapabilities } from '../metadata/types.js';

export type { CommitMessage } from './output.js';

export interface GenerateInput {
  modelId: string;
  system: string;
  user: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  maxSubjectChars: number;
  style: 'conventional' | 'freeform';
  modelCapabilities?: ModelCapabilities;
  openaiCompatible?: {
    baseUrl?: string;
    name?: string;
  };
}

export interface GenerateDeps {
  callModel?: (input: GenerateInput) => Promise<CommitMessage>;
}

const COMMIT_SCHEMA = jsonSchema<CommitMessage>({
  type: 'object',
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['subject', 'body'],
  additionalProperties: false,
});

const MODEL_TIMEOUT_MESSAGE = 'Model call timed out';

const buildTimeoutSignal = (timeoutMs: number): AbortSignal | undefined => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return undefined;
  }
  return AbortSignal.timeout(timeoutMs);
};

// Mirrors the AI SDK's isAbortError, which rethrows these without wrapping.
const isAbortError = (error: unknown): boolean =>
  (error instanceof Error || error instanceof DOMException) &&
  (error.name === 'AbortError' || error.name === 'ResponseAborted' || error.name === 'TimeoutError');

const withModelTimeout = async <T>(
  timeoutMs: number,
  run: (abortSignal: AbortSignal | undefined) => Promise<T>,
): Promise<T> => {
  try {
    return await run(buildTimeoutSignal(timeoutMs));
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(MODEL_TIMEOUT_MESSAGE);
    }
    throw error;
  }
};

const isModelTimeoutError = (error: unknown): boolean =>
  error instanceof Error && error.message === MODEL_TIMEOUT_MESSAGE;

const isProviderAuthError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  return /api key|auth(?:entication|orization)?|unauthori[sz]ed|forbidden|credential/i.test(
    error.message,
  );
};

const resolveModel = (modelId: string, input: GenerateInput) =>
  resolveLanguageModel(modelId, { openaiCompatible: input.openaiCompatible });

const supportsTemperature = (capabilities?: ModelCapabilities): boolean =>
  capabilities?.temperature === true ||
  (capabilities?.temperature !== false && capabilities?.reasoning !== true);

const buildModelOptions = (input: GenerateInput) => ({
  maxOutputTokens: input.maxOutputTokens,
  ...(supportsTemperature(input.modelCapabilities) ? { temperature: input.temperature } : {}),
});

const ensureAuth = async (modelId: string): Promise<void> => {
  const auth = resolveProviderAuth(modelId);
  if (!auth) {
    return;
  }
  if (getVerbosity() >= 2) {
    logVerbose(2, `auth: provider ${auth.id}, keys=${auth.envKeys.join(', ')}`);
  }
  const secrets = await resolveRuntimeSecrets(auth.envKeys);
  const foundKeys = Object.keys(secrets);
  for (const [key, value] of Object.entries(secrets)) {
    process.env[key] = value;
  }
  if (auth.required && foundKeys.length === 0) {
    const primary = auth.primaryEnvKey ?? auth.envKeys[0] ?? auth.id;
    throw new Error(
      `Missing API key for ${primary}. Set ${primary} or run \`zencommit auth login\`.`,
    );
  }
};

const callModelOnce = async (input: GenerateInput): Promise<CommitMessage> => {
  await ensureAuth(input.modelId);
  const model = resolveModel(input.modelId, input);
  const modelOptions = buildModelOptions(input);

  try {
    const result = await withModelTimeout(input.timeoutMs, (abortSignal) =>
      generateObject({
        model,
        schema: COMMIT_SCHEMA,
        system: input.system,
        prompt: input.user,
        ...modelOptions,
        abortSignal,
      }),
    );
    return validateCommitMessageOutput(result.object, 'structured output');
  } catch (error) {
    if (isModelTimeoutError(error) || isProviderAuthError(error)) {
      throw error;
    }
    if (getVerbosity() >= 2) {
      logVerbose(2, 'llm: structured output failed, falling back to text');
    }
    const textResult = await withModelTimeout(input.timeoutMs, (abortSignal) =>
      generateText({
        model,
        system: input.system,
        prompt: input.user,
        ...modelOptions,
        abortSignal,
      }),
    );

    const rawText = textResult.text ?? '';
    try {
      return parseCommitMessageOutput(rawText, 'text fallback');
    } catch {
      if (getVerbosity() >= 2) {
        logVerbose(2, 'llm: JSON parse failed, attempting repair');
      }
      const repairPrompt = `${input.user}\nReturn ONLY valid JSON matching the schema.`;
      const repairResult = await withModelTimeout(input.timeoutMs, (abortSignal) =>
        generateText({
          model,
          system: input.system,
          prompt: repairPrompt,
          ...modelOptions,
          abortSignal,
        }),
      );
      return parseCommitMessageOutput(repairResult.text ?? '', 'repair response');
    }
  }
};

export const generateCommitMessage = async (
  input: GenerateInput,
  deps: GenerateDeps = {},
): Promise<CommitMessage> => {
  if (process.env.ZENCOMMIT_MOCK_RESPONSE) {
    if (getVerbosity() >= 2) {
      logVerbose(2, 'llm: using mock response');
    }
    return parseCommitMessageOutput(process.env.ZENCOMMIT_MOCK_RESPONSE, 'mock response');
  }

  const callModel = deps.callModel ?? callModelOnce;
  let result = validateCommitMessageOutput(await callModel(input), 'model response');

  if (result.subject.length > input.maxSubjectChars) {
    result = validateCommitMessageOutput(
      await callModel({
        ...input,
        user: `${input.user}\nKeep subject <= ${input.maxSubjectChars} chars.`,
      }),
      'model response',
    );
  }

  if (result.subject.length > input.maxSubjectChars) {
    const trimmed = result.subject.slice(0, Math.max(0, input.maxSubjectChars - 3));
    result = { ...result, subject: `${trimmed}...` };
  }

  return {
    subject: normalizeCommitMessageField(result.subject),
    body: normalizeCommitMessageField(result.body),
  };
};
