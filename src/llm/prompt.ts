import { normalizePrompt, renderTemplate } from './prompt-template.js';
import baseTemplatePath from './prompts/base.md' with { type: 'file' };
import conventionalTemplatePath from './prompts/conventional.md' with { type: 'file' };
import gitmojiTemplatePath from './prompts/gitmoji.md' with { type: 'file' };
import systemTemplatePath from './prompts/system.md' with { type: 'file' };

export interface PromptInput {
  style: 'conventional' | 'freeform';
  language: string;
  includeBody: boolean;
  emoji: boolean;
  maxSubjectChars: number;
  fileList: string;
  diffText: string;
}

export interface PromptOutput {
  system: string;
  user: string;
}

const templateCache = new Map<string, string>();
const templateFiles: Record<string, string> = {
  base: baseTemplatePath,
  conventional: conventionalTemplatePath,
  gitmoji: gitmojiTemplatePath,
  system: systemTemplatePath,
};

const loadTemplate = async (name: string): Promise<string> => {
  const cached = templateCache.get(name);
  if (cached) {
    return cached;
  }
  const templatePath = templateFiles[name];
  if (!templatePath) {
    throw new Error(`Unknown prompt template: ${name}`);
  }
  const text = await Bun.file(templatePath).text();
  templateCache.set(name, text);
  return text;
};

const renderMarkdown = (value: string): void => {
  const renderer = (Bun as unknown as { markdown?: { render?: (input: string) => string } })
    .markdown?.render;
  if (typeof renderer !== 'function') {
    return;
  }
  try {
    renderer(value);
  } catch {
    // Ignore markdown parser errors and keep raw markdown.
  }
};

const buildUserPrompt = async (input: PromptInput, includeDiff: boolean): Promise<string> => {
  const baseTemplate = await loadTemplate('base');
  const conventionalTemplate = await loadTemplate('conventional');
  const gitmojiTemplate = await loadTemplate('gitmoji');

  const fileListBlock = input.fileList.trim().length > 0 ? input.fileList.trim() : '(omitted)';
  const diffBlock = includeDiff
    ? input.diffText.trim().length > 0
      ? input.diffText.trim()
      : '(empty)'
    : '(omitted for budgeting)';

  const includeBodyGuideline = input.includeBody
    ? 'Include a short body (1-3 bullets or 1 short paragraph) expanding on intent or impact.'
    : 'Do not include a body; set "body" to an empty string.';

  const markdown = renderTemplate(baseTemplate, {
    language: input.language,
    maxSubjectChars: input.maxSubjectChars,
    includeBodyGuideline,
    fileListBlock,
    diffBlock,
    conventionalGuidelines: input.style === 'conventional' ? conventionalTemplate.trim() : '',
    gitmojiGuidelines: input.emoji ? gitmojiTemplate.trim() : '',
  });

  const normalized = normalizePrompt(markdown);
  renderMarkdown(normalized);
  return normalized;
};

export const buildPrompt = async (input: PromptInput): Promise<PromptOutput> => ({
  system: normalizePrompt(await loadTemplate('system')),
  user: await buildUserPrompt(input, true),
});

export const buildPromptWithoutDiff = async (input: PromptInput): Promise<PromptOutput> => ({
  system: normalizePrompt(await loadTemplate('system')),
  user: await buildUserPrompt(input, false),
});
