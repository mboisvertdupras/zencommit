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

export const tokenizeEditorCommand = (editor: string): string[] => {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of editor.matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens.filter((token) => token.length > 0);
};

export const openEditor = async (initialText: string): Promise<string> => {
  const editor = process.env.VISUAL || process.env.EDITOR;
  const [command, ...args] = editor ? tokenizeEditorCommand(editor) : [];
  if (!command) {
    console.warn(
      'No editor configured. Set VISUAL or EDITOR to edit the message; keeping the generated one.',
    );
    return initialText;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zencommit-'));
  try {
    const filePath = path.join(tempDir, 'COMMIT_EDITMSG');
    await fs.writeFile(filePath, `${initialText.trim()}\n`, 'utf8');

    const exitCode = await runEditor(command, [...args, filePath]);
    if (exitCode !== 0) {
      console.warn(`Editor exited with code ${exitCode}; keeping the original message.`);
      return initialText;
    }

    const updated = await fs.readFile(filePath, 'utf8');
    return updated.trim();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};
