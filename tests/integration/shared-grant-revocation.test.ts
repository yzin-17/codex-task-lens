import { expect, it } from 'vitest';
import { mkdtemp, writeFile, symlink, unlink, rm } from 'node:fs/promises';
import path from 'node:path'; import os from 'node:os';
import { BindingStore } from '../../src/store/binding-store.js';
import { LensService } from '../../src/host/lens-service.js';
import { DOCUMENT_SCOPE, type MonitorRef } from '../../src/contracts/index.js';
it('freezes each revoked monitor at its own last authorized snapshot, not another grant\'s newer data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lens-grant-isolation-')), file = path.join(root, 'a.md'), alias = path.join(root, 'alias.md'), other = path.join(root, 'b.md');
  await writeFile(file, '- [ ] Old data'); await writeFile(other, '- [ ] Other data'); await symlink(file, alias);
  const store = await BindingStore.open(path.join(root, 'state')), service = new LensService(store, { streamOptions: { stabilityMs: 20, pollMs: 100, debounceMs: 10 } });
  const a: MonitorRef = { kind: 'standalone', id: 'a' }, b: MonitorRef = { kind: 'standalone', id: 'b' };
  try {
    for (const [ref, input] of [[a, alias], [b, file]] as const) { const grant = await service.authorize(input, 'file'), preview = await service.preview(ref, 0, grant.id, grant.realPath, DOCUMENT_SCOPE); await service.confirm(ref, 0, preview.id, 0); await expect.poll(async () => (await service.snapshot(ref)).snapshot?.status).toBe('ready'); }
    await unlink(alias); await symlink(other, alias); await expect.poll(async () => (await service.snapshot(a)).snapshot?.status).toBe('permission_denied');
    await writeFile(file, '- [x] New data after revocation'); await expect.poll(async () => (await service.snapshot(b)).snapshot?.tasks?.items[0]?.title).toBe('New data after revocation');
    const denied = (await service.snapshot(a)).snapshot!;
    expect(denied).toMatchObject({ status: 'permission_denied', cached: true, tasks: { completed: 0 } }); expect(denied.tasks?.items[0]?.title).toBe('Old data');
  } finally { await service.close(); await store.close(); await rm(root, { recursive: true, force: true }); }
});
