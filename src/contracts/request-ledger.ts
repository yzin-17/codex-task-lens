import { LensError } from './index.js';
/** Per-transport, in-memory idempotency. Same id with different content is rejected. */
export class RequestLedger {
  private entries = new Map<string, { fingerprint: string; result: Promise<unknown>; settled: boolean }>();
  constructor(private readonly capacity = 1024) {}
  execute<T>(id: string, fingerprint: string, run: () => Promise<T>): Promise<T> {
    const previous = this.entries.get(id);
    if (previous) {
      if (previous.fingerprint !== fingerprint) return Promise.reject(new LensError('conflict', 'requestId 已用于不同请求'));
      return previous.result as Promise<T>;
    }
    if (this.entries.size >= this.capacity) {
      const removable = [...this.entries].find(([, entry]) => entry.settled);
      if (!removable) return Promise.reject(new LensError('busy', '请求过多，请稍后重试'));
      this.entries.delete(removable[0]);
    }
    const entry = { fingerprint, result: Promise.resolve().then(run) as Promise<unknown>, settled: false };
    this.entries.set(id, entry);
    void entry.result.then(() => { entry.settled = true; }, () => { entry.settled = true; });
    return entry.result as Promise<T>;
  }
  clear(): void { this.entries.clear(); }
}
