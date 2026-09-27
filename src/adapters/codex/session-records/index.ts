import { open, opendir, realpath, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { LensError, type MonitorRef, type SessionHints } from '../../../contracts/index.js';
const MAX_LINE = 1024 * 1024, MAX_READ = 4 * 1024 * 1024;
const inside = (root: string, file: string) => { const relative = path.relative(root, file); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
type State = { file: string; ino: number; offset: number; mtime: number; anchor: Buffer; pending: Buffer; dropping: boolean; matched: boolean; rejected: boolean; cwd?: string; paths: SessionHints['paths']; skipped: number };
function fresh(file: string): State { return { file, ino: 0, offset: 0, mtime: 0, anchor: Buffer.alloc(0), pending: Buffer.alloc(0), dropping: false, matched: false, rejected: false, paths: [], skipped: 0 }; }
function literalPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096 || /[\0\n\r$`*?]/.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  const file = value.replace(/#L?\d+(?:-L?\d+)?$/, '');
  return /\.md$/i.test(file) && !file.startsWith('~') ? file : null;
}
function quotedFields(input: string, key: string): string[] {
  const values: string[] = [], pattern = new RegExp('\\b' + key + '\\s*:\\s*("(?:\\\\.|[^"\\\\])*")', 'g');
  for (const match of input.matchAll(pattern)) {
    try { const value = JSON.parse(match[1]!); if (typeof value === 'string') values.push(value); } catch { /* malformed wrapper: ignore */ }
  }
  return values;
}
function commandMarkdownPaths(command: string): string[] {
  if (command.length > 65536 || command.includes('\0')) return [];
  const paths: string[] = [];
  for (const token of command.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g) ?? []) {
    let value = token;
    if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch { continue; }
    } else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    value = value.replace(/^[(),]+|[(),]+$/g, '');
    if (literalPath(value)) paths.push(value);
  }
  return paths;
}
export function extractPaths(event: unknown, state: { cwd?: string }): SessionHints['paths'] {
  const row = record(event), payload = record(row.payload), result: SessionHints['paths'] = [];
  const add = (value: unknown, source: string, cwd = state.cwd) => {
    const file = literalPath(value); if (!file || (!path.isAbsolute(file) && !cwd)) return;
    result.push({ path: file, ...(cwd ? { baseDirectory: cwd } : {}), source });
  };
  const fromText = (value: unknown) => {
    if (typeof value !== 'string') return;
    // Explicit Markdown destinations or code-delimited literal paths only. No prose guessing.
    for (const match of value.matchAll(/\]\(([^)\n]+\.md(?:#L?\d+(?:-L?\d+)?)?)\)|`([^`\n]+\.md)`/g)) add(match[1] ?? match[2], '会话明确引用');
  };
  if (row.type === 'event_msg' && ['user_message', 'agent_message'].includes(String(payload.type))) fromText(payload.message);
  if (row.type === 'response_item' && payload.type === 'message' && Array.isArray(payload.content)) for (const part of payload.content) fromText(record(part).text);
  if (row.type === 'response_item' && payload.type === 'custom_tool_call' && /(?:^|\.)apply_patch$/.test(String(payload.name)) && typeof payload.input === 'string') {
    for (const match of payload.input.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+\.md)\r?$/gm)) add(match[1], '会话文件操作');
  }
  if (row.type === 'response_item' && payload.type === 'custom_tool_call' && payload.name === 'exec' && typeof payload.input === 'string') {
    for (const command of quotedFields(payload.input, 'cmd')) for (const file of commandMarkdownPaths(command)) add(file, '会话工具命令');
    for (const match of payload.input.matchAll(/\*\*\* (?:Add|Update|Delete) File: ([^\\\r\n]+\.md)/g)) add(match[1], '会话文件操作');
  }
  if (row.type === 'response_item' && payload.type === 'function_call' && /^(?:functions\.)?(?:exec_command|shell_command)$/.test(String(payload.name))) {
    let args: Record<string, unknown>; try { args = record(JSON.parse(String(payload.arguments))); } catch { return result; }
    const cmd = args.cmd ?? args.command, cwd = typeof args.workdir === 'string' && path.isAbsolute(args.workdir) ? args.workdir : state.cwd;
    // Deliberately small grammar. cd, pipes, substitutions and variables are not interpreted.
    if (typeof cmd === 'string' && !/[\n\r;$`|&<>]/.test(cmd)) {
      const match = cmd.match(/^\s*(?:cat|head|tail)\s+(?:--\s+)?(?:"([^"\n]+\.md)"|'([^'\n]+\.md)'|([^\s]+\.md))\s*$/);
      if (match) add(match[1] ?? match[2] ?? match[3], '会话读取操作', cwd);
    }
  }
  return result;
}
/** Only sessions/ and archived_sessions/ are indexed; never auth.json or login storage. */
export class SessionRecords {
  readonly sourceId: string;
  private files: string[] = [];
  private indexedAt = 0;
  private partial = false;
  private states = new Map<string, State>();
  private reads = new Map<string, Promise<SessionHints>>();
  private closed = false;
  private indexing: Promise<void> | null = null;
  private constructor(readonly root: string) { this.sourceId = 'codex-' + createHash('sha256').update(root).digest('hex').slice(0, 24); }
  static async open(root: string, consent: boolean): Promise<SessionRecords> {
    if (!consent || !path.isAbsolute(root)) throw new LensError('permission_denied', '会话记录读取需要明确授权数据源绝对路径');
    return new SessionRecords(await realpath(root));
  }
  private async index(): Promise<void> {
    if (this.indexing) return this.indexing;
    if (Date.now() - this.indexedAt < 30000) return;
    this.indexing = (async () => {
      const files: string[] = []; let visited = 0; this.partial = false;
      const walk = async (directory: string, depth: number) => {
        if (this.closed || depth > 8 || visited >= 10000) { this.partial = true; return; }
        let resolved: string; try { resolved = await realpath(directory); } catch { return; }
        if (!inside(this.root, resolved)) return;
        const entries = await opendir(directory).catch(() => null); if (!entries) return;
        for await (const entry of entries) {
          if (this.closed || ++visited > 10000) { this.partial = true; break; }
          if (entry.isSymbolicLink()) continue;
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) await walk(file, depth + 1);
          else if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) files.push(file);
        }
      };
      await walk(path.join(this.root, 'sessions'), 0); await walk(path.join(this.root, 'archived_sessions'), 0);
      this.files = files; this.indexedAt = Date.now();
    })();
    try { await this.indexing; } finally { this.indexing = null; }
  }
  hints(ref: MonitorRef): Promise<SessionHints> {
    if (this.closed || ref.kind !== 'thread' || ref.sourceId !== this.sourceId) return Promise.resolve({ status: 'unavailable', paths: [], diagnostics: ['未授权或不匹配的会话数据源'] });
    const existing = this.reads.get(ref.threadId); if (existing) return existing;
    const task = this.load(ref.threadId).catch((): SessionHints => ({ status: 'unavailable', paths: [], diagnostics: ['会话记录不可读；可手动选择文档'] })).finally(() => this.reads.delete(ref.threadId));
    this.reads.set(ref.threadId, task); return task;
  }
  private consume(state: State, bytes: Buffer, threadId: string): void {
    let start = 0;
    for (let end = bytes.indexOf(10); end >= 0; end = bytes.indexOf(10, start)) {
      const part = bytes.subarray(start, end); start = end + 1;
      if (state.dropping || state.pending.length + part.length > MAX_LINE) { state.skipped++; state.dropping = false; state.pending = Buffer.alloc(0); continue; }
      const line = Buffer.concat([state.pending, part]); state.pending = Buffer.alloc(0);
      let row: Record<string, unknown>; try { row = record(JSON.parse(line.toString('utf8'))); } catch { state.skipped++; continue; }
      const payload = record(row.payload);
      if (row.type === 'session_meta') {
        if (payload.id !== threadId) { state.rejected = true; state.paths = []; state.cwd = undefined; return; }
        state.matched = true; state.cwd = typeof payload.cwd === 'string' && path.isAbsolute(payload.cwd) ? payload.cwd : undefined; continue;
      }
      if (!state.matched || state.rejected) continue;
      if (row.type === 'turn_context') { state.cwd = typeof payload.cwd === 'string' && path.isAbsolute(payload.cwd) ? payload.cwd : undefined; continue; }
      if (!['response_item', 'event_msg'].includes(String(row.type))) { state.skipped++; continue; }
      for (const hint of extractPaths(row, state)) {
        if (!state.paths.some(old => old.path === hint.path && old.baseDirectory === hint.baseDirectory && old.source === hint.source)) state.paths.push(hint);
        if (state.paths.length > 128) state.paths.shift();
      }
    }
    const rest = bytes.subarray(start);
    if (!state.dropping && state.pending.length + rest.length <= MAX_LINE) state.pending = Buffer.concat([state.pending, rest]);
    else { state.pending = Buffer.alloc(0); state.dropping = true; }
  }
  private async load(threadId: string): Promise<SessionHints> {
    if (!/^[0-9a-f-]{36}$/i.test(threadId)) return { status: 'unsupported', paths: [], diagnostics: ['会话标识格式不受支持'] };
    await this.index();
    const candidates = this.files.filter(file => path.basename(file).includes(threadId));
    if (candidates.length > 8) return { status: 'unsupported', paths: [], diagnostics: ['匹配记录过多，未用截断结果判断唯一会话'] };
    const valid: State[] = []; let hasUnread = false;
    for (const file of candidates) {
      const resolved = await realpath(file).catch(() => '');
      if (!resolved || resolved !== file || !inside(this.root, resolved)) continue;
      const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => null); if (!handle) continue;
      try {
        const stat = await handle.stat(), disk = await lstat(file);
        if (!stat.isFile() || !disk.isFile() || await realpath(file) !== resolved || stat.ino !== disk.ino || stat.dev !== disk.dev) continue;
        let state = this.states.get(file) ?? fresh(file);
        const check = Buffer.alloc(state.anchor.length); if (check.length) await handle.read(check, 0, check.length, state.offset - check.length);
        if (state.ino !== stat.ino || stat.size < state.offset || !check.equals(state.anchor) || (stat.size === state.offset && state.mtime !== stat.mtimeMs)) state = fresh(file);
        state.ino = stat.ino;
        let budget = MAX_READ;
        while (state.offset < stat.size && budget > 0 && !state.rejected && !this.closed) {
          const buffer = Buffer.alloc(Math.min(65536, budget, stat.size - state.offset)); const { bytesRead } = await handle.read(buffer, 0, buffer.length, state.offset);
          if (!bytesRead) break; state.offset += bytesRead; budget -= bytesRead; this.consume(state, buffer.subarray(0, bytesRead), threadId);
        }
        state.anchor = Buffer.alloc(Math.min(64, state.offset)); if (state.anchor.length) await handle.read(state.anchor, 0, state.anchor.length, state.offset - state.anchor.length);
        hasUnread ||= state.offset < stat.size;
        state.mtime = stat.mtimeMs; this.states.set(file, state);
        if (this.states.size > 16) this.states.delete(this.states.keys().next().value!);
        if (state.matched && !state.rejected) valid.push(state);
      } finally { await handle.close(); }
    }
    if (valid.length !== 1) return { status: valid.length ? 'unsupported' : 'unavailable', paths: [], diagnostics: [valid.length ? '匹配到多份会话记录，未猜测活动记录' : '未发现唯一的已支持会话记录；可手动绑定'] };
    const state = valid[0]!;
    return { status: 'ready', ...(state.cwd ? { cwd: state.cwd } : {}), paths: structuredClone(state.paths), diagnostics: [`跳过未知／损坏记录：${state.skipped}`, ...(this.partial ? ['会话索引结果不完整'] : []), ...(hasUnread ? ['会话记录增量读取尚未完成，重新查找可继续读取'] : [])] };
  }
  close(): void { this.closed = true; this.files = []; this.states.clear(); }
}
