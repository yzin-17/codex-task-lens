import { monitorKey, type MonitorRef, type Operation, type Params, type Results, type ViewState } from '../../contracts/index.js';
import type { EmbeddedConfiguration, EmbeddedEvent, PaneIdentity } from '../../contracts/embedded.js';
import type { LensClient } from '../client.js';
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; cleanup: () => void };
export class EmbeddedClient implements LensClient {
  private pending = new Map<string, Pending>();
  private watchers = new Set<{ view: (view: ViewState) => void; connection: (message: string | undefined) => void }>();
  private ended = false;
  private online = true;
  readonly monitor: MonitorRef;
  constructor(private config: EmbeddedConfiguration, readonly identity: PaneIdentity, private send: (payload: string) => void) {
    this.monitor = { kind: 'thread', sourceId: config.sourceId, threadId: identity.threadId! };
  }
  call<K extends Operation>(operation: K, params: Params[K], signal?: AbortSignal): Promise<Results[K]> {
    if (this.ended || !this.online || signal?.aborted) return Promise.reject(new Error('对话已切换或连接已断开'));
    if (this.pending.size >= 16) return Promise.reject(new Error('请求过多，请稍后重试'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const abort = () => { const pending = this.pending.get(requestId); if (pending) { pending.cleanup(); pending.reject(new Error('请求已取消')); } };
      const timer = setTimeout(() => { const pending = this.pending.get(requestId); if (pending) { pending.cleanup(); pending.reject(new Error('任务服务响应超时')); } }, 10000);
      const cleanup = () => { clearTimeout(timer); this.pending.delete(requestId); signal?.removeEventListener('abort', abort); };
      this.pending.set(requestId, { resolve: value => resolve(value as Results[K]), reject, cleanup }); signal?.addEventListener('abort', abort, { once: true });
      try { this.send(JSON.stringify({ nonce: this.config.nonce, paneId: this.identity.paneId, request: { protocolVersion: 1, requestId, monitor: this.monitor, generation: this.identity.generation, operation, params } })); }
      catch { cleanup(); reject(new Error('任务服务连接不可用')); }
    });
  }
  watch(onView: (view: ViewState) => void, onConnection: (message: string | undefined) => void, signal: AbortSignal): Promise<void> {
    if (signal.aborted || this.ended) return Promise.resolve();
    return new Promise(resolve => {
      const watcher = { view: onView, connection: onConnection }; this.watchers.add(watcher);
      const stop = () => { this.watchers.delete(watcher); signal.removeEventListener('abort', stop); resolve(); }; signal.addEventListener('abort', stop, { once: true });
      void this.call('getSnapshot', {}, signal).then(view => { if (!signal.aborted) onView({ ...view, connection: 'connected' }); }).catch(error => { if (!signal.aborted) onConnection(error instanceof Error ? error.message : '连接失败'); });
    });
  }
  accept(event: EmbeddedEvent): void {
    if (this.ended || event.paneId !== this.identity.paneId || event.generation !== this.identity.generation) return;
    if (event.kind === 'reply') { const pending = this.pending.get(event.requestId); if (pending) { pending.cleanup(); if (event.ok) pending.resolve(event.result); else pending.reject(new Error(event.error ?? '请求失败')); } }
    else if (monitorKey(event.view.monitor) === monitorKey(this.monitor) && event.view.generation === this.identity.generation) for (const watcher of this.watchers) watcher.view(event.view);
  }
  setOnline(online: boolean): void { if (online === this.online) return; this.online = online; for (const watcher of this.watchers) watcher.connection(online ? undefined : 'CDP 已断开，请检查本地进程'); }
  close(): void {
    if (this.ended) return; this.ended = true;
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(new Error('对话已切换')); } this.pending.clear(); this.watchers.clear();
  }
}
