import { describe, expect, it } from 'vitest';
import { buildPrompt, buildPromptWithoutDiff } from './prompt.js';
import type { PromptInput } from './prompt.js';

const CONVENTIONAL_MARKER = 'Follow the Conventional Commits specification (v1.0.0) precisely.';
const GITMOJI_MARKER = 'Prefix the commit subject with exactly one gitmoji';

const baseInput = (overrides: Partial<PromptInput> = {}): PromptInput => ({
  style: 'conventional',
  language: 'en',
  includeBody: true,
  emoji: false,
  maxSubjectChars: 72,
  fileList: 'a.ts\nb.ts',
  diffText: 'diff --git a.ts a.ts',
  ...overrides,
});

describe('buildPrompt', () => {
  it('returns non-empty system and user prompts', async () => {
    const { system, user } = await buildPrompt(baseInput());
    expect(system.length).toBeGreaterThan(0);
    expect(user.length).toBeGreaterThan(0);
  });

  it('includes the fileList and diffText verbatim', async () => {
    const { user } = await buildPrompt(baseInput());
    expect(user).toContain('a.ts\nb.ts');
    expect(user).toContain('diff --git a.ts a.ts');
  });

  it('injects conventional guidelines only for the conventional style', async () => {
    const conventional = await buildPrompt(baseInput({ style: 'conventional' }));
    expect(conventional.user).toContain(CONVENTIONAL_MARKER);

    const freeform = await buildPrompt(baseInput({ style: 'freeform' }));
    expect(freeform.user).not.toContain(CONVENTIONAL_MARKER);
  });

  it('injects gitmoji guidelines only when emoji is enabled', async () => {
    const withEmoji = await buildPrompt(baseInput({ emoji: true }));
    expect(withEmoji.user).toContain(GITMOJI_MARKER);

    const withoutEmoji = await buildPrompt(baseInput({ emoji: false }));
    expect(withoutEmoji.user).not.toContain(GITMOJI_MARKER);
  });

  it('toggles the body guideline based on includeBody', async () => {
    const withBody = await buildPrompt(baseInput({ includeBody: true }));
    expect(withBody.user).toContain('Include a short body');

    const withoutBody = await buildPrompt(baseInput({ includeBody: false }));
    expect(withoutBody.user).toContain('Do not include a body');
  });

  it('substitutes placeholders for empty fileList and diffText', async () => {
    const emptyFiles = await buildPrompt(baseInput({ fileList: '' }));
    expect(emptyFiles.user).toContain('(omitted)');

    const emptyDiff = await buildPrompt(baseInput({ diffText: '' }));
    expect(emptyDiff.user).toContain('(empty)');
  });

  it('interpolates language and maxSubjectChars', async () => {
    const { user } = await buildPrompt(baseInput({ language: 'fr', maxSubjectChars: 50 }));
    expect(user).toContain('Language is fr');
    expect(user).toContain('Stay within 50 characters');
  });
});

describe('buildPromptWithoutDiff', () => {
  it('omits the diff for budgeting', async () => {
    const { user } = await buildPromptWithoutDiff(baseInput());
    expect(user).toContain('(omitted for budgeting)');
    expect(user).not.toContain('diff --git a.ts a.ts');
  });
});
