import { LensError } from '../../../contracts/index.js';
export type Socket = Pick<WebSocket, 'send' | 'close' | 'addEventListener' | 'removeEventListener' | 'readyState'>;
export type CdpEvent = Record<string, unknown>;
type Waiter = { resolve: (value: CdpEvent) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
/** A session never reconnects itself: the runtime must verify OS ownership again. */
export class CdpSession {
  private pending = new Map<number, Waiter>();
  private listeners = new Map<string, Set<(params: CdpEvent) => void>>();
  private nextId = 1;
  private ended = false;
  private constructor(private readonly socket: Socket, private readonly timeoutMs: number) {
    socket.addEventListener('message', this.message as EventListener);
    socket.addEventListener('close', this.closed);
    socket.addEventListener('error', this.closed);
  }
  static async connect(url: string, revalidate: () => Promise<void>, options: { timeoutMs?: number; socketFactory?: (url: string) => Socket } = {}): Promise<CdpSession> {
    await revalidate();
    const timeoutMs = options.timeoutMs ?? 4000;
    const socket = (options.socketFactory ?? (value => new WebSocket(value)))(url);
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); socket.removeEventListener('open', opened); socket.removeEventListener('error', failed); socket.removeEventListener('close', failed); };
        const opened = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new LensError('error', 'CDP 连接失败')); };
        const timer = setTimeout(failed, timeoutMs);
        socket.addEventListener('open', opened); socket.addEventListener('error', failed); socket.addEventListener('close', failed);
      });
      return new CdpSession(socket, timeoutMs);
    } catch (error) { socket.close(); throw error; }
  }
  get isClosed(): boolean { return this.ended; }
  private message = (event: MessageEvent) => {
    if (typeof event.data !== 'string' || event.data.length > 16 * 1024 * 1024) { this.close(); return; }
    let data: { id?: number; result?: CdpEvent; error?: unknown; method?: string; params?: CdpEvent };
    try { data = JSON.parse(event.data); } catch { this.close(); return; }
    if (!data || typeof data !== 'object') return;
    if (typeof data.id === 'number') {
      const waiter = this.pending.get(data.id); if (!waiter) return;
      clearTimeout(waiter.timer); this.pending.delete(data.id);
      if (data.error) waiter.reject(new LensError('error', 'CDP 方法执行失败')); else waiter.resolve(data.result ?? {});
    } else if (typeof data.method === 'string') {
      for (const listener of this.listeners.get(data.method) ?? []) { try { listener(data.params ?? {}); } catch { /* Subscriber isolation. */ } }
    }
  };
  private closed = () => this.close();
  send(method: string, params: CdpEvent = {}): Promise<CdpEvent> {
    if (this.ended) return Promise.reject(new LensError('error', 'CDP 已断开'));
    if (this.pending.size >= 64) return Promise.reject(new LensError('busy', 'CDP 请求过多'));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new LensError('error', 'CDP 请求超时')); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ id, method, params })); }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new LensError('error', 'CDP 发送失败')); }
    });
  }
  on(method: string, listener: (params: CdpEvent) => void): () => void {
    const set = this.listeners.get(method) ?? new Set(); set.add(listener); this.listeners.set(method, set);
    return () => { set.delete(listener); if (!set.size) this.listeners.delete(method); };
  }
  resources() { return { pending: this.pending.size, listeners: [...this.listeners.values()].reduce((count, set) => count + set.size, 0) }; }
  close(): void {
    if (this.ended) return; this.ended = true;
    this.socket.removeEventListener('message', this.message as EventListener); this.socket.removeEventListener('close', this.closed); this.socket.removeEventListener('error', this.closed);
    for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(new LensError('error', 'CDP 已断开')); }
    this.pending.clear();
    for (const callback of this.listeners.get('disconnected') ?? []) { try { callback({}); } catch { /* Continue cleanup. */ } }
    this.listeners.clear(); this.socket.close();
  }
}
