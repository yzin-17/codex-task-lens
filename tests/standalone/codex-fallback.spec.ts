import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
test('Codex connection failure leaves the real protected document service usable', async () => {
  const module: typeof import('../../src/host/codex-runtime.js') = await import(pathToFileURL(path.resolve('dist/node/host/codex-runtime.js')).href);
  const root = await mkdtemp(path.join(tmpdir(), 'lens-fallback-'));
  const runtime = await module.startCodex({ sourceId: 'fixture', cdpPort: 9341, appPath: '/__task_lens_missing__.app', dataDirectory: path.join(root, 'state'), openBrowser: false });
  try {
    expect(runtime.status().targets).toBe(0);
    const file = path.join(root, 'task.md'); await writeFile(file, '- [ ] fallback task\n');
    const monitor = { kind: 'standalone' as const, id: 'fallback' }, grant = await runtime.service.authorize(file, 'file');
    const preview = await runtime.service.preview(monitor, 0, grant.id, file, { kind: 'document' }); await runtime.service.confirm(monitor, 0, preview.id, 0);
    await expect.poll(async () => (await runtime.service.snapshot(monitor)).snapshot?.tasks?.total).toBe(1);
    const token = new URLSearchParams(new URL(runtime.url).hash.slice(1)).get('token');
    const response = await fetch(runtime.origin + '/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, origin: runtime.origin }, body: JSON.stringify({ protocolVersion: 1, requestId: 'fallback-read', monitor, generation: 0, operation: 'getSnapshot', params: {} }) });
    expect(response.status).toBe(200); expect(await response.text()).toContain('fallback task');
  } finally { await runtime.close(); await rm(root, { recursive: true, force: true }); }
  await expect(fetch(runtime.origin)).rejects.toThrow();
});
test('compiled CLI starts and stops standalone without touching Codex; Mac probe requires consent', async () => {
  const execute = promisify(execFile), root = await mkdtemp(path.join(tmpdir(), 'lens-cli-'));
  expect((await execute(process.execPath, ['dist/node/cli/index.js', '--help'])).stdout).toContain('--cdp-port');
  await expect(execute(process.execPath, ['dist/node/cli/mac-probe.js'])).rejects.toMatchObject({ code: 1 });
  const child = spawn(process.execPath, ['dist/node/cli/index.js', '--standalone', '--no-open', '--data-dir', path.join(root, 'state')], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code)); });
  try {
    const output = await new Promise<string>((resolve, reject) => {
      let text = ''; const timer = setTimeout(() => reject(new Error('CLI startup timed out')), 10000);
      child.stdout.on('data', chunk => { text += String(chunk); if (text.includes('已启动')) { clearTimeout(timer); resolve(text); } });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('CLI exited before startup')); });
    });
    expect(output).not.toContain('#token='); child.kill('SIGTERM'); expect(await exited).toBe(0);
  } finally { if (child.exitCode === null) child.kill('SIGTERM'); await exited; await rm(root, { recursive: true, force: true }); }
});
