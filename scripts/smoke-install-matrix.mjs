import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

const mockResponse = {
  subject: 'feat: install mode smoke matrix',
  body: 'Release gate smoke validation',
};

const expectedOutput = [mockResponse.subject, mockResponse.body];

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zencommit-smoke-'));

const commandForPlatform = (command) => {
  if (process.platform === 'win32' && (command === 'npm' || command === 'npx')) {
    return `${command}.cmd`;
  }
  return command;
};

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (error) => {
      reject(error);
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr, command, args });
    });
  });

const runChecked = async (label, command, args, options = {}) => {
  const result = await run(command, args, options);
  if (result.code !== 0) {
    throw new Error(
      [
        `${label} failed with exit code ${result.code}`,
        `Command: ${command} ${args.join(' ')}`,
        `STDOUT:\n${result.stdout}`,
        `STDERR:\n${result.stderr}`,
      ].join('\n\n'),
    );
  }
  return result;
};

const createTempRepo = async (name, prepare) => {
  const repo = path.join(tempRoot, name);
  await fs.mkdir(repo, { recursive: true });
  await runChecked('git init', 'git', ['init'], { cwd: repo, env: process.env });

  if (prepare) {
    await prepare(repo);
  }

  await fs.writeFile(path.join(repo, 'file.txt'), 'hello\n', 'utf8');
  await runChecked('git add', 'git', ['add', 'file.txt'], {
    cwd: repo,
    env: process.env,
  });

  return repo;
};

const ensureTarball = async () => {
  const tarballArg = process.argv[2];
  if (tarballArg) {
    const providedPath = path.resolve(process.cwd(), tarballArg);
    await fs.access(providedPath);
    return providedPath;
  }

  const packResult = await runChecked('npm pack', commandForPlatform('npm'), ['pack', '--json'], {
    cwd: pkgRoot,
    env: process.env,
  });

  const packStdout = packResult.stdout.trim();
  const jsonStart = packStdout.indexOf('[');
  const jsonEnd = packStdout.lastIndexOf(']');

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    throw new Error(`npm pack --json did not return parseable JSON output: ${packResult.stdout}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(packStdout.slice(jsonStart, jsonEnd + 1));
  } catch (error) {
    throw new Error(`Failed to parse npm pack output as JSON: ${String(error)}`);
  }

  const filename = parsed?.[0]?.filename;
  if (typeof filename !== 'string' || filename.length === 0) {
    throw new Error(`npm pack output did not include a tarball filename: ${packResult.stdout}`);
  }

  return path.join(pkgRoot, filename);
};

const assertSmokeResult = (mode, result) => {
  if (result.code !== 0) {
    throw new Error(
      [
        `Smoke mode '${mode}' failed with exit code ${result.code}`,
        `Command: ${result.command} ${result.args.join(' ')}`,
        `STDOUT:\n${result.stdout}`,
        `STDERR:\n${result.stderr}`,
      ].join('\n\n'),
    );
  }

  for (const snippet of expectedOutput) {
    if (!result.stdout.includes(snippet)) {
      throw new Error(
        [
          `Smoke mode '${mode}' did not include expected output: ${snippet}`,
          `Command: ${result.command} ${result.args.join(' ')}`,
          `STDOUT:\n${result.stdout}`,
          `STDERR:\n${result.stderr}`,
        ].join('\n\n'),
      );
    }
  }
};

const smokeEnv = {
  ...process.env,
  NO_COLOR: '1',
  ZENCOMMIT_MOCK_RESPONSE: JSON.stringify(mockResponse),
};

const runGlobalSmoke = async (tarballPath) => {
  const prefix = path.join(tempRoot, 'global-prefix');
  const repo = await createTempRepo('global-repo');

  await runChecked(
    'npm install -g tarball',
    commandForPlatform('npm'),
    ['install', '--global', '--prefix', prefix, tarballPath],
    { cwd: pkgRoot, env: process.env },
  );

  const command =
    process.platform === 'win32'
      ? path.join(prefix, 'zencommit.cmd')
      : path.join(prefix, 'bin', 'zencommit');

  const result = await run(command, ['--dry-run', '--yes'], {
    cwd: repo,
    env: smokeEnv,
  });

  assertSmokeResult('global', result);
};

const runNpxSmoke = async (tarballPath) => {
  const repo = await createTempRepo('npx-repo');

  const result = await run(
    commandForPlatform('npx'),
    ['--yes', '--package', tarballPath, 'zencommit', '--dry-run', '--yes'],
    {
      cwd: repo,
      env: smokeEnv,
    },
  );

  assertSmokeResult('npx', result);
};

const runLocalSmoke = async (tarballPath) => {
  const repo = await createTempRepo('local-repo', async (repoPath) => {
    await runChecked('npm init', commandForPlatform('npm'), ['init', '-y'], {
      cwd: repoPath,
      env: process.env,
    });

    await runChecked(
      'npm install local tarball',
      commandForPlatform('npm'),
      ['install', '--save-dev', tarballPath],
      {
        cwd: repoPath,
        env: process.env,
      },
    );
  });

  const result = await run(
    commandForPlatform('npm'),
    ['exec', '--yes', 'zencommit', '--', '--dry-run', '--yes'],
    {
      cwd: repo,
      env: smokeEnv,
    },
  );

  assertSmokeResult('local', result);
};

let keepTemp = false;

try {
  const tarballPath = await ensureTarball();
  console.log(`Using tarball: ${tarballPath}`);

  await runGlobalSmoke(tarballPath);
  await runNpxSmoke(tarballPath);
  await runLocalSmoke(tarballPath);

  console.log('Install-mode smoke matrix passed (global, npx, local).');
} catch (error) {
  keepTemp = true;
  console.error(error);
  console.error(`Smoke workspace retained for debugging: ${tempRoot}`);
  process.exitCode = 1;
} finally {
  if (!keepTemp) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
