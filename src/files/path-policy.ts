import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { LensError, MAX_DOCUMENT_BYTES, type Grant } from '../contracts/index.js';
export function fileError(error: unknown): LensError {
  if (error instanceof LensError) return error;
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return new LensError('missing', '源文件不存在');
  if (code === 'EACCES' || code === 'EPERM' || code === 'ELOOP') return new LensError('permission_denied', '无法访问授权文件');
  return new LensError('error', '本地文件操作失败');
}
export function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}
const markdown = (value: string) => /\.(?:md|markdown)$/i.test(value);
export async function createGrant(input: string, kind: Grant['kind']): Promise<Grant> {
  if (!path.isAbsolute(input) || input.includes('\0')) throw new LensError('invalid_request', '请输入本地绝对路径');
  try {
    const resolved = await realpath(input), metadata = await stat(resolved);
    if (kind === 'directory' ? !metadata.isDirectory() : !metadata.isFile()) throw new LensError('unsupported', '路径类型不匹配');
    if (kind === 'file' && (!markdown(input) || !markdown(resolved))) throw new LensError('unsupported', '只支持本地 Markdown 文档');
    return { id: randomUUID(), kind, realPath: resolved, displayPath: path.normalize(input) };
  } catch (error) { throw fileError(error); }
}
export async function authorizedPath(grant: Grant, input: string, directory = false): Promise<string> {
  try {
    const candidate = path.isAbsolute(input) ? path.normalize(input) : path.resolve(grant.realPath, input);
    const lexicalAllowed = grant.kind === 'file' ? candidate === grant.realPath || candidate === grant.displayPath : within(grant.realPath, candidate) || within(grant.displayPath, candidate);
    if (!lexicalAllowed) throw new LensError('permission_denied', '路径不在授权范围内');
    if (await realpath(grant.displayPath) !== grant.realPath) throw new LensError('permission_denied', '授权路径的实际目标已变化，请重新授权');
    const resolved = await realpath(candidate);
    if (grant.kind === 'file' ? resolved !== grant.realPath : !within(grant.realPath, resolved)) throw new LensError('permission_denied', '符号链接超出授权范围');
    const metadata = await stat(resolved);
    if (directory ? !metadata.isDirectory() : !metadata.isFile()) throw new LensError('unsupported', '源不是所需类型');
    if (!directory && !markdown(resolved)) throw new LensError('unsupported', '只支持 Markdown 文档');
    return resolved;
  } catch (error) { throw fileError(error); }
}
export async function documentVersion(grant: Grant, input: string): Promise<string> {
  const resolved = await authorizedPath(grant, input);
  try { const s = await stat(resolved); return `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`; }
  catch (error) { throw fileError(error); }
}
export async function readAuthorized(grant: Grant, input: string): Promise<{ source: string; version: string; realPath: string }> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const resolved = await authorizedPath(grant, input);
    handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat();
    const rechecked = await authorizedPath(grant, input), current = await stat(rechecked);
    if (resolved !== rechecked || before.dev !== current.dev || before.ino !== current.ino) throw new LensError('unstable', '源文件正在替换');
    if (before.size > MAX_DOCUMENT_BYTES) throw new LensError('unsupported', '文档超过 2 MiB 限制');
    const buffer = Buffer.alloc(MAX_DOCUMENT_BYTES + 1); let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > MAX_DOCUMENT_BYTES) throw new LensError('unsupported', '文档超过 2 MiB 限制');
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new LensError('unstable', '源文件仍在写入');
    let source: string;
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset)); }
    catch { throw new LensError('unsupported', '文档不是有效 UTF-8 文本'); }
    return { source, realPath: resolved, version: `${after.dev}:${after.ino}:${after.size}:${after.mtimeMs}:${after.ctimeMs}` };
  } catch (error) { throw fileError(error); }
  finally { await handle?.close(); }
}
