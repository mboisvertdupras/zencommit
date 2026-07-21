import { afterAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec, formatCommandForDisplay } from '../../src/util/exec.js';
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
    const expectedError: Partial<ExecError> = {
      name: 'ExecError',
      exitCode: 5,
      stdout: 'out',
      stderr: 'err',
    };

    await expect(
      exec([
        process.execPath,
        '-e',
        "process.stdout.write('out'); process.stderr.write('err'); process.exit(5);",
      ]),
    ).rejects.toMatchObject(expectedError);
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

  it('rejects empty command input with safe command context', async () => {
    await expect(exec([], { operation: 'empty command test' })).rejects.toMatchObject({
      name: 'ExecError',
      operation: 'empty command test',
      commandDisplay: '(empty)',
      exitCode: 1,
    });
  });

  it('includes operation and spawn failure context without unsafe command output', async () => {
    await expect(
      exec(['zencommit-command-that-does-not-exist'], { operation: 'spawn missing binary' }),
    ).rejects.toMatchObject({
      name: 'ExecError',
      operation: 'spawn missing binary',
      commandDisplay: 'zencommit-command-that-does-not-exist',
      exitCode: 1,
    });
  });

  it('redacts marked command arguments and secret-like stderr in thrown diagnostics', async () => {
    const fakeToken = 'sk-secret-token-1234';

    await expect(
      exec(
        [
          process.execPath,
          '-e',
          'process.stderr.write(process.argv.at(-1)); process.exit(9);',
          fakeToken,
        ],
        { operation: 'store test secret', redactedArgs: [3] },
      ),
    ).rejects.toSatisfy((error: unknown) => {
      const execError = error as ExecError;
      expect(execError.name).toBe('ExecError');
      expect(execError.exitCode).toBe(9);
      expect(execError.operation).toBe('store test secret');
      expect(execError.commandDisplay).not.toContain(fakeToken);
      expect(execError.message).not.toContain(fakeToken);
      expect(execError.safeStderr).not.toContain(fakeToken);
      expect(execError.stderr).toContain(fakeToken);
      return true;
    });
  });

  it('pipes stdin content to the child process', async () => {
    const result = await exec([process.execPath, '-e', 'process.stdin.pipe(process.stdout);'], {
      stdin: 'hello',
    });

    expect(result.stdout).toBe('hello');
    expect(result.exitCode).toBe(0);
  });

  it('does not throw when the child exits without reading stdin', async () => {
    await expect(
      exec([process.execPath, '-e', 'process.exit(0);'], { stdin: 'ignored' }),
    ).resolves.toMatchObject({ exitCode: 0 });
  });

  it('redacts macOS security password arguments in command displays', () => {
    const fakeToken = 'sk-secret-token-1234';
    const display = formatCommandForDisplay(
      [
        'security',
        'add-generic-password',
        '-U',
        '-s',
        'zencommit',
        '-a',
        'OPENAI_API_KEY',
        '-w',
        fakeToken,
      ],
      { redactedArgs: [8] },
    );

    expect(display).toContain('<redacted>');
    expect(display).not.toContain(fakeToken);
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
