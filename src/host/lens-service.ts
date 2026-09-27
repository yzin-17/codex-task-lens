import { randomUUID } from 'node:crypto';
import { LensError, MAX_DOCUMENTS, bindingsOf, monitorKey, type Binding, type BoundDocument, type CandidateResult, type DocumentSnapshot, type Grant, type MonitorRef, type Preview, type SessionHints, type SourceStatus, type TaskScope, type ViewState } from '../contracts/index.js';
import { BindingStore } from '../store/binding-store.js';
import { DocumentStream } from '../files/document-stream.js';
import { authorizedPath, fileError, readAuthorized } from '../files/path-policy.js';
import { parseTasks } from '../core/task-parser.js';
import { discoverCandidates } from '../discovery/candidates.js';
type PreviewRecord = { preview: Omit<Preview, 'tasks'>; monitor: string; generation: number; version: string };
type Observer = { generation: number; callback: (view: ViewState) => void };
type Pool = { stream: DocumentStream; keys: Set<string>; stop: () => void };
type Attachment = { ref: MonitorRef; binding: Binding; pool: Pool; releaseAccess: () => void; lastAllowed?: DocumentSnapshot };
type Options = { now?: () => number; hints?: (ref: MonitorRef) => Promise<SessionHints>; streamOptions?: ConstructorParameters<typeof DocumentStream>[1] };
/** Application service: no Codex, DOM, HTTP or model dependency. */
export class LensService {
  private pools = new Map<string, Pool>();
  private attached = new Map<string, Attachment>();
  private observers = new Map<string, Set<Observer>>();
  private epochs = new Map<string, number>();
  private previews = new Map<string, PreviewRecord>();
  private closed = false;
  constructor(readonly store: BindingStore, private readonly options: Options = {}) {}
  private ensureOpen(): void { if (this.closed) throw new LensError('error', 'Task Lens 已停止'); }
  authorize(input: string, kind: Grant['kind']): Promise<Grant> { this.ensureOpen(); return this.store.authorize(input, kind); }
  listMonitors() { this.ensureOpen(); return this.store.list(); }
  async candidates(ref: MonitorRef, grantId?: string, patterns?: string[], signal?: AbortSignal): Promise<CandidateResult> {
    this.ensureOpen(); let hints: SessionHints | undefined;
    if (this.options.hints) {
      let timer: NodeJS.Timeout | undefined;
      try { hints = await Promise.race([this.options.hints(ref), new Promise<SessionHints>(resolve => { timer = setTimeout(() => resolve({ status: 'unavailable', paths: [], diagnostics: [] }), 750); })]); }
      catch { hints = { status: 'unavailable', paths: [], diagnostics: [] }; } finally { clearTimeout(timer); }
    }
    return discoverCandidates({ ...(grantId ? { grant: this.store.grant(grantId) } : {}), patterns, hints, signal });
  }
  async preview(ref: MonitorRef, generation: number, grantId: string, input: string, scope: TaskScope): Promise<Preview> {
    this.ensureOpen(); const now = this.options.now?.() ?? Date.now();
    for (const [id, entry] of this.previews) if (entry.preview.expiresAt <= now) this.previews.delete(id);
    const read = await readAuthorized(this.store.grant(grantId), input), tasks = parseTasks(read.source, scope);
    const metadata: Omit<Preview, 'tasks'> = { id: randomUUID(), grantId, path: read.realPath, scope: structuredClone(scope), expiresAt: now + 5 * 60 * 1000 };
    if (this.previews.size >= 128) this.previews.delete(this.previews.keys().next().value!);
    this.previews.set(metadata.id, { preview: metadata, monitor: monitorKey(ref), generation, version: read.version });
    return structuredClone({ ...metadata, tasks });
  }
  async confirm(ref: MonitorRef, generation: number, previewId: string, expected: number): Promise<ViewState> {
    return this.confirmMany(ref, generation, [previewId], [], expected);
  }
  async confirmMany(ref: MonitorRef, generation: number, previewIds: string[], keepIds: string[], expected: number): Promise<ViewState> {
    this.ensureOpen();
    if (previewIds.length + keepIds.length > MAX_DOCUMENTS || new Set(previewIds).size !== previewIds.length) throw new LensError('invalid_request', '文档引用重复或数量超限');
    const entries: PreviewRecord[] = [];
    for (const id of previewIds) {
      const entry = this.previews.get(id), now = this.options.now?.() ?? Date.now();
      if (!entry || entry.preview.expiresAt <= now) throw new LensError('expired', '预览已过期，请重新预览');
      if (entry.monitor !== monitorKey(ref) || entry.generation !== generation) throw new LensError('conflict', '预览不属于当前监控视图');
      const { preview } = entry, read = await readAuthorized(this.store.grant(preview.grantId), preview.path);
      if (read.version !== entry.version) throw new LensError('conflict', '文档在预览后已变化，请重新预览');
      parseTasks(read.source, preview.scope); entries.push(entry);
    }
    await this.store.bindMany(ref, entries.map(({ preview }) => ({ grantId: preview.grantId, path: preview.path, scope: preview.scope })), keepIds, expected);
    for (const id of previewIds) this.previews.delete(id);
    this.synchronize(ref); void this.notify(ref); return this.snapshot(ref, generation);
  }
  async clear(ref: MonitorRef, generation: number, expected: number): Promise<ViewState> {
    this.ensureOpen(); await this.store.clear(ref, expected); this.synchronize(ref); void this.notify(ref); return this.snapshot(ref, generation);
  }
  private detach(key: string): void {
    const old = this.attached.get(key); if (!old) return;
    this.attached.delete(key); old.releaseAccess(); old.pool.keys.delete(key);
    if (!old.pool.keys.size) { this.pools.delete(old.binding.documentRealPath); old.pool.stop(); void old.pool.stream.close(); }
  }
  private synchronize(ref: MonitorRef): void {
    const owner = monitorKey(ref), bindings = bindingsOf(this.store.get(ref));
    const keyOf = (binding: Binding) => JSON.stringify([owner, binding.id]);
    const wanted = new Set(bindings.map(keyOf));
    for (const [key, item] of this.attached) if (monitorKey(item.ref) === owner && !wanted.has(key)) this.detach(key);
    for (const binding of bindings) {
      const key = keyOf(binding), current = this.attached.get(key);
      if (current) { current.binding = binding; continue; }
      let pool = this.pools.get(binding.documentRealPath); const fresh = !pool;
      if (!pool) { pool = { stream: new DocumentStream(binding.documentRealPath, this.options.streamOptions), keys: new Set(), stop: () => undefined }; this.pools.set(binding.documentRealPath, pool); }
      const releaseAccess = pool.stream.addAccess(this.store.grant(binding.grantId)); pool.keys.add(key);
      this.attached.set(key, { ref: structuredClone(ref), binding, pool, releaseAccess });
      if (fresh) {
        const owned = pool;
        pool.stop = pool.stream.subscribe(() => {
          const monitors = new Map<string, MonitorRef>();
          for (const id of owned.keys) { const item = this.attached.get(id); if (item) monitors.set(monitorKey(item.ref), item.ref); }
          for (const monitor of monitors.values()) void this.notify(monitor);
        });
      }
    }
  }
  private async documentSnapshot(item: Attachment, ref: MonitorRef, version: number): Promise<BoundDocument> {
    const binding = item.binding; let document: DocumentSnapshot;
    try {
      await authorizedPath(this.store.grant(binding.grantId), binding.documentRealPath);
      document = item.pool.stream.snapshot(binding.scope); item.lastAllowed = document;
    } catch (error) {
      const failure = fileError(error), cached = item.lastAllowed;
      const status: SourceStatus = failure.code === 'missing' ? 'missing' : failure.code === 'unsupported' ? 'unsupported' : 'permission_denied';
      document = { revision: cached?.revision ?? '', status, cached: !!cached?.tasks, tasks: cached?.tasks ?? null, lastReadAt: cached?.lastReadAt ?? null, lastTaskChangeAt: cached?.lastTaskChangeAt ?? null, diagnostics: [failure.message] };
    }
    return { binding, snapshot: { ...document, monitor: ref, bindingVersion: version } };
  }
  async snapshot(ref: MonitorRef, generation = 0, attempt = 0): Promise<ViewState> {
    this.ensureOpen(); this.synchronize(ref); const row = this.store.get(ref), owner = monitorKey(ref);
    const documents = await Promise.all(bindingsOf(row).map(binding => this.documentSnapshot(this.attached.get(JSON.stringify([owner, binding.id]))!, ref, row.bindingVersion)));
    if (this.store.get(ref).bindingVersion !== row.bindingVersion) { if (attempt >= 3) throw new LensError('busy', '绑定正在频繁变化'); return this.snapshot(ref, generation, attempt + 1); }
    // Leave room for the legacy first-document alias and transport envelopes (<16 MiB).
    let bytes = 0;
    for (const doc of documents) {
      const size = Buffer.byteLength(JSON.stringify(doc));
      if (bytes + size > 6 * 1024 * 1024) doc.snapshot = { ...doc.snapshot!, tasks: null, cached: false, status: 'unsupported', diagnostics: ['整组任务数据超限；此文档未计入，请减少绑定或缩小章节范围'] };
      else bytes += size;
    }
    return structuredClone({ ...row, documents, generation, snapshot: documents[0]?.snapshot ?? null, connection: 'standalone' });
  }
  subscribe(ref: MonitorRef, generation: number, callback: (view: ViewState) => void): () => void {
    this.ensureOpen(); const key = monitorKey(ref), observer = { generation, callback }, set = this.observers.get(key) ?? new Set<Observer>();
    set.add(observer); this.observers.set(key, set); this.synchronize(ref); void this.notify(ref);
    return () => { set.delete(observer); if (!set.size) this.observers.delete(key); };
  }
  private async notify(ref: MonitorRef): Promise<void> {
    const key = monitorKey(ref), epoch = (this.epochs.get(key) ?? 0) + 1; this.epochs.set(key, epoch);
    try {
      const view = await this.snapshot(ref); if (this.closed || this.epochs.get(key) !== epoch || view.bindingVersion !== this.store.get(ref).bindingVersion) return;
      for (const observer of this.observers.get(key) ?? []) { try { observer.callback({ ...structuredClone(view), generation: observer.generation }); } catch { /* Subscriber isolation. */ } }
    } catch { /* A closed service has no live view to update. */ }
  }
  async openSource(ref: MonitorRef, expected: number, line: number, opener: (file: string) => Promise<boolean>, bindingId?: string): Promise<{ opened: boolean; path: string; line: number }> {
    this.ensureOpen(); const row = this.store.get(ref);
    if (row.bindingVersion !== expected || !row.binding) throw new LensError('conflict', '源绑定已变化');
    const binding = bindingId ? bindingsOf(row).find(item => item.id === bindingId) : row.binding;
    if (!binding) throw new LensError('conflict', '文档不属于当前绑定');
    const read = await readAuthorized(this.store.grant(binding.grantId), binding.documentRealPath);
    if (!Number.isSafeInteger(line) || line < 1 || line > read.source.split('\n').length) throw new LensError('invalid_request', '源行号无效');
    if (this.store.get(ref).bindingVersion !== expected) throw new LensError('conflict', '源绑定已变化');
    return { opened: await opener(read.realPath), path: read.realPath, line };
  }
  resources() { return { documents: this.pools.size, monitors: new Set([...this.attached.values()].map(item => monitorKey(item.ref))).size, subscribers: [...this.observers.values()].reduce((n, set) => n + set.size, 0), watchers: [...this.pools.values()].reduce((n, pool) => n + pool.stream.resources().watchers, 0) }; }
  async close(): Promise<void> { if (this.closed) return; this.closed = true; this.previews.clear(); this.observers.clear(); await Promise.all([...this.pools.values()].map(pool => pool.stream.close())); this.pools.clear(); this.attached.clear(); this.epochs.clear(); }
}
