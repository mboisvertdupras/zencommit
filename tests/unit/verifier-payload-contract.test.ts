import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const configPath = resolve(process.cwd(), 'ralph.yml');

function readVerifierBlock() {
  const configText = readFileSync(configPath, 'utf8');
  const verifierIndex = configText.indexOf('\n  verifier:\n');

  if (verifierIndex === -1) {
    throw new Error('Could not find verifier hat block in ralph.yml');
  }

  return configText.slice(verifierIndex);
}

describe('verifier payload contract configuration', () => {
  it('requires explicit emission and documents all required quality dimensions', () => {
    const verifierBlock = readVerifierBlock();

    expect(verifierBlock).not.toMatch(/\n\s+default_publishes:/);
    expect(verifierBlock).toContain('npm run emit:verify-passed --');
    expect(verifierBlock).toContain('explicit-only in this config');

    for (const key of [
      'quality.tests',
      'quality.coverage',
      'quality.lint',
      'quality.audit',
      'quality.mutation',
      'quality.complexity',
    ]) {
      expect(verifierBlock).toContain(key);
    }
  });
});
