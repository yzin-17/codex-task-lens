import { randomBytes } from 'node:crypto';
import { LensError, monitorKey, type MonitorRef, type Request } from '../../contracts/index.js';
import { parsePanes, parseEmbeddedRequest, type EmbeddedConfiguration, type EmbeddedEvent, type PaneIdentity } from '../../contracts/embedded.js';
import { RequestLedger } from '../../contracts/request-ledger.js';
import type { CdpEvent } from '../../adapters/codex/cdp/session.js';
import type { LensService } from '../lens-service.js';
import { openSourceFile } from '../../platform/macos/open-source.js';
export type CdpPeer = { isClosed: boolean; send(method: string, params?: CdpEvent): Promise<CdpEvent>; on(method: string, listener: (params: CdpEvent) => void): () => void };
type Pane = { identity: PaneIdentity; ref: MonitorRef; stop: () => void };
type Options = { sourceId: string; bundle: string; styles: string; initialGrantId?: string; refreshMs?: number; openFile?: (file: string) => Promise<boolean> };
export class CdpBridge {
  private contextId = 0;
  private frameId = '';
  private nonce = randomBytes(32).toString('hex');
  private bindingName = '__taskLens_' + randomBytes(12).toString('hex');
  private panes = new Map<string, Pane>();
  private stops: (() => void)[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private ledger = new RequestLedger(64);
  private refreshing: Promise<void> | null = null;
  private stopped = false;
  private inflight = 0;
  private constructor(private peer: CdpPeer, private service: LensService, private options: Options) {}
  static async attach(peer: CdpPeer, service: LensService, options: Options): Promise<CdpBridge> {
    const bridge = new CdpBridge(peer, service, options);
    try { await bridge.initialize(); return bridge; } catch (error) { await bridge.close(); throw error; }
  }
  private async call(functionDeclaration: string, args: unknown[] = []): Promise<unknown> {
    const result = await this.peer.send('Runtime.callFunctionOn', { executionContextId: this.contextId, functionDeclaration, arguments: args.map(value => ({ value })), returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new LensError('error', '内嵌运行时执行失败');
    return (result.result as { value?: unknown } | undefined)?.value;
  }
  private async initialize(): Promise<void> {
    await this.peer.send('Page.enable'); await this.peer.send('Runtime.enable');
    const tree = await this.peer.send('Page.getFrameTree'); const frame = (tree.frameTree as { frame?: { id?: string } } | undefined)?.frame;
    if (!frame?.id) throw new LensError('unsupported', '无法确定顶层 renderer'); this.frameId = frame.id;
    // Reuse one tool-owned world so a crashed predecessor can be disposed before replacing its module.
    const world = await this.peer.send('Page.createIsolatedWorld', { frameId: this.frameId, worldName: 'CodexTaskLens' });
    if (!Number.isSafeInteger(world.executionContextId)) throw new LensError('unsupported', '无法建立隔离的执行上下文');
    this.contextId = world.executionContextId as number;
    await this.call('function(){ return globalThis.CodexTaskLensBuild?.dispose(); }');
    this.stops.push(this.peer.on('Runtime.bindingCalled', event => { void this.receive(event).catch(() => undefined); }));
    this.stops.push(this.peer.on('Runtime.executionContextDestroyed', event => { if (event.executionContextId === this.contextId) void this.close(false); }));
    this.stops.push(this.peer.on('Runtime.executionContextsCleared', () => { void this.close(false); }));
    this.stops.push(this.peer.on('Page.frameNavigated', event => { const next = event.frame as { id?: string } | undefined; if (next?.id === this.frameId) void this.close(false); }));
    this.stops.push(this.peer.on('disconnected', () => { void this.close(false); }));
    await this.peer.send('Runtime.addBinding', { name: this.bindingName, executionContextId: this.contextId });
    const loaded = await this.peer.send('Runtime.evaluate', { expression: this.options.bundle, contextId: this.contextId, returnByValue: true });
    if (loaded.exceptionDetails) throw new LensError('error', '内嵌构建产物无法加载');
    const config: EmbeddedConfiguration = { bindingName: this.bindingName, nonce: this.nonce, sourceId: this.options.sourceId, styles: this.options.styles, ...(this.options.initialGrantId ? { initialGrantId: this.options.initialGrantId } : {}) };
    await this.call('function(config){ return globalThis.CodexTaskLensBuild.install(config); }', [config]);
    await this.refresh();
    if (!this.stopped) this.timer = setInterval(() => { void this.refresh().catch(() => this.close()); }, this.options.refreshMs ?? 500);
  }
  get isClosed(): boolean { return this.stopped; }
  refresh(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const selections = parsePanes(await this.call('function(){ return globalThis.CodexTaskLensBuild.inspect(); }'));
      if (this.stopped) return;
      const wanted = new Set(selections.map(selection => selection.paneId));
      for (const [id, pane] of this.panes) if (!wanted.has(id)) { pane.stop(); this.panes.delete(id); }
      for (const identity of selections) {
        const old = this.panes.get(identity.paneId);
        if (old && old.identity.generation === identity.generation && old.identity.threadId === identity.threadId) continue;
        old?.stop(); this.panes.delete(identity.paneId); if (!identity.threadId) continue;
        const ref: MonitorRef = { kind: 'thread', sourceId: this.options.sourceId, threadId: identity.threadId };
        const pane: Pane = { identity, ref, stop: () => undefined }; this.panes.set(identity.paneId, pane);
        pane.stop = this.service.subscribe(ref, identity.generation, view => {
          if (this.panes.get(identity.paneId) === pane) void this.push({ kind: 'snapshot', paneId: identity.paneId, generation: identity.generation, view: { ...view, connection: 'connected' } }).catch(() => undefined);
        });
      }
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  private push(event: EmbeddedEvent): Promise<unknown> {
    if (this.stopped) return Promise.resolve();
    return this.call('function(event){ return globalThis.CodexTaskLensBuild.receive(event); }', [event]);
  }
  private dispatch(request: Request): Promise<unknown> {
    const { monitor, generation } = request;
    switch (request.operation) {
      case 'authorize': return this.service.authorize(request.params.path, request.params.kind);
      case 'listCandidates': return this.service.candidates(monitor, request.params.grantId, request.params.patterns);
      case 'previewDocument': return this.service.preview(monitor, generation, request.params.grantId, request.params.path, request.params.scope);
      case 'confirmBinding': return this.service.confirm(monitor, generation, request.params.previewId, request.params.expectedBindingVersion);
      case 'clearBinding': return this.service.clear(monitor, generation, request.params.expectedBindingVersion);
      case 'getSnapshot': return this.service.snapshot(monitor, generation);
      case 'openSource': return this.service.openSource(monitor, request.params.expectedBindingVersion, request.params.line, this.options.openFile ?? openSourceFile);
      default: return Promise.reject(new LensError('permission_denied', '内嵌界面不能枚举其他会话或自建订阅'));
    }
  }
  private async receive(event: CdpEvent): Promise<void> {
    if (this.stopped || event.name !== this.bindingName || event.executionContextId !== this.contextId || typeof event.payload !== 'string' || this.inflight >= 16) return;
    let packet: ReturnType<typeof parseEmbeddedRequest>; try { packet = parseEmbeddedRequest(event.payload); } catch { return; }
    if (packet.nonce !== this.nonce) return;
    this.inflight++;
    try {
      await this.refresh();
      const { request, paneId } = packet, pane = this.panes.get(paneId);
      if (!pane || pane.identity.generation !== request.generation || monitorKey(pane.ref) !== monitorKey(request.monitor)) return;
      let result: unknown, error: string | undefined;
      try { result = await this.ledger.execute(`${paneId}:${request.generation}:${request.requestId}`, JSON.stringify(request), () => this.dispatch(request)); }
      catch (failure) { error = failure instanceof LensError ? failure.message : '内嵌请求执行失败'; }
      await this.refresh();
      if (this.stopped || this.panes.get(paneId) !== pane) return;
      await this.push({ kind: 'reply', paneId, generation: request.generation, requestId: request.requestId, ok: !error, ...(error ? { error } : { result }) });
    } finally { this.inflight--; }
  }
  resources() { return { panes: this.panes.size, listeners: this.stops.length, inflight: this.inflight, timer: !!this.timer }; }
  async close(cleanRenderer = true): Promise<void> {
    if (this.stopped) return; this.stopped = true; clearInterval(this.timer); this.timer = undefined;
    for (const stop of this.stops.splice(0)) stop(); for (const pane of this.panes.values()) pane.stop(); this.panes.clear(); this.ledger.clear();
    if (cleanRenderer && !this.peer.isClosed && this.contextId) {
      await this.call('function(){ return globalThis.CodexTaskLensBuild?.dispose(); }').catch(() => undefined);
      await this.peer.send('Runtime.removeBinding', { name: this.bindingName }).catch(() => undefined);
    }
  }
}
