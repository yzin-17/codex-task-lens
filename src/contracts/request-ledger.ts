import { LensError } from './index.js';
type Entry = { fingerprint: string; result: Promise<unknown>; settled: boolean; bytes: number };
/** Per-transport replay cache, bounded by entry count and approximate serialized bytes. */
export class RequestLedger {
  private entries = new Map<string, Entry>();
  private bytes = 0;
  constructor(private readonly capacity = 1024, private readonly maxBytes = 8 * 1024 * 1024) {}
  private remove(id: string): void { const entry = this.entries.get(id); if (entry) { this.bytes -= entry.bytes; this.entries.delete(id); } }
  private trim(extraBytes = 0, extraEntries = 0): boolean {
    while (this.entries.size + extraEntries > this.capacity || this.bytes + extraBytes > this.maxBytes) {
      const removable = [...this.entries].find(([, entry]) => entry.settled);
      if (!removable) return false;
      this.remove(removable[0]);
    }
    return true;
  }
  execute<T>(id: string, fingerprint: string, run: () => Promise<T>): Promise<T> {
    const previous = this.entries.get(id);
    if (previous) {
      if (previous.fingerprint !== fingerprint) return Promise.reject(new LensError('conflict', 'requestId 已用于不同请求'));
      return previous.result as Promise<T>;
    }
    const bytes = new TextEncoder().encode(id + fingerprint).byteLength;
    if (!this.trim(bytes, 1)) return Promise.reject(new LensError('busy', '请求缓存已满，请稍后重试'));
    const entry: Entry = { fingerprint, result: Promise.resolve().then(run), settled: false, bytes };
    this.entries.set(id, entry); this.bytes += bytes;
    const settle = (value?: unknown) => {
      entry.settled = true;
      if (this.entries.get(id) !== entry) return;
      let added: number;
      try { added = new TextEncoder().encode(JSON.stringify(value) ?? '').byteLength; } catch { added = this.maxBytes + 1; }
      entry.bytes += added; this.bytes += added; this.trim();
    };
    void entry.result.then(settle, () => settle());
    return entry.result as Promise<T>;
  }
  resources(): { entries: number; retainedBytes: number } { return { entries: this.entries.size, retainedBytes: this.bytes }; }
  clear(): void { this.entries.clear(); this.bytes = 0; }
}
