import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Exercise package-manager dispatch, not only the compiled CLI: pnpm owns "doctor".
test('documented doctor command invokes the project script and forwards arguments', async () => {
  const execute = promisify(execFile);
  const options = { timeout: 10000, maxBuffer: 512 * 1024 };
  const help = await execute('corepack', ['pnpm', 'run', 'doctor', '--', '--help'], options);
  expect(help.stdout).toContain('Codex Task Lens');
  expect(help.stdout).toContain('pnpm run doctor');
  expect(help.stdout).not.toContain('Checks for known common issues');
  await expect(execute('corepack', ['pnpm', 'run', 'doctor', '--', '--invalid-task-lens-test-flag'], options))
    .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('不支持的参数') });
});
