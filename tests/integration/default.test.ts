import { describe, expect, it } from 'vitest';

import { createTempRepo, runCli } from '../helpers/cli.ts';

describe('zencommit default command', () => {
  it('runs with dry-run and mock output', async () => {
    const dir = await createTempRepo({ withStagedChange: true });
    const mock = JSON.stringify({ subject: 'feat: test commit', body: 'Body' });
    const result = await runCli(['--dry-run', '--yes'], {
      cwd: dir,
      env: {
        ZENCOMMIT_MOCK_RESPONSE: mock,
      },
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('feat: test commit');
  });
});
