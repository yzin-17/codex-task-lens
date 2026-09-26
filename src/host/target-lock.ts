import { lstat, mkdir, open, readFile, unlink, rmdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { LensError } from '../contracts/index.js';

/** Cooperative same-user lock. Other CDP tools use neither this directory nor this lock. */
export async function claimTarget(directory: string, identity: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new LensError('permission_denied', '目标锁目录必须是独立真实目录');
  const file = path.join(directory, createHash('sha256').update(identity).digest('hex') + '.lock');
  const value = JSON.stringify({ pid: process.pid, token: randomUUID() });
  const read = async () => { const s = await lstat(file); if (!s.isFile() || s.isSymbolicLink() || s.size > 2048) throw new LensError('already_running', '目标锁不可验证'); return readFile(file, 'utf8'); };
  const create = async () => { const handle = await open(file, 'wx', 0o600); try { await handle.writeFile(value); } finally { await handle.close(); } };
  try { await create(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const recovering = file + '.recovering';
    try { await mkdir(recovering); } catch { throw new LensError('already_running', '另一 Task Lens 正在接管此页面，请稍后重试'); }
    try {
      const before = await read(); let pid: number;
      try { pid = JSON.parse(before).pid; } catch { throw new LensError('already_running', '目标锁损坏，请退出 Task Lens 后检查'); }
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new LensError('already_running', '目标锁身份无效');
      let alive = true; try { process.kill(pid, 0); } catch (failure) { alive = (failure as NodeJS.ErrnoException).code !== 'ESRCH'; }
      if (alive) throw new LensError('already_running', '此 Codex 页面已有 Task Lens 运行，不会替换其他实例');
      if (await read() !== before) throw new LensError('already_running', '目标所有者已变化');
      await unlink(file); await create();
    } finally { await rmdir(recovering).catch(() => undefined); }
  }
  let released = false;
  return { release: async () => { if (released) return; released = true; if (await read().catch(() => '') === value) await unlink(file).catch(() => undefined); } };
}
