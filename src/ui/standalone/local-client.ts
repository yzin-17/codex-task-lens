import { LensError, monitorKey, parseMonitor, type MonitorRef, type Operation, type Params, type Results, type ViewState } from '../../contracts/index.js';
import type { LensClient } from '../client.js';
export function takeRuntimeToken(location: Pick<Location, 'hash' | 'pathname' | 'search'>, history: Pick<History, 'replaceState'>): string | null {
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  return token && /^[0-9a-f]{64}$/.test(token) ? token : null;
}
const sleep = (milliseconds: number, signal: AbortSignal) => new Promise<void>(resolve => {
  if (signal.aborted) { resolve(); return; }
  const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
  const timer = setTimeout(finish, milliseconds); signal.addEventListener('abort', finish, { once: true });
});
export class LocalClient implements LensClient {
  constructor(private readonly token: string, readonly monitor: MonitorRef, readonly generation: number, private readonly origin = window.location.origin) {}
  private request<K extends Operation>(operation: K, params: Params[K]) { return { protocolVersion: 1, requestId: crypto.randomUUID(), monitor: this.monitor, generation: this.generation, operation, params }; }
  private headers() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }; }
  private result<T>(value: unknown, requestId: string): T {
    if (!value || typeof value !== 'object') throw new LensError('error', '本地服务返回了无效响应');
    const envelope = value as Record<string, unknown>;
    if (envelope.ok !== true) {
      const error = envelope.error as { code?: string; message?: string } | undefined;
      throw new LensError(error?.code === 'conflict' ? 'conflict' : 'error', typeof error?.message === 'string' ? error.message : '本地请求失败');
    }
    if (envelope.protocolVersion !== 1 || envelope.requestId !== requestId || envelope.generation !== this.generation || monitorKey(parseMonitor(envelope.monitor)) !== monitorKey(this.monitor)) throw new LensError('conflict', '收到不属于当前监控视图的响应');
    return envelope.result as T;
  }
  async call<K extends Operation>(operation: K, params: Params[K], signal?: AbortSignal): Promise<Results[K]> {
    const request = this.request(operation, params);
    const response = await fetch(`${this.origin}/api/rpc`, { method: 'POST', headers: this.headers(), body: JSON.stringify(request), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(operation === 'pickMarkdownFiles' ? 125000 : 15000)]) : AbortSignal.timeout(operation === 'pickMarkdownFiles' ? 125000 : 15000), cache: 'no-store', credentials: 'omit' });
    return this.result<Results[K]>(await response.json(), request.requestId);
  }
  async watch(onView: (view: ViewState) => void, onConnection: (message: string | undefined) => void, signal: AbortSignal): Promise<void> {
    let failures = 0;
    while (!signal.aborted) {
      const stream = new AbortController(); let idle: ReturnType<typeof setTimeout> | undefined; let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => stream.abort(), 45000); };
      try {
        const request = this.request('subscribe', {}); resetIdle();
        const response = await fetch(`${this.origin}/api/events`, { method: 'POST', headers: this.headers(), body: JSON.stringify(request), signal: AbortSignal.any([signal, stream.signal]), cache: 'no-store', credentials: 'omit' });
        if (response.status === 401 || response.status === 403) { if (!signal.aborted) onConnection('访问凭证失效，请从启动器重新打开面板'); return; }
        if (!response.ok || !response.body) throw new Error('Subscription unavailable');
        reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (!signal.aborted) {
          const chunk = await reader.read(); if (chunk.done) throw new Error('Subscription ended');
          resetIdle(); buffer += decoder.decode(chunk.value, { stream: true });
          if (buffer.length > 16 * 1024 * 1024) throw new Error('Subscription frame exceeds limit');
          let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            if (!frame.startsWith('data: ')) continue;
            const view = this.result<ViewState>(JSON.parse(frame.slice(6)), request.requestId);
            if (!signal.aborted) { failures = 0; onConnection(undefined); onView(view); }
          }
        }
      } catch { if (!signal.aborted) onConnection('本地连接已断开，正在重连'); }
      finally { clearTimeout(idle); stream.abort(); await reader?.cancel().catch(() => undefined); }
      if (!signal.aborted) await sleep(Math.min(4000, 250 * 2 ** Math.min(failures++, 4)), signal);
    }
  }
}
