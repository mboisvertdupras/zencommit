#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import type { Argv } from 'yargs';
import { runDefaultCommand } from './commands/default.js';
import { runAuthLogin, runAuthLogout, runAuthStatus } from './commands/auth.js';
import { runConfigInit, runConfigPrint, runConfigValidate } from './commands/config.js';
import { runModelsInfo, runModelsSearch } from './commands/models.js';
import { setVerbosity } from './util/logger.js';

type DefaultArgs = {
  yes: boolean;
  'dry-run': boolean;
  all: boolean;
  unstaged: boolean;
  commit: boolean;
  model?: string;
  format?: 'conventional' | 'freeform';
  lang?: string;
  'no-body': boolean;
  verbose: number;
  '--'?: string[];
};

type AuthArgs = {
  'env-key'?: string;
  token?: string;
};

type ModelsSearchArgs = {
  query?: string;
  maxItems?: number;
};

type ModelsInfoArgs = {
  modelId: string;
};

const cli = (yargs(hideBin(process.argv)) as Argv<DefaultArgs>)
  .scriptName('zencommit')
  .parserConfiguration({ 'populate--': true })
  .option('verbose', {
    alias: 'v',
    count: true,
    default: 0,
    describe: 'Increase verbosity (-v, -vv, -vvv)',
  })
  .middleware((argv) => {
    const verboseCount = typeof argv.verbose === 'number' ? (argv.verbose as number) : 0;
    setVerbosity(verboseCount);
  })
  .command(
    '$0',
    'Generate commit message',
    (yargsBuilder) =>
      yargsBuilder
        .option('yes', {
          type: 'boolean',
          default: false,
          describe: 'Skip confirmation and commit',
        })
        .option('dry-run', {
          type: 'boolean',
          default: false,
          describe: 'Do not commit; print output',
        })
        .option('all', {
          type: 'boolean',
          default: false,
          describe: 'Stage all changes before generating',
        })
        .option('unstaged', { type: 'boolean', default: false, describe: 'Use unstaged diff' })
        .option('commit', {
          type: 'boolean',
          default: false,
          describe: 'Allow committing with --unstaged',
        })
        .option('model', { type: 'string', describe: 'Override model id' })
        .option('format', {
          type: 'string',
          choices: ['conventional', 'freeform'] as const,
          describe: 'Commit style',
        })
        .option('lang', { type: 'string', describe: 'Commit language' })
        .option('no-body', { type: 'boolean', default: false, describe: 'Subject only' }),
    async (argv: DefaultArgs) => {
      await runDefaultCommand({
        yes: argv.yes,
        dryRun: argv['dry-run'],
        all: argv.all,
        unstaged: argv.unstaged,
        commit: argv.commit,
        model: argv.model,
        format: argv.format,
        lang: argv.lang,
        noBody: argv['no-body'],
        verbose: argv.verbose,
        '--': argv['--'],
      });
    },
  )
  .command(
    'auth',
    'Manage credentials',
    (yargsBuilder) =>
      yargsBuilder
        .command(
          'login',
          'Store an API key in Bun secrets',
          (sub) =>
            sub
              .option('env-key', { type: 'string', describe: 'Environment key name' })
              .option('token', { type: 'string', describe: 'Secret token value' }),
          async (argv: AuthArgs) => {
            await runAuthLogin({ envKey: argv['env-key'], token: argv.token });
          },
        )
        .command(
          'logout',
          'Remove an API key from Bun secrets',
          (sub) => sub.option('env-key', { type: 'string', describe: 'Environment key name' }),
          async (argv: AuthArgs) => {
            await runAuthLogout({ envKey: argv['env-key'] });
          },
        )
        .command(
          'status',
          'Show stored credentials',
          () => {},
          async () => {
            await runAuthStatus();
          },
        )
        .demandCommand(1, 'Specify a subcommand'),
    () => {},
  )
  .command(
    'config',
    'Configuration commands',
    (yargsBuilder) =>
      yargsBuilder
        .command(
          'print',
          'Print resolved config',
          () => {},
          async () => {
            await runConfigPrint();
          },
        )
        .command(
          'init',
          'Write a starter config file',
          () => {},
          async () => {
            await runConfigInit();
          },
        )
        .command(
          'validate',
          'Validate resolved config',
          () => {},
          async () => {
            await runConfigValidate();
          },
        )
        .demandCommand(1, 'Specify a subcommand'),
    () => {},
  )
  .command(
    'models',
    'Model metadata commands',
    (yargsBuilder) =>
      yargsBuilder
        .command(
          'search [query]',
          'Search models',
          (sub) =>
            sub
              .positional('query', { type: 'string' })
              .option('max-items', {
                type: 'number',
                default: 10,
                describe: 'Max items to display in autocomplete',
              }),
          async (argv: ModelsSearchArgs) => {
            await runModelsSearch(argv.query, argv.maxItems ?? 10);
          },
        )
        .command(
          'info <modelId>',
          'Show model info',
          (sub) => sub.positional('modelId', { type: 'string', demandOption: true }),
          async (argv: ModelsInfoArgs) => {
            await runModelsInfo(argv.modelId);
          },
        )
        .demandCommand(1, 'Specify a subcommand'),
    () => {},
  )
  .strict()
  .help();

await cli.parse();
