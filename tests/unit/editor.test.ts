import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openEditor, tokenizeEditorCommand } from '../../src/ui/editor.js';

const writeEditorScript = async (body: string): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zc-editor-test-'));
  const scriptPath = path.join(dir, 'editor.cjs');
  await fs.writeFile(scriptPath, body, 'utf8');
  return scriptPath;
};

const editorCommand = (scriptPath: string): string => `${process.execPath} ${scriptPath}`;

describe('tokenizeEditorCommand', () => {
  it('splits a command with flags', () => {
    expect(tokenizeEditorCommand('code --wait')).toEqual(['code', '--wait']);
  });

  it('preserves a double-quoted path containing spaces', () => {
    expect(tokenizeEditorCommand('"/path with spaces/edit" -w')).toEqual([
      '/path with spaces/edit',
      '-w',
    ]);
  });

  it('returns a single token for a bare command', () => {
    expect(tokenizeEditorCommand('vim')).toEqual(['vim']);
  });

  it('returns an empty array for an empty string', () => {
    expect(tokenizeEditorCommand('')).toEqual([]);
  });

  it('returns an empty array for whitespace only', () => {
    expect(tokenizeEditorCommand('  ')).toEqual([]);
  });
});

describe.sequential('openEditor', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('warns and keeps the original when no editor is configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', '');

    const original = 'original subject\n\noriginal body';
    const result = await openEditor(original);

    expect(result).toBe(original);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('prefers VISUAL over EDITOR', async () => {
    const visualScript = await writeEditorScript(
      "const fs = require('fs');\n" +
        'const file = process.argv[2];\n' +
        "fs.appendFileSync(file, '\\nedited-by-visual');\n",
    );
    const editorScript = await writeEditorScript(
      "const fs = require('fs');\n" +
        'const file = process.argv[2];\n' +
        "fs.appendFileSync(file, '\\nedited-by-editor');\n",
    );
    vi.stubEnv('VISUAL', editorCommand(visualScript));
    vi.stubEnv('EDITOR', editorCommand(editorScript));

    const result = await openEditor('seed');

    expect(result).toContain('edited-by-visual');
    expect(result).not.toContain('edited-by-editor');
  });

  it('returns the edited content trimmed', async () => {
    const script = await writeEditorScript(
      "const fs = require('fs');\n" +
        'const file = process.argv[2];\n' +
        "fs.writeFileSync(file, 'new subject\\n\\nnew body\\n');\n",
    );
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', editorCommand(script));

    const result = await openEditor('original');

    expect(result).toBe('new subject\n\nnew body');
  });

  it('warns and keeps the original when the editor exits non-zero', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const script = await writeEditorScript('process.exit(3);\n');
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', editorCommand(script));

    const original = 'original subject\n\noriginal body';
    const result = await openEditor(original);

    expect(result).toBe(original);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('exited with code 3'));
  });

  it('removes its temp dir after a successful edit', async () => {
    const script = await writeEditorScript(
      "const fs = require('fs');\n" +
        'const file = process.argv[2];\n' +
        "fs.writeFileSync(file, 'done\\n');\n",
    );
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', editorCommand(script));
    const mkdtempSpy = vi.spyOn(fs, 'mkdtemp');

    await openEditor('original');

    const tempDir = await mkdtempSpy.mock.results[0]!.value;
    await expect(fs.access(tempDir)).rejects.toThrow();
  });

  it('removes its temp dir after a non-zero exit', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const script = await writeEditorScript('process.exit(4);\n');
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', editorCommand(script));
    const mkdtempSpy = vi.spyOn(fs, 'mkdtemp');

    await openEditor('original');

    const tempDir = await mkdtempSpy.mock.results[0]!.value;
    await expect(fs.access(tempDir)).rejects.toThrow();
  });
});
