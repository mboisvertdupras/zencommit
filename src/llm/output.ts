export interface CommitMessage {
  subject: string;
  body: string;
}

export type CommitMessageOutputPhase =
  | 'mock response'
  | 'structured output'
  | 'text fallback'
  | 'repair response'
  | 'model response';

const EXPECTED_JSON_SHAPE =
  'expected valid JSON object with non-empty string subject and string body';
const EXPECTED_OBJECT_SHAPE = 'expected object with non-empty string subject and string body';

export class CommitMessageOutputError extends Error {
  constructor(phase: CommitMessageOutputPhase, expectedShape: string) {
    super(`Invalid commit message response during ${phase}: ${expectedShape}.`);
    this.name = 'CommitMessageOutputError';
  }
}

export const normalizeCommitMessageField = (value: string): string =>
  value.replace(/\r\n/g, '\n').trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const validateCommitMessageOutput = (
  value: unknown,
  phase: CommitMessageOutputPhase,
): CommitMessage => {
  if (!isRecord(value)) {
    throw new CommitMessageOutputError(phase, EXPECTED_OBJECT_SHAPE);
  }

  const { subject, body } = value;
  if (typeof subject !== 'string' || typeof body !== 'string') {
    throw new CommitMessageOutputError(phase, EXPECTED_OBJECT_SHAPE);
  }

  const normalizedSubject = normalizeCommitMessageField(subject);
  if (!normalizedSubject) {
    throw new CommitMessageOutputError(phase, EXPECTED_OBJECT_SHAPE);
  }

  return {
    subject: normalizedSubject,
    body: normalizeCommitMessageField(body),
  };
};

export const parseCommitMessageOutput = (
  rawJson: string,
  phase: CommitMessageOutputPhase,
): CommitMessage => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new CommitMessageOutputError(phase, EXPECTED_JSON_SHAPE);
  }
  return validateCommitMessageOutput(parsed, phase);
};
