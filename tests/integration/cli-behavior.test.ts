import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createTempRepo, normalizeOutput, runCli } from '../helpers/cli.ts';

type PrintedConfig = {
  ai: {
    model: string;
    temperature: number;
  };
  commit: {
    style: string;
    language: string;
    includeBody: boolean;
  };
  diff: {
    includeFileList: boolean;
    maxFiles: number;
  };
  git: {
    confirmBeforeCommit: boolean;
  };
};

type ConfigPrintResult = {
  config: PrintedConfig;
  sources: Record<string, string>;
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const createSandbox = async (): Promise<string> =>
  await fs.mkdtemp(path.join(os.tmpdir(), 'zencommit-cli-behavior-'));

const cleanCliEnv = {
  ZENCOMMIT_CONFIG: undefined,
  ZENCOMMIT_CONFIG_CONTENT: undefined,
  ZENCOMMIT_MOCK_RESPONSE: undefined,
  XDG_CONFIG_HOME: undefined,
  XDG_CACHE_HOME: undefined,
};

const parseConfigPrintOutput = (stdout: string): ConfigPrintResult => {
  const output = normalizeOutput(stdout);
  const separator = '\n\nSources:\n';
  const separatorIndex = output.indexOf(separator);
  expect(separatorIndex).toBeGreaterThan(-1);

  const jsonBlock = output.slice(0, separatorIndex);
  const sourcesBlock = output.slice(separatorIndex + separator.length).trim();
  const config = JSON.parse(jsonBlock) as PrintedConfig;
  const sources: Record<string, string> = {};

  for (const line of sourcesBlock.split('\n').filter((entry) => entry.length > 0)) {
    const separatorAt = line.indexOf(': ');
    expect(separatorAt).toBeGreaterThan(0);
    sources[line.slice(0, separatorAt)] = line.slice(separatorAt + 2);
  }

  return { config, sources };
};

const writeLocalMetadataFixture = async (repo: string): Promise<void> => {
  await writeJson(path.join(repo, 'models.metadata.json'), [
    {
      id: 'openai/test-model',
      name: 'OpenAI Test Model',
      limits: { context: 8000, input: 8000, output: 4096 },
    },
  ]);
};

const localMetadataConfig = {
  ai: {
    model: 'openai/test-model',
  },
  metadata: {
    provider: 'local',
    providers: {
      local: {
        path: './models.metadata.json',
      },
    },
  },
};

describe('built CLI behavior', () => {
  it('prints resolved config using global, custom, project, and inline precedence', async () => {
    const sandbox = await createSandbox();
    const repo = await createTempRepo({ prefix: 'zencommit-config-precedence-' });
    const xdgConfigHome = path.join(sandbox, 'xdg-config');
    const customConfigPath = path.join(sandbox, 'custom.json');

    await writeJson(path.join(xdgConfigHome, 'zencommit', 'config.json'), {
      ai: {
        model: 'openai/global-model',
        temperature: 0.1,
      },
      commit: {
        style: 'freeform',
        language: 'global-language',
      },
      git: {
        confirmBeforeCommit: false,
      },
    });
    await writeJson(customConfigPath, {
      ai: {
        model: 'openai/custom-model',
      },
      commit: {
        language: 'custom-language',
      },
      metadata: {
        provider: 'local',
      },
    });
    await writeJson(path.join(repo, 'zencommit.json'), {
      ai: {
        model: 'openai/project-model',
      },
      commit: {
        language: 'project-language',
      },
      diff: {
        includeFileList: false,
        maxFiles: 31,
      },
    });

    const result = await runCli(['config', 'print'], {
      cwd: repo,
      env: {
        ...cleanCliEnv,
        XDG_CONFIG_HOME: xdgConfigHome,
        ZENCOMMIT_CONFIG: customConfigPath,
        ZENCOMMIT_CONFIG_CONTENT: JSON.stringify({
          ai: {
            temperature: 0.8,
          },
          commit: {
            includeBody: false,
            language: 'inline-language',
          },
        }),
      },
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');

    const { config, sources } = parseConfigPrintOutput(result.stdout);
    expect(config.ai.model).toBe('openai/project-model');
    expect(config.ai.temperature).toBe(0.8);
    expect(config.commit.style).toBe('freeform');
    expect(config.commit.language).toBe('inline-language');
    expect(config.commit.includeBody).toBe(false);
    expect(config.diff.includeFileList).toBe(false);
    expect(config.diff.maxFiles).toBe(31);
    expect(config.git.confirmBeforeCommit).toBe(false);
    expect(sources.ai).toBe('inline');
    expect(sources.commit).toBe('inline');
    expect(sources.diff).toBe('project');
    expect(sources.git).toBe('global');
    expect(sources.metadata).toBe('custom');
  });

  it('prints dry-run subject only when --no-body overrides config body output', async () => {
    const repo = await createTempRepo({
      prefix: 'zencommit-dry-run-no-body-',
      withStagedChange: true,
    });
    await writeLocalMetadataFixture(repo);

    const result = await runCli(['--dry-run', '--yes', '--no-body'], {
      cwd: repo,
      env: {
        ...cleanCliEnv,
        ZENCOMMIT_CONFIG_CONTENT: JSON.stringify({
          ...localMetadataConfig,
          commit: {
            includeBody: true,
          },
        }),
        ZENCOMMIT_MOCK_RESPONSE: JSON.stringify({
          subject: 'feat: pin dry-run subject',
          body: 'raw-response-payload body should be hidden',
        }),
      },
    });

    expect(result.code).toBe(0);
    expect(normalizeOutput(result.stderr)).toBe('');
    expect(result.stdout).toContain('feat: pin dry-run subject');
    expect(result.stdout).not.toContain('raw-response-payload body should be hidden');
  });

  it('classifies malformed inline config as exit code 2 without echoing secret-like payloads', async () => {
    const fakeSecret = 'sk-s05-secret';
    const result = await runCli(['config', 'validate'], {
      env: {
        ...cleanCliEnv,
        ZENCOMMIT_CONFIG_CONTENT: `{"ai":{"model":"${fakeSecret}"`,
      },
    });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Invalid JSON in inline config from ZENCOMMIT_CONFIG_CONTENT');
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(fakeSecret);
  });

  it('classifies no diff as exit code 3 without helper exceptions', async () => {
    const repo = await createTempRepo({ prefix: 'zencommit-no-diff-' });
    const result = await runCli(['--dry-run', '--yes'], {
      cwd: repo,
      env: {
        ...cleanCliEnv,
        ZENCOMMIT_MOCK_RESPONSE: JSON.stringify({
          subject: 'feat: unreachable mock',
          body: 'Body',
        }),
      },
    });

    expect(result.code).toBe(3);
    expect(result.stderr).toContain('No diff to summarize.');
    expect(result.stdout).toBe('');
  });

  it('classifies malformed mock output as exit code 4 without echoing raw response payloads', async () => {
    const repo = await createTempRepo({
      prefix: 'zencommit-invalid-mock-',
      withStagedChange: true,
    });
    await writeLocalMetadataFixture(repo);

    const result = await runCli(['--dry-run', '--yes'], {
      cwd: repo,
      env: {
        ...cleanCliEnv,
        ZENCOMMIT_CONFIG_CONTENT: JSON.stringify(localMetadataConfig),
        ZENCOMMIT_MOCK_RESPONSE: 'raw-response-payload sk-s05-secret',
      },
    });

    expect(result.code).toBe(4);
    expect(result.stderr).toContain('Invalid commit message response during mock response');
    expect(result.stderr).toContain('expected valid JSON object');
    expect(`${result.stdout}\n${result.stderr}`).not.toContain('raw-response-payload');
    expect(`${result.stdout}\n${result.stderr}`).not.toContain('sk-s05-secret');
  });
});
