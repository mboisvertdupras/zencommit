import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

  const proc = Bun.spawn([command, ...args, filePath], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    return initialText;
  }

  const updated = await fs.readFile(filePath, 'utf8');
  return updated.trim();
};
