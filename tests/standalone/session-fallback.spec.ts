import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('an unavailable optional session source does not disable directory discovery or the local panel', async () => {
  const module: typeof import('../../src/host/codex-runtime.js') = await import(pathToFileURL(path.resolve('dist/node/host/codex-runtime.js')).href);
  const root = await mkdtemp(path.join(tmpdir(), 'lens-session-fallback-'));
  let runtime: Awaited<ReturnType<typeof module.startCodex>> | undefined;
  try {
    const workspace = path.join(root, 'project');
    await mkdir(path.join(workspace, 'docs/tasks'), { recursive: true });
    const document = path.join(workspace, 'docs/tasks/task.md');
    await writeFile(document, '- [ ] still usable\n');
    runtime = await module.startCodex({ sourceId: 'fixture', cdpPort: 9341, appPath: '/__task_lens_missing__.app', dataDirectory: path.join(root, 'state'), sessionRoot: path.join(root, 'missing-source'), allowSessionRead: true, openBrowser: false });
    expect(runtime.status().sessionHints).toBe(false);
    expect(runtime.status().sessionDiagnostic).toContain('会话记录不可用');
    const monitor = { kind: 'thread' as const, sourceId: 'fixture', threadId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' };
    const grant = await runtime.service.authorize(workspace, 'directory');
    const result = await runtime.service.candidates(monitor, grant.id);
    expect(result.candidates).toHaveLength(1);
    expect(result.diagnostics.join(' ')).toContain('会话记录不可用');
    const preview = await runtime.service.preview(monitor, 0, grant.id, document, { kind: 'document' });
    await runtime.service.confirm(monitor, 0, preview.id, 0);
    await expect.poll(async () => (await runtime!.service.snapshot(monitor)).snapshot?.tasks?.total).toBe(1);
    expect((await fetch(runtime.origin)).status).toBe(200);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});
