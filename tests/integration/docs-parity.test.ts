import { describe, expect, it } from 'vitest';

import { runCli, toNormalizedLines } from '../helpers/cli.ts';

type HelpCase = {
  label: string;
  args: string[];
  title: string;
  markers: string[];
};

const cliDiagnostics = (result: Awaited<ReturnType<typeof runCli>>): string =>
  [
    `command: ${result.command.join(' ')}`,
    `cwd: ${result.cwd}`,
    `code: ${String(result.code)}`,
    `stdout:\n${result.stdout}`,
    `stderr:\n${result.stderr}`,
  ].join('\n');

const expectHelpContains = async ({ label, args, title, markers }: HelpCase): Promise<void> => {
  const result = await runCli(args);

  expect(result.code, `${label} help command must exit 0\n${cliDiagnostics(result)}`).toBe(0);
  expect(
    result.stderr,
    `${label} help command must not print stderr\n${cliDiagnostics(result)}`,
  ).toBe('');

  const normalizedLines = toNormalizedLines(result.stdout);
  expect(
    normalizedLines.some((line) => line.includes(title)),
    `${label} help missing title marker ${JSON.stringify(title)}\n${cliDiagnostics(result)}`,
  ).toBe(true);

  for (const marker of markers) {
    expect(
      result.stdout.includes(marker),
      `${label} help missing marker ${JSON.stringify(marker)}\n${cliDiagnostics(result)}`,
    ).toBe(true);
  }
};

const helpCases: HelpCase[] = [
  {
    label: 'top-level',
    args: ['--help'],
    title: 'zencommit',
    markers: [
      'zencommit auth',
      'zencommit config',
      'zencommit models',
      '--version',
      '--verbose',
      '--help',
      '--yes',
      '--dry-run',
      '--all',
      '--unstaged',
      '--commit',
      '--push',
      '--model',
      '--format',
      '--lang',
      '--no-body',
    ],
  },
  {
    label: 'auth',
    args: ['auth', '--help'],
    title: 'zencommit auth',
    markers: ['zencommit auth login', 'zencommit auth logout', 'zencommit auth status', '--help'],
  },
  {
    label: 'auth login',
    args: ['auth', 'login', '--help'],
    title: 'zencommit auth login',
    markers: ['--env-key', '--token', '--help'],
  },
  {
    label: 'auth logout',
    args: ['auth', 'logout', '--help'],
    title: 'zencommit auth logout',
    markers: ['--env-key', '--help'],
  },
  {
    label: 'config',
    args: ['config', '--help'],
    title: 'zencommit config',
    markers: [
      'zencommit config print',
      'zencommit config init',
      'zencommit config validate',
      '--help',
    ],
  },
  {
    label: 'models',
    args: ['models', '--help'],
    title: 'zencommit models',
    markers: ['zencommit models search [query]', 'zencommit models info <modelId>', '--help'],
  },
  {
    label: 'models search',
    args: ['models', 'search', '--help'],
    title: 'zencommit models search [query]',
    markers: ['query', '--max-items', '--help'],
  },
  {
    label: 'models info',
    args: ['models', 'info', '--help'],
    title: 'zencommit models info <modelId>',
    markers: ['<modelId>', '--modelId', '--help'],
  },
];

describe('built CLI help surface', () => {
  it('prints documented command groups and options', async () => {
    for (const helpCase of helpCases) {
      await expectHelpContains(helpCase);
    }
  });
});
