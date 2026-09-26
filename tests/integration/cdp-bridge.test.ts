import { it, expect, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BindingStore } from '../../src/store/binding-store.js';
import { LensService } from '../../src/host/lens-service.js';
import { CdpBridge, type CdpPeer } from '../../src/host/cdp-bridge/bridge.js';
import type { CdpEvent } from '../../src/adapters/codex/cdp/session.js';
import type { EmbeddedConfiguration, EmbeddedEvent, PaneIdentity } from '../../src/contracts/embedded.js';
import type { Request } from '../../src/contracts/index.js';
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
class Peer implements CdpPeer {
  isClosed = false; config!: EmbeddedConfiguration; panes: PaneIdentity[] = [{ paneId: 'p1', generation: 0, threadId: a }]; events: EmbeddedEvent[] = [];
  handlers = new Map<string, Set<(params: CdpEvent) => void>>();
  async send(method: string, params: CdpEvent = {}): Promise<CdpEvent> {
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'frame' } } };
    if (method === 'Page.createIsolatedWorld') return { executionContextId: 7 };
    if (method === 'Runtime.callFunctionOn') {
      const fn = String(params.functionDeclaration), args = params.arguments as { value: unknown }[];
      if (fn.includes('.install')) this.config = args[0]!.value as EmbeddedConfiguration;
      if (fn.includes('.inspect')) return { result: { value: this.panes } };
      if (fn.includes('.receive')) this.events.push(args[0]!.value as EmbeddedEvent);
    }
    return { result: {} };
  }
  on(method: string, listener: (params: CdpEvent) => void) { const set = this.handlers.get(method) ?? new Set(); set.add(listener); this.handlers.set(method, set); return () => { set.delete(listener); if (!set.size) this.handlers.delete(method); }; }
  emit(request: Request, overrides: CdpEvent = {}, nonce = this.config.nonce) { for (const listener of this.handlers.get('Runtime.bindingCalled') ?? []) listener({ name: this.config.bindingName, executionContextId: 7, payload: JSON.stringify({ nonce, paneId: 'p1', request }), ...overrides }); }
}
const request = (id: string, generation = 0): Request => ({ protocolVersion: 1, requestId: id, monitor: { kind: 'thread', sourceId: 'local', threadId: a }, generation, operation: 'getSnapshot', params: {} });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'lens-bridge-')), store = await BindingStore.open(path.join(root, 'state')), service = new LensService(store), peer = new Peer();
  const bridge = await CdpBridge.attach(peer, service, { sourceId: 'local', bundle: 'fixture', styles: '', refreshMs: 60000 });
  return { root, service, peer, bridge, close: async () => { await bridge.close(); await service.close(); await store.close(); await rm(root, { recursive: true, force: true }); } };
}
it('rejects a spoofed name, context, nonce, monitor and old generation', async () => {
  const f = await fixture(); try {
    f.peer.emit(request('wrong-name'), { name: 'fake' }); f.peer.emit(request('wrong-context'), { executionContextId: 1 }); f.peer.emit(request('wrong-nonce'), {}, 'fake'); f.peer.emit(request('stale', 9));
    f.peer.emit({ ...request('wrong-thread'), monitor: { kind: 'thread', sourceId: 'local', threadId: b } });
    f.peer.emit(request('good'));
    await vi.waitFor(() => expect(f.peer.events.some(event => event.kind === 'reply' && event.requestId === 'good')).toBe(true));
    expect(f.peer.events.filter(event => event.kind === 'reply').map(event => event.requestId)).toEqual(['good']);
  } finally { await f.close(); }
});
it('deduplicates mutations and prevents embedded enumeration of other threads', async () => {
  const f = await fixture(); try {
    const file = path.join(f.root, 'task.md'); await writeFile(file, '- [ ] task'); const spy = vi.spyOn(f.service, 'authorize');
    const grant: Request = { ...request('grant'), operation: 'authorize', params: { path: file, kind: 'file', consent: true } };
    f.peer.emit(grant); f.peer.emit(grant);
    f.peer.emit({ ...request('enumerate'), operation: 'listMonitors', params: {} });
    await vi.waitFor(() => expect(f.peer.events.filter(event => event.kind === 'reply')).toHaveLength(3));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(f.peer.events.find(event => event.kind === 'reply' && event.requestId === 'enumerate')).toMatchObject({ ok: false });
  } finally { await f.close(); }
});
it('drops a delayed response after A→B and releases subscriptions on context loss', async () => {
  const f = await fixture(); try {
    let release!: () => void;
    const original = f.service.candidates.bind(f.service);
    vi.spyOn(f.service, 'candidates').mockImplementation(async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return original(...args); });
    const grant = await f.service.authorize(f.root, 'directory');
    f.peer.emit({ ...request('slow'), operation: 'listCandidates', params: { grantId: grant.id } });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    f.peer.panes = [{ paneId: 'p1', generation: 1, threadId: b }]; await f.bridge.refresh(); release();
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(f.peer.events.some(event => event.kind === 'reply' && event.requestId === 'slow')).toBe(false);
    for (const listener of f.peer.handlers.get('Runtime.executionContextDestroyed') ?? []) listener({ executionContextId: 7 });
    expect(f.bridge.isClosed).toBe(true); expect(f.service.resources().subscribers).toBe(0); expect(f.peer.handlers.size).toBe(0);
  } finally { await f.close(); }
});
