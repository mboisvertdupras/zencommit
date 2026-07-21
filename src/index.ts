#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import type { Argv } from 'yargs';
import { setVerbosity } from './util/logger.js';

type DefaultArgs = {
  yes: boolean;
  'dry-run': boolean;
  all: boolean;
  unstaged: boolean;
  commit: boolean;
  push: boolean;
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
  'token-stdin'?: boolean;
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
  .parserConfiguration({
    'boolean-negation': false,
    'populate--': true,
    'short-option-groups': true,
  })
  .option('verbose', {
    alias: 'v',
    count: true,
    default: 0,
    describe: 'Increase verbosity (-v, -vv, -vvv)',
  })
  .middleware((argv) => {
    const verboseCount = typeof argv.verbose === 'number' ? argv.verbose : 0;
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
          alias: 'a',
          describe: 'Stage all changes before generating',
        })
        .option('unstaged', { type: 'boolean', default: false, describe: 'Use unstaged diff' })
        .option('commit', {
          type: 'boolean',
          default: false,
          describe: 'Allow committing with --unstaged',
        })
        .option('push', {
          type: 'boolean',
          default: false,
          alias: 'p',
          describe: 'Push after committing',
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
      const { runDefaultCommand } = await import('./commands/default.js');
      await runDefaultCommand({
        yes: argv.yes,
        dryRun: argv['dry-run'],
        all: argv.all,
        unstaged: argv.unstaged,
        commit: argv.commit,
        push: argv.push,
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
          'Store an API key in secure store',
          (sub: Argv<AuthArgs>) =>
            sub
              .option('env-key', { type: 'string', describe: 'Environment key name' })
              .option('token', { type: 'string', describe: 'Secret token value' })
              .option('token-stdin', {
                type: 'boolean',
                default: false,
                describe: 'Read the secret token from stdin',
              }),
          async (argv: AuthArgs) => {
            const { runAuthLogin } = await import('./commands/auth.js');
            await runAuthLogin({
              envKey: argv['env-key'],
              token: argv.token,
              tokenStdin: argv['token-stdin'],
            });
          },
        )
        .command(
          'logout',
          'Remove an API key from secure store',
          (sub: Argv<AuthArgs>) =>
            sub.option('env-key', { type: 'string', describe: 'Environment key name' }),
          async (argv: AuthArgs) => {
            const { runAuthLogout } = await import('./commands/auth.js');
            await runAuthLogout({ envKey: argv['env-key'] });
          },
        )
        .command(
          'status',
          'Show stored credentials',
          () => {},
          async () => {
            const { runAuthStatus } = await import('./commands/auth.js');
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
            const { runConfigPrint } = await import('./commands/config.js');
            await runConfigPrint();
          },
        )
        .command(
          'init',
          'Write a starter config file',
          () => {},
          async () => {
            const { runConfigInit } = await import('./commands/config.js');
            await runConfigInit();
          },
        )
        .command(
          'validate',
          'Validate resolved config',
          () => {},
          async () => {
            const { runConfigValidate } = await import('./commands/config.js');
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
          (sub: Argv<ModelsSearchArgs>) =>
            sub.positional('query', { type: 'string' }).option('max-items', {
              type: 'number',
              default: 10,
              describe: 'Max items to display in autocomplete',
            }),
          async (argv: ModelsSearchArgs) => {
            const { runModelsSearch } = await import('./commands/models.js');
            await runModelsSearch(argv.query, argv.maxItems ?? 10);
          },
        )
        .command(
          'info <modelId>',
          'Show model info',
          { modelId: { type: 'string', demandOption: true } },
          async (argv: ModelsInfoArgs) => {
            const { runModelsInfo } = await import('./commands/models.js');
            await runModelsInfo(argv.modelId);
          },
        )
        .demandCommand(1, 'Specify a subcommand'),
    () => {},
  )
  .strict()
  .help();

await cli.parse();
