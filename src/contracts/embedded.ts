import { integer, object, text, parseRequest, LensError, MAX_REQUEST_BYTES, type Request, type ViewState } from './index.js';
export type PaneIdentity = { paneId: string; generation: number; threadId: string | null };
export type EmbeddedConfiguration = { bindingName: string; nonce: string; sourceId: string; styles: string; initialGrantId?: string };
export type EmbeddedReply = { kind: 'reply'; paneId: string; generation: number; requestId: string; ok: boolean; result?: unknown; error?: string };
export type EmbeddedSnapshot = { kind: 'snapshot'; paneId: string; generation: number; view: ViewState };
export type EmbeddedEvent = EmbeddedReply | EmbeddedSnapshot;
export function parsePanes(input: unknown): PaneIdentity[] {
  if (!Array.isArray(input) || input.length > 16) throw new LensError('invalid_request', '对话区域数量无效');
  const ids = new Set<string>();
  return input.map(value => {
    const row = object(value, ['paneId', 'generation', 'threadId']); const paneId = text(row.paneId, 128);
    if (ids.has(paneId)) throw new LensError('invalid_request', '对话区域重复'); ids.add(paneId);
    const threadId = row.threadId === null ? null : text(row.threadId, 36);
    if (threadId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(threadId)) throw new LensError('invalid_request', '对话标识无效');
    return { paneId, generation: integer(row.generation), threadId };
  });
}
export function parseEmbeddedRequest(payload: string): { nonce: string; paneId: string; request: Request } {
  if (new TextEncoder().encode(payload).length > MAX_REQUEST_BYTES) throw new LensError('invalid_request', '内嵌请求超限');
  const row = object(JSON.parse(payload), ['nonce', 'paneId', 'request']);
  return { nonce: text(row.nonce, 128), paneId: text(row.paneId, 128), request: parseRequest(row.request) };
}
