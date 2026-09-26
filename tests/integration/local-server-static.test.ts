import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path'; import os from 'node:os';
import { BindingStore } from '../../src/store/binding-store.js';
import { LensService } from '../../src/host/lens-service.js';
import { startLocalServer } from '../../src/host/local-server/server.js';
it('serves only built UI assets and rejects encoded traversal and escaping symlinks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lens-static-')), ui = path.join(root, 'ui');
  await mkdir(ui); await writeFile(path.join(ui, 'index.html'), '<h1>Test UI</h1>'); await writeFile(path.join(root, 'private.html'), 'PRIVATE_MARKER'); await symlink(path.join(root, 'private.html'), path.join(ui, 'escape.html')); await writeFile(path.join(ui, 'tasks.md'), 'PRIVATE_MARKER');
  const store = await BindingStore.open(path.join(root, 'state')), service = new LensService(store), server = await startLocalServer(service, { uiDirectory: ui });
  function raw(rawPath: string) { return new Promise<{ status: number | undefined; body: string }>((resolve, reject) => { const base = new URL(server.origin); const req = request({ hostname: base.hostname, port: base.port, path: rawPath, method: 'GET', headers: { host: base.host } }, res => { let body = ''; res.setEncoding('utf8'); res.on('data', part => { body += part; }); res.on('end', () => resolve({ status: res.statusCode, body })); }); req.on('error', reject); req.end(); }); }
  try {
    const normal = await fetch(server.origin); expect(normal.status).toBe(200); expect(normal.headers.get('content-security-policy')).toContain("frame-ancestors 'none'"); expect(normal.headers.get('content-security-policy')).not.toContain('unsafe-inline');
    for (const input of ['/..%2fprivate.html', '/%2e%2e/private.html', '/escape.html', '/tasks.md']) { const response = await raw(input); expect([403, 404]).toContain(response.status); expect(response.body).not.toContain('PRIVATE_MARKER'); }
  } finally { await server.close(); await service.close(); await store.close(); await rm(root, { recursive: true, force: true }); }
});
