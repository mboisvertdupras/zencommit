import type { DiffMode, MetadataProviderName, ResolvedConfig, TruncateStrategy } from './types.js';

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const addError = (errors: ValidationError[], path: string, message: string): void => {
  errors.push({ path, message });
};

const isString = (value: unknown): value is string => typeof value === 'string';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && !Number.isNaN(value);

const isDiffMode = (value: unknown): value is DiffMode =>
  value === 'staged' || value === 'unstaged' || value === 'all';

const isTruncateStrategy = (value: unknown): value is TruncateStrategy =>
  value === 'byFile' || value === 'smart';

const isProviderName = (value: unknown): value is MetadataProviderName =>
  value === 'auto' || value === 'modelsdev' || value === 'local';

export const validateConfig = (config: ResolvedConfig): ValidationResult => {
  const errors: ValidationError[] = [];

  if (!isString(config.ai.model) || config.ai.model.trim().length === 0) {
    addError(errors, 'ai.model', 'Model must be a non-empty string.');
  }
  if (!isNumber(config.ai.temperature)) {
    addError(errors, 'ai.temperature', 'Temperature must be a number.');
  }
  if (!isNumber(config.ai.maxOutputTokens) || config.ai.maxOutputTokens <= 0) {
    addError(errors, 'ai.maxOutputTokens', 'Max output tokens must be a positive number.');
  }
  if (!isNumber(config.ai.timeoutMs) || config.ai.timeoutMs <= 0) {
    addError(errors, 'ai.timeoutMs', 'Timeout must be a positive number.');
  }
  if (config.ai.openaiCompatible) {
    if (
      config.ai.openaiCompatible.baseUrl !== undefined &&
      (!isString(config.ai.openaiCompatible.baseUrl) ||
        config.ai.openaiCompatible.baseUrl.trim().length === 0)
    ) {
      addError(
        errors,
        'ai.openaiCompatible.baseUrl',
        'openaiCompatible.baseUrl must be a non-empty string.',
      );
    }
    if (
      config.ai.openaiCompatible.name !== undefined &&
      !isString(config.ai.openaiCompatible.name)
    ) {
      addError(errors, 'ai.openaiCompatible.name', 'openaiCompatible.name must be a string.');
    }
  }

  if (config.commit.style !== 'conventional' && config.commit.style !== 'freeform') {
    addError(errors, 'commit.style', 'Style must be conventional or freeform.');
  }
  if (!isString(config.commit.language)) {
    addError(errors, 'commit.language', 'Language must be a string.');
  }
  if (!isBoolean(config.commit.includeBody)) {
    addError(errors, 'commit.includeBody', 'includeBody must be a boolean.');
  }
  if (!isBoolean(config.commit.emoji)) {
    addError(errors, 'commit.emoji', 'emoji must be a boolean.');
  }

  if (!isDiffMode(config.git.diffMode)) {
    addError(errors, 'git.diffMode', 'diffMode must be staged, unstaged, or all.');
  }
  if (!isBoolean(config.git.autoStage)) {
    addError(errors, 'git.autoStage', 'autoStage must be a boolean.');
  }
  if (!isBoolean(config.git.confirmBeforeCommit)) {
    addError(errors, 'git.confirmBeforeCommit', 'confirmBeforeCommit must be a boolean.');
  }

  if (!isTruncateStrategy(config.diff.truncateStrategy)) {
    addError(errors, 'diff.truncateStrategy', 'truncateStrategy must be byFile or smart.');
  }
  if (!isBoolean(config.diff.includeFileList)) {
    addError(errors, 'diff.includeFileList', 'includeFileList must be a boolean.');
  }
  if (!isNumber(config.diff.maxFiles) || config.diff.maxFiles <= 0) {
    addError(errors, 'diff.maxFiles', 'maxFiles must be a positive number.');
  }
  if (
    !isNumber(config.diff.smart.maxAddedLinesPerHunk) ||
    config.diff.smart.maxAddedLinesPerHunk <= 0
  ) {
    addError(errors, 'diff.smart.maxAddedLinesPerHunk', 'maxAddedLinesPerHunk must be positive.');
  }
  if (
    !isNumber(config.diff.smart.maxRemovedLinesPerHunk) ||
    config.diff.smart.maxRemovedLinesPerHunk <= 0
  ) {
    addError(
      errors,
      'diff.smart.maxRemovedLinesPerHunk',
      'maxRemovedLinesPerHunk must be positive.',
    );
  }

  if (!isProviderName(config.metadata.provider)) {
    addError(errors, 'metadata.provider', 'provider must be auto, modelsdev, or local.');
  }
  if (!Array.isArray(config.metadata.fallbackOrder)) {
    addError(errors, 'metadata.fallbackOrder', 'fallbackOrder must be an array.');
  }
  if (!isString(config.metadata.providers.modelsdev.url)) {
    addError(errors, 'metadata.providers.modelsdev.url', 'modelsdev url must be a string.');
  }
  if (!isNumber(config.metadata.providers.modelsdev.cacheTtlHours)) {
    addError(
      errors,
      'metadata.providers.modelsdev.cacheTtlHours',
      'cacheTtlHours must be a number.',
    );
  }
  if (!isString(config.metadata.providers.local.path)) {
    addError(errors, 'metadata.providers.local.path', 'local path must be a string.');
  }

  return { valid: errors.length === 0, errors };
};
