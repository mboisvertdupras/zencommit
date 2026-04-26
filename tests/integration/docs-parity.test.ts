import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runCli, toNormalizedLines, workspaceRoot } from '../helpers/cli.ts';

type HelpCase = {
  label: string;
  args: string[];
  title: string;
  markers: string[];
};

type RequiredDocsMarker = {
  marker: string;
  claim: string;
  paths: string[];
};

const trackedDocPaths = [
  'README.md',
  'docs/spec.md',
  'docs/node-native-release-readiness.md',
  'docs/node-native-inventory.md',
  'AGENTS.md',
] as const;

const trackedMetadataPaths = ['package.json', 'src/config/types.ts'] as const;

const readTrackedFiles = async (paths: readonly string[]): Promise<Map<string, string>> => {
  const entries = await Promise.all(
    paths.map(
      async (relativePath) =>
        [relativePath, await fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')] as const,
    ),
  );

  return new Map(entries);
};

const getTrackedFile = (files: Map<string, string>, relativePath: string): string => {
  const content = files.get(relativePath);

  if (content === undefined) {
    throw new Error(`tracked file was not loaded: ${relativePath}`);
  }

  return content;
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

const markerAppearsInAny = (
  files: Map<string, string>,
  paths: readonly string[],
  marker: string,
): boolean => paths.some((relativePath) => getTrackedFile(files, relativePath).includes(marker));

const collectMissingDocsMarkers = (
  files: Map<string, string>,
  requirements: readonly RequiredDocsMarker[],
): string[] =>
  requirements
    .filter(({ marker, paths }) => !markerAppearsInAny(files, paths, marker))
    .map(
      ({ marker, claim, paths }) =>
        `${claim}: missing ${JSON.stringify(marker)} from ${paths.join(', ')}`,
    );

const expectRegexInFile = (content: string, pattern: RegExp, message: string): void => {
  expect(pattern.test(content), message).toBe(true);
};

const expectNoRegexInFile = (content: string, pattern: RegExp, message: string): void => {
  expect(pattern.test(content), message).toBe(false);
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

const userFacingCliMarkers: RequiredDocsMarker[] = [
  { marker: 'zencommit auth', claim: 'auth command group docs', paths: [...trackedDocPaths] },
  { marker: 'zencommit auth login', claim: 'auth login docs', paths: [...trackedDocPaths] },
  { marker: 'zencommit auth logout', claim: 'auth logout docs', paths: [...trackedDocPaths] },
  { marker: 'zencommit config', claim: 'config command group docs', paths: [...trackedDocPaths] },
  { marker: 'zencommit models', claim: 'models command group docs', paths: [...trackedDocPaths] },
  { marker: 'zencommit models search', claim: 'models search docs', paths: [...trackedDocPaths] },
  {
    marker: 'zencommit models info <modelId>',
    claim: 'models info positional docs',
    paths: [...trackedDocPaths],
  },
  { marker: '--help', claim: 'global help option docs', paths: [...trackedDocPaths] },
  { marker: '--version', claim: 'global version option docs', paths: [...trackedDocPaths] },
  { marker: '--verbose', claim: 'verbosity option docs', paths: [...trackedDocPaths] },
  { marker: '--yes', claim: 'confirmation skip option docs', paths: [...trackedDocPaths] },
  { marker: '--dry-run', claim: 'dry-run option docs', paths: [...trackedDocPaths] },
  { marker: '--all', claim: 'stage-all option docs', paths: [...trackedDocPaths] },
  { marker: '--unstaged', claim: 'unstaged option docs', paths: [...trackedDocPaths] },
  { marker: '--commit', claim: 'unstaged commit override docs', paths: [...trackedDocPaths] },
  { marker: '--push', claim: 'push option docs', paths: [...trackedDocPaths] },
  { marker: '--model', claim: 'model override option docs', paths: [...trackedDocPaths] },
  { marker: '--format', claim: 'format option docs', paths: [...trackedDocPaths] },
  { marker: '--lang', claim: 'language option docs', paths: [...trackedDocPaths] },
  { marker: '--no-body', claim: 'subject-only option docs', paths: [...trackedDocPaths] },
  { marker: '--env-key', claim: 'auth env-key option docs', paths: [...trackedDocPaths] },
  { marker: '--token', claim: 'auth token option docs', paths: [...trackedDocPaths] },
  { marker: '--max-items', claim: 'models max-items option docs', paths: [...trackedDocPaths] },
  {
    marker: 'models info <modelId>',
    claim: 'model info positional shape docs',
    paths: [...trackedDocPaths],
  },
];

describe('docs parity with built CLI help and tooling claims', () => {
  it('keeps built CLI help output observable for documented command groups and options', async () => {
    for (const helpCase of helpCases) {
      await expectHelpContains(helpCase);
    }
  });

  it('documents the command groups and options exposed by the built CLI help surface', async () => {
    const docs = await readTrackedFiles(trackedDocPaths);
    const missingMarkers = collectMissingDocsMarkers(docs, userFacingCliMarkers);

    expect(
      missingMarkers,
      `tracked docs must include built CLI help markers:\n${missingMarkers.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps documented defaults aligned with package metadata and source config', async () => {
    const files = await readTrackedFiles([...trackedDocPaths, ...trackedMetadataPaths]);
    const readme = getTrackedFile(files, 'README.md');
    const agents = getTrackedFile(files, 'AGENTS.md');
    const packageJson = JSON.parse(getTrackedFile(files, 'package.json')) as {
      engines?: { node?: string };
    };
    const configTypes = getTrackedFile(files, 'src/config/types.ts');

    expect(packageJson.engines?.node, 'package.json engines.node must remain the Node floor').toBe(
      '>=22.14.0',
    );
    expect(readme, 'README default schema must document openai/gpt-5').toContain(
      '"model": "openai/gpt-5"',
    );
    expect(configTypes, 'src/config/types.ts defaultConfig must keep openai/gpt-5').toContain(
      "model: 'openai/gpt-5'",
    );

    expectRegexInFile(
      readme,
      /Node(?:\.js)?[^\n`]*`?>=\s?22\.14\.0`?/,
      'README must mention the exact Node >=22.14.0 runtime floor',
    );
    expectRegexInFile(
      agents,
      /Node(?:\.js)?[^\n`]*`?>=\s?22\.14\.0`?/,
      'AGENTS.md must mention the exact Node >=22.14.0 runtime floor',
    );

    for (const [label, content] of [
      ['README.md', readme],
      ['AGENTS.md', agents],
    ] as const) {
      expect(content, `${label} must name Oxlint as the active lint surface`).toContain('Oxlint');
      expectRegexInFile(
        content,
        /typecheck/i,
        `${label} must pair lint docs with the TypeScript typecheck gate`,
      );
      expectNoRegexInFile(
        content,
        /run ESLint|ESLint\s*\(`eslint\.config\.js`\)|ESLint as the active lint/i,
        `${label} must not describe ESLint as the active lint surface`,
      );
    }
  });

  it('keeps release and migration docs scoped to current Node/Oxlint security posture', async () => {
    const docs = await readTrackedFiles(trackedDocPaths);
    const releaseReadiness = getTrackedFile(docs, 'docs/node-native-release-readiness.md');
    const inventory = getTrackedFile(docs, 'docs/node-native-inventory.md');

    expect(
      releaseReadiness,
      'release readiness docs must include the low-threshold security audit command',
    ).toContain('npm audit --audit-level=low');
    expect(
      inventory,
      'Bun inventory must be titled as migration inventory, not current commands',
    ).toContain('# Node-Native Migration Inventory (Bun Usage)');
    expect(
      inventory,
      'Bun inventory must describe historical Bun usage as work to address during migration',
    ).toContain('must be addressed');
    expect(
      inventory,
      'Bun validation commands must be explicitly scoped as pre-migration baseline evidence',
    ).toContain('Baseline validation before migration edits');
  });
});
