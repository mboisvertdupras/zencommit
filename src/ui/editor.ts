import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const runEditor = (command: string, args: string[]): Promise<number> =>
  new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
    });

    proc.on('error', () => {
      resolve(1);
    });

    proc.on('close', (code) => {
      resolve(code ?? 1);
    });
  });

export const openEditor = async (initialText: string): Promise<string> => {
  const editor = process.env.EDITOR;
  if (!editor) {
    return initialText;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zencommit-'));
  const filePath = path.join(tempDir, 'COMMIT_EDITMSG');
  await fs.writeFile(filePath, `${initialText.trim()}\n`, 'utf8');

  const [command, ...args] = editor.split(' ');
  if (!command) {
    return initialText;
  }

  const exitCode = await runEditor(command, [...args, filePath]);
  if (exitCode !== 0) {
    return initialText;
  }

  const updated = await fs.readFile(filePath, 'utf8');
  return updated.trim();
};
