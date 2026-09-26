import { it, expect } from 'vitest';
import { inspectApp, trustedPublisher, verifyEndpoint, windowsListeners, type SystemQuery } from '../../src/platform/windows/codex-app.js';
const executable = 'C:\\Apps\\Codex\\Codex.exe';
const info = { path: executable, status: 'Valid', subject: 'CN=OpenAI, Inc., O=OpenAI, Inc., C=US', product: 'Codex', version: '1.0.0' };
it('accepts exact trusted publishers, not lookalike names', () => {
  expect(trustedPublisher(info.subject)).toBe(true);
  expect(trustedPublisher('CN=OpenAI OpCo, LLC, C=US')).toBe(true);
  for (const subject of ['CN=OpenAI Malware Inc., C=US', 'CN=Not OpenAI, C=US', 'CN=Microsoft Corporation', null]) expect(trustedPublisher(subject)).toBe(false);
});
it('requires a valid signature and product, and rejects remote or command paths', async () => {
  expect((await inspectApp(executable, async () => info)).executable).toBe(executable);
  for (const bad of ['\\\\server\\Codex.exe', 'Codex.exe', 'C:\\Apps\\run.cmd']) await expect(inspectApp(bad, async () => info)).rejects.toMatchObject({ code: 'invalid_request' });
  await expect(inspectApp(executable, async () => ({ ...info, status: 'NotSigned' }))).rejects.toMatchObject({ code: 'permission_denied' });
  await expect(inspectApp(executable, async () => ({ ...info, product: 'Unrelated App' }))).rejects.toMatchObject({ code: 'permission_denied' });
});
it('validates loopback ownership before and after target lookup', async () => {
  let changed = false;
  const run: SystemQuery = async op => op === 'inspect' ? info : op === 'process' ? { path: changed ? 'C:\\Other.exe' : executable, created: '2026-09-27' } : [{ pid: 42, port: 9341, address: '127.0.0.1' }];
  const app = await inspectApp(executable, run);
  const endpoint = await verifyEndpoint(app, 9341, run, async () => [{ id: 'abc', type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9341/devtools/page/abc' }]);
  expect(endpoint.targets).toHaveLength(1);
  await expect(verifyEndpoint(app, 9341, run, async () => { changed = true; return []; })).rejects.toMatchObject({ code: 'permission_denied' });
});
it('refuses public listeners and invalid process records', () => {
  expect(windowsListeners([{ pid: 42, port: 9341, address: '::1' }], 9341)).toHaveLength(1);
  for (const address of ['0.0.0.0', '::', '192.168.1.3']) expect(() => windowsListeners([{ pid: 42, port: 9341, address }], 9341)).toThrow();
  expect(() => windowsListeners(null, 9341)).toThrow();
});
