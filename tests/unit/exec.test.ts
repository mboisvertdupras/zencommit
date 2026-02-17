import { afterAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from '../../src/util/exec.js';
import type { ExecError } from '../../src/util/exec.js';
import { openEditor } from '../../src/ui/editor.js';

describe('exec', () => {
  it('captures stdout, stderr, and exit code on success', async () => {
    const result = await exec([
      process.execPath,
      '-e',
      "process.stdout.write('out'); process.stderr.write('err');",
    ]);

    expect(result).toEqual({
      stdout: 'out',
      stderr: 'err',
      exitCode: 0,
    });
  });

  it('throws ExecError for non-zero exits when allowFailure is false', async () => {
    await expect(
      exec([
        process.execPath,
        '-e',
        "process.stdout.write('out'); process.stderr.write('err'); process.exit(5);",
      ]),
    ).rejects.toMatchObject<Partial<ExecError>>({
      name: 'ExecError',
      exitCode: 5,
      stdout: 'out',
      stderr: 'err',
    });
  });

  it('returns non-zero exit details when allowFailure is true', async () => {
    const result = await exec(
      [
        process.execPath,
        '-e',
        "process.stdout.write('warn'); process.stderr.write('bad'); process.exit(7);",
      ],
      { allowFailure: true },
    );

    expect(result).toEqual({
      stdout: 'warn',
      stderr: 'bad',
      exitCode: 7,
    });
  });
});

describe.sequential('openEditor', () => {
  const previousEditor = process.env.EDITOR;

  afterAll(() => {
    if (previousEditor === undefined) {
      delete process.env.EDITOR;
      return;
    }
    process.env.EDITOR = previousEditor;
  });

  const writeEditorScript = async (content: string): Promise<string> => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zencommit-editor-test-'));
    const scriptPath = path.join(dir, 'editor.mjs');
    await fs.writeFile(scriptPath, content, 'utf8');
    await fs.chmod(scriptPath, 0o755);
    return scriptPath;
  };

  it('returns edited message when editor exits successfully', async () => {
    const scriptPath = await writeEditorScript(`#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const filePath = process.argv[2];
if (!filePath) {
  process.exit(1);
}
writeFileSync(filePath, 'edited subject\\n\\nedited body\\n', 'utf8');
`);

    process.env.EDITOR = `${process.execPath} ${scriptPath}`;

    const edited = await openEditor('original subject\n\noriginal body');
    expect(edited).toBe('edited subject\n\nedited body');
  });

  it('returns original message when editor exits with an error', async () => {
    const scriptPath = await writeEditorScript(`#!/usr/bin/env node
process.exit(2);
`);

    process.env.EDITOR = `${process.execPath} ${scriptPath}`;

    const original = 'original subject\n\noriginal body';
    const edited = await openEditor(original);
    expect(edited).toBe(original);
  });

  it('returns original message when no editor is configured', async () => {
    delete process.env.EDITOR;

    const original = 'original subject\n\noriginal body';
    const edited = await openEditor(original);
    expect(edited).toBe(original);
  });
});
