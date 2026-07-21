import { describe, expect, it } from 'vitest';
import { defaultConfig } from './types.js';
import { validateConfig } from './validate.js';

describe('validateConfig', () => {
  it('accepts the default config', () => {
    const result = validateConfig(structuredClone(defaultConfig));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects temperature below 0', () => {
    const config = structuredClone(defaultConfig);
    config.ai.temperature = -0.1;
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.path)).toContain('ai.temperature');
  });

  it('rejects temperature above 2', () => {
    const config = structuredClone(defaultConfig);
    config.ai.temperature = 2.1;
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.path)).toContain('ai.temperature');
  });

  it('accepts temperature at the inclusive bounds', () => {
    const upper = structuredClone(defaultConfig);
    upper.ai.temperature = 2;
    expect(validateConfig(upper).valid).toBe(true);

    const lower = structuredClone(defaultConfig);
    lower.ai.temperature = 0;
    expect(validateConfig(lower).valid).toBe(true);
  });

  it('rejects negative cacheTtlHours', () => {
    const config = structuredClone(defaultConfig);
    config.metadata.providers.modelsdev.cacheTtlHours = -1;
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.path)).toContain(
      'metadata.providers.modelsdev.cacheTtlHours',
    );
  });

  it('accepts cacheTtlHours of 0', () => {
    const config = structuredClone(defaultConfig);
    config.metadata.providers.modelsdev.cacheTtlHours = 0;
    expect(validateConfig(config).valid).toBe(true);
  });

  it('rejects non-finite cacheTtlHours', () => {
    const config = structuredClone(defaultConfig);
    config.metadata.providers.modelsdev.cacheTtlHours = Number.POSITIVE_INFINITY;
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.path)).toContain(
      'metadata.providers.modelsdev.cacheTtlHours',
    );
  });
});
