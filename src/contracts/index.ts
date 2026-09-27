export const PROTOCOL_VERSION = 1 as const;
export const MAX_REQUEST_BYTES = 32 * 1024;
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const MAX_TASKS = 5000;
export const MAX_DOCUMENTS = 16;
export type MonitorRef = { kind: 'thread'; sourceId: string; threadId: string } | { kind: 'standalone'; id: string };
export const monitorKey = (ref: MonitorRef): string => ref.kind === 'thread' ? JSON.stringify(['thread', ref.sourceId, ref.threadId]) : JSON.stringify(['standalone', ref.id]);
export type HeadingPart = { depth: number; title: string; ordinal: number; total: number };
export type TaskScope = { kind: 'document' } | { kind: 'section'; path: HeadingPart[] };
export const DOCUMENT_SCOPE: TaskScope = { kind: 'document' };
export type Grant = { id: string; kind: 'file' | 'directory'; realPath: string; displayPath: string };
export type Binding = { id: string; monitor: MonitorRef; grantId: string; documentRealPath: string; displayPath: string; workspaceRealPath: string | null; scope: TaskScope; version: number; confirmedAt: number };
export type ExplicitStatus = 'in_progress' | 'validating' | 'blocked';
export type TaskItem = { rowId: string; explicitId?: string; title: string; checked: boolean; line: number; endLine: number; groups: string[]; raw: string; status?: ExplicitStatus; conflict: boolean };
export type SectionOption = { label: string; scope: TaskScope; line: number; endLine: number };
export type ParsedTasks = { title: string; items: TaskItem[]; completed: number; incomplete: number; total: number; sections: SectionOption[]; diagnostics: string[] };
export type SourceStatus = 'loading' | 'ready' | 'missing' | 'permission_denied' | 'unsupported' | 'scope_missing' | 'unstable' | 'error';
export type DocumentSnapshot = { revision: string; status: SourceStatus; cached: boolean; tasks: ParsedTasks | null; lastReadAt: number | null; lastTaskChangeAt: number | null; diagnostics: string[] };
export type TaskSnapshot = DocumentSnapshot & { monitor: MonitorRef; bindingVersion: number };
export type BoundDocument = { binding: Binding; snapshot: TaskSnapshot | null };
export type ViewState = { documents?: BoundDocument[]; monitor: MonitorRef; generation: number; bindingVersion: number; binding: Binding | null; snapshot: TaskSnapshot | null; connection: 'standalone' | 'connected' | 'disconnected' | 'incompatible' | 'unknown_thread' };
export type SessionHints = { status: 'ready' | 'unavailable' | 'unsupported'; cwd?: string; paths: { path: string; baseDirectory?: string; source: string }[]; diagnostics: string[] };
export type Candidate = { id: string; path: string; workspace: string | null; sources: string[]; total?: number; completed?: number; title: string; diagnostics: string[]; requiresAuthorization?: boolean };
export type CandidateResult = { candidates: Candidate[]; incomplete: boolean; checked: number; diagnostics: string[] };
export type Preview = { id: string; grantId: string; path: string; scope: TaskScope; tasks: ParsedTasks; expiresAt: number };
export type MonitorSummary = { bindings?: Binding[]; monitor: MonitorRef; bindingVersion: number; binding: Binding | null };
export interface Params {
  authorize: { path: string; kind: 'file' | 'directory'; consent: true };
  listMonitors: Record<string, never>;
  listCandidates: { grantId?: string; patterns?: string[] };
  previewDocument: { grantId: string; path: string; scope: TaskScope };
  confirmBinding: { previewId: string; expectedBindingVersion: number };
  confirmBindings: { previewIds: string[]; keepBindingIds: string[]; expectedBindingVersion: number };
  pickMarkdownFiles: { consent: true };
  clearBinding: { expectedBindingVersion: number };
  getSnapshot: Record<string, never>;
  openSource: { expectedBindingVersion: number; line: number; bindingId?: string };
  subscribe: Record<string, never>;
}
export interface Results {
  authorize: Grant;
  listMonitors: MonitorSummary[];
  listCandidates: CandidateResult;
  previewDocument: Preview;
  confirmBinding: ViewState;
  confirmBindings: ViewState;
  pickMarkdownFiles: { paths: string[]; cancelled: boolean };
  clearBinding: ViewState;
  getSnapshot: ViewState;
  openSource: { opened: boolean; line: number; path: string };
  subscribe: ViewState;
}
export type Operation = keyof Params;
export type Request<K extends Operation = Operation> = K extends Operation ? { protocolVersion: 1; requestId: string; monitor: MonitorRef; generation: number; operation: K; params: Params[K] } : never;
export type ErrorCode = 'invalid_request' | 'unsupported_protocol' | 'conflict' | 'permission_denied' | 'missing' | 'unsupported' | 'scope_missing' | 'unstable' | 'corrupt_state' | 'already_running' | 'expired' | 'busy' | 'error';
export class LensError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.name = 'LensError'; this.code = code; }
}
export const fail = (message = '请求格式无效'): never => { throw new LensError('invalid_request', message); };
export function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  if (Object.keys(value).some(k => !keys.includes(k))) return fail('请求包含未支持字段');
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 4096): string {
  if (typeof value !== 'string' || !value.length || value.length > max || value.includes('\0')) return fail();
  return value;
}
export function integer(value: unknown, min = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < min) return fail();
  return value as number;
}
export function parseMonitor(value: unknown): MonitorRef {
  const v = object(value, ['kind', 'id', 'sourceId', 'threadId']);
  const id = (x: unknown) => { const s = text(x, 128); if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(s)) return fail(); return s; };
  if (v.kind === 'standalone' && v.sourceId === undefined && v.threadId === undefined) return { kind: 'standalone', id: id(v.id) };
  if (v.kind === 'thread' && v.id === undefined) return { kind: 'thread', sourceId: id(v.sourceId), threadId: id(v.threadId) };
  return fail('监控身份无效');
}
export function parseScope(value: unknown): TaskScope {
  const v = object(value, ['kind', 'path']);
  if (v.kind === 'document' && v.path === undefined) return { kind: 'document' };
  if (v.kind !== 'section' || !Array.isArray(v.path) || v.path.length < 1 || v.path.length > 6) return fail();
  let previous = 0;
  const path = v.path.map(part => {
    const p = object(part, ['depth', 'title', 'ordinal', 'total']);
    const depth = integer(p.depth, 1), ordinal = integer(p.ordinal, 1), total = integer(p.total, 1);
    if (depth > 6 || depth <= previous || ordinal > total) return fail();
    previous = depth;
    return { depth, title: text(p.title, 512), ordinal, total };
  });
  return { kind: 'section', path };
}
export function parseRequest(input: unknown): Request {
  const v = object(input, ['protocolVersion', 'requestId', 'monitor', 'generation', 'operation', 'params']);
  if (v.protocolVersion !== 1) throw new LensError('unsupported_protocol', '不支持的协议版本');
  const base = { protocolVersion: 1 as const, requestId: text(v.requestId, 128), monitor: parseMonitor(v.monitor), generation: integer(v.generation) };
  const operation = text(v.operation, 64);
  switch (operation) {
    case 'authorize': {
      const p = object(v.params, ['path', 'kind', 'consent']);
      if ((p.kind !== 'file' && p.kind !== 'directory') || p.consent !== true) return fail('必须明确确认文件授权');
      return { ...base, operation, params: { path: text(p.path), kind: p.kind, consent: true } };
    }
    case 'listMonitors': case 'getSnapshot': case 'subscribe': object(v.params, []); return { ...base, operation, params: {} };
    case 'listCandidates': {
      const p = object(v.params, ['grantId', 'patterns']);
      if (p.patterns !== undefined && (!Array.isArray(p.patterns) || p.patterns.length > 16)) return fail();
      return { ...base, operation, params: { ...(p.grantId === undefined ? {} : { grantId: text(p.grantId, 128) }), ...(Array.isArray(p.patterns) ? { patterns: p.patterns.map(x => text(x, 256)) } : {}) } };
    }
    case 'previewDocument': { const p = object(v.params, ['grantId', 'path', 'scope']); return { ...base, operation, params: { grantId: text(p.grantId, 128), path: text(p.path), scope: parseScope(p.scope) } }; }
    case 'confirmBinding': { const p = object(v.params, ['previewId', 'expectedBindingVersion']); return { ...base, operation, params: { previewId: text(p.previewId, 128), expectedBindingVersion: integer(p.expectedBindingVersion) } }; }
    case 'pickMarkdownFiles': { const p = object(v.params, ['consent']); if (p.consent !== true) return fail('文件选择需要明确操作'); return { ...base, operation, params: { consent: true } }; }
    case 'confirmBindings': {
      const p = object(v.params, ['previewIds', 'keepBindingIds', 'expectedBindingVersion']);
      const ids = (value: unknown) => { if (!Array.isArray(value) || value.length > MAX_DOCUMENTS) return fail('文档数量超限'); const rows = value.map(id => text(id, 128)); if (new Set(rows).size !== rows.length) return fail('文档引用重复'); return rows; };
      const previewIds = ids(p.previewIds), keepBindingIds = ids(p.keepBindingIds);
      if (previewIds.length + keepBindingIds.length > MAX_DOCUMENTS) return fail('最多绑定 16 份文档');
      return { ...base, operation, params: { previewIds, keepBindingIds, expectedBindingVersion: integer(p.expectedBindingVersion) } };
    }
    case 'clearBinding': { const p = object(v.params, ['expectedBindingVersion']); return { ...base, operation, params: { expectedBindingVersion: integer(p.expectedBindingVersion) } }; }
    case 'openSource': { const p = object(v.params, ['expectedBindingVersion', 'line', 'bindingId']); return { ...base, operation, params: { expectedBindingVersion: integer(p.expectedBindingVersion), line: integer(p.line, 1), ...(p.bindingId === undefined ? {} : { bindingId: text(p.bindingId, 128) }) } }; }
    default: return fail('不支持的操作');
  }
}

export const bindingsOf = (row: Pick<MonitorSummary, "binding" | "bindings">): Binding[] => row.bindings ?? (row.binding ? [row.binding] : []);
export const documentsOf = (view: ViewState | null): BoundDocument[] => view?.documents ?? (view?.binding ? [{ binding: view.binding, snapshot: view.snapshot }] : []);
