import { describe, expect, it } from 'vitest';
import { freeEncoding, getEncodingForModel } from './tokens.js';
import { truncateDiffByFile, truncateDiffSmart } from './truncate.js';
import type { DiffConfig } from '../config/types.js';

const sampleDiff = `diff --git a/foo.ts b/foo.ts
index 123..456 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,4 @@
-export const a = 1;
+export const a = 2;
+export function test() {}
 diff --git a/bar.ts b/bar.ts
index 111..222 100644
--- a/bar.ts
+++ b/bar.ts
@@ -1,3 +1,3 @@
-export const b = 1;
+export const b = 2;
`;

const smartDiff = `diff --git foo.ts foo.ts
--- foo.ts
+++ foo.ts
@@ -1,3 +1,4 @@
-export const a = 1;
+export const a = 2;
+export function test() {}
+const c = 3;
`;

const diffConfig: DiffConfig = {
  truncateStrategy: 'smart',
  includeFileList: true,
  maxFiles: 200,
  smart: {
    maxAddedLinesPerHunk: 1,
    maxRemovedLinesPerHunk: 1,
  },
};

describe('truncateDiffByFile', () => {
  it('truncates and adds marker when budget is tight', () => {
    const encoding = getEncodingForModel('openai/gpt-4o');
    const result = truncateDiffByFile(sampleDiff, 20, encoding);
    freeEncoding(encoding);

    expect(result.mode).toBe('byFile');
    expect(result.truncated).toBe(true);
    expect(result.text).toContain('... truncated');
  });
});

describe('truncateDiffSmart', () => {
  it('includes file summary', () => {
    const encoding = getEncodingForModel('openai/gpt-4o');
    const result = truncateDiffSmart('M foo.ts (+1 -1)', smartDiff, 120, diffConfig, encoding);
    freeEncoding(encoding);

    expect(result.mode).toBe('smart');
    expect(result.text).toContain('File summary:\nM foo.ts (+1 -1)');
    expect(result.text).toContain('+export function test() {}');
    expect(result.text).toContain('... omitted (+1 additions, -0 deletions)');
  });
});
