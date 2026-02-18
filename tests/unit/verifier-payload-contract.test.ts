import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const configPath = resolve(process.cwd(), 'ralph.yml');

function readHatBlock(hatName: string) {
  const configText = readFileSync(configPath, 'utf8');
  const hatsSection = configText.split('\nhats:\n')[1];

  if (!hatsSection) {
    throw new Error('Could not find hats section in ralph.yml');
  }

  const hatToken = `  ${hatName}:\n`;
  const hatStart = hatsSection.indexOf(hatToken);

  if (hatStart === -1) {
    throw new Error(`Could not find ${hatName} hat block in ralph.yml`);
  }

  const afterHatStart = hatsSection.slice(hatStart + hatToken.length);
  const nextHatMatch = afterHatStart.match(/\n\s{2}[a-zA-Z0-9_-]+:\n/);

  if (!nextHatMatch || nextHatMatch.index === undefined) {
    return hatsSection.slice(hatStart);
  }

  return hatsSection.slice(hatStart, hatStart + hatToken.length + nextHatMatch.index);
}

describe('verifier payload contract configuration', () => {
  it('keeps refactorer emission explicit-only to avoid duplicate verifier runs', () => {
    const refactorerBlock = readHatBlock('refactorer');

    expect(refactorerBlock).not.toMatch(/\n\s+default_publishes:/);
    expect(refactorerBlock).toContain('Refactorer events are explicit-only in this config');
    expect(refactorerBlock).toContain('publish exactly one event via `ralph emit`');
  });

  it('requires helper-based explicit verifier emission and documents all quality dimensions', () => {
    const verifierBlock = readHatBlock('verifier');

    expect(verifierBlock).not.toMatch(/\n\s+default_publishes:/);
    expect(verifierBlock).toContain('Required emission path (enforced helper)');
    expect(verifierBlock).toContain('npm run emit:verify-passed --');
    expect(verifierBlock).toContain('explicit-only in this config');
    expect(verifierBlock).toContain('Do not call `ralph emit verify.passed` directly');

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
