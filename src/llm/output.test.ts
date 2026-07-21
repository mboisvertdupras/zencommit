import { describe, expect, it } from 'vitest';
import {
  CommitMessageOutputError,
  parseCommitMessageOutput,
  validateCommitMessageOutput,
} from './output.js';

describe('validateCommitMessageOutput', () => {
  it('trims and CRLF-normalizes a valid object', () => {
    const result = validateCommitMessageOutput(
      { subject: '  feat: x  ', body: 'a\r\nb' },
      'model response',
    );
    expect(result).toEqual({ subject: 'feat: x', body: 'a\nb' });
  });

  it('accepts an empty body', () => {
    const result = validateCommitMessageOutput({ subject: 'feat: x', body: '' }, 'model response');
    expect(result).toEqual({ subject: 'feat: x', body: '' });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'str'],
  ])('rejects %s', (_label, value) => {
    expect(() => validateCommitMessageOutput(value, 'model response')).toThrow(
      CommitMessageOutputError,
    );
  });

  it.each([
    ['missing subject', { body: 'b' }],
    ['non-string subject', { subject: 1, body: 'b' }],
    ['missing body', { subject: 'feat: x' }],
    ['non-string body', { subject: 'feat: x', body: 1 }],
    ['whitespace-only subject', { subject: '   ', body: 'b' }],
  ])('rejects %s', (_label, value) => {
    expect(() => validateCommitMessageOutput(value, 'model response')).toThrow(
      CommitMessageOutputError,
    );
  });

  it('embeds the phase in the thrown message', () => {
    expect(() => validateCommitMessageOutput(null, 'repair response')).toThrow(/repair response/);
  });
});

describe('parseCommitMessageOutput', () => {
  it('parses and validates valid JSON', () => {
    const result = parseCommitMessageOutput('{"subject":"feat: x","body":"b"}', 'text fallback');
    expect(result).toEqual({ subject: 'feat: x', body: 'b' });
  });

  it('reports invalid JSON', () => {
    expect(() => parseCommitMessageOutput('not json', 'text fallback')).toThrow(
      /expected valid JSON object/,
    );
  });

  it('reports a shape error for JSON that parses but is the wrong shape', () => {
    expect(() => parseCommitMessageOutput('[1,2]', 'text fallback')).toThrow(
      /expected object with non-empty string subject and string body/,
    );
  });

  it('embeds the phase in the thrown message', () => {
    expect(() => parseCommitMessageOutput('not json', 'repair response')).toThrow(
      /repair response/,
    );
  });
});
