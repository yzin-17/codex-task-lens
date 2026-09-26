import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { LensError } from '../../contracts/index.js';

export type Command = (program: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
export const command: Command = async (program, args) => promisify(execFile)(program, args, { timeout: 5000, maxBuffer: 512 * 1024, encoding: 'utf8' });
export type CodexApp = { bundle: string; executable: string; version: string; bundleId: string };
export type CdpTarget = { id: string; type: string; url: string; webSocketDebuggerUrl: string };
export type TrustedEndpoint = { port: number; pid: number; app: CodexApp; targets: CdpTarget[] };
const TEAM = '2DC432GLL2';
const requirement = `=anchor apple generic and certificate leaf[subject.OU] = "${TEAM}"`;
export function validPort(port: number): number {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new LensError('invalid_request', 'CDP 端口须为 1024–65535');
  return port;
}
export async function inspectApp(bundlePath: string, run: Command = command): Promise<CodexApp> {
  if (!path.isAbsolute(bundlePath) || !bundlePath.endsWith('.app')) throw new LensError('invalid_request', '需要实际 .app 的绝对路径');
  const bundle = await realpath(bundlePath), plist = path.join(bundle, 'Contents/Info.plist');
  const read = async (key: string) => (await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist])).stdout.trim();
  const bundleId = await read('CFBundleIdentifier');
  if (bundleId !== 'com.openai.codex') throw new LensError('permission_denied', '应用不是受支持的 Codex bundle');
  const executableName = await read('CFBundleExecutable');
  if (!executableName || executableName.includes('/') || executableName.includes('\\') || executableName === '..') throw new LensError('permission_denied', '应用可执行文件元数据无效');
  const executable = await realpath(path.join(bundle, 'Contents/MacOS', executableName));
  if (path.dirname(executable) !== path.join(bundle, 'Contents/MacOS')) throw new LensError('permission_denied', '可执行文件越出应用目录');
  await access(executable, constants.X_OK);
  for (const file of [bundle, executable]) await run('/usr/bin/codesign', ['--verify', '--strict', '--test-requirement', requirement, file]);
  return { bundle, executable, bundleId, version: await read('CFBundleShortVersionString') };
}
export async function discoverApp(input?: string, run: Command = command): Promise<CodexApp> {
  if (process.platform !== 'darwin' && run === command) throw new LensError('unsupported', 'Codex 接入仅支持 macOS；独立模式不受影响');
  if (input) return inspectApp(input, run);
  const known = ['/Applications/ChatGPT.app', '/Applications/Codex.app', path.join(homedir(), 'Applications/ChatGPT.app'), path.join(homedir(), 'Applications/Codex.app')];
  for (const candidate of known) { try { return await inspectApp(candidate, run); } catch { /* Try the next confirmed bundle. */ } }
  const found = await run('/usr/bin/mdfind', ['kMDItemCFBundleIdentifier == "com.openai.codex"']).catch(() => ({ stdout: '', stderr: '' }));
  for (const candidate of found.stdout.split('\n').filter(Boolean).slice(0, 16)) { try { return await inspectApp(candidate, run); } catch { /* No untrusted fallback. */ } }
  throw new LensError('missing', '未找到通过签名校验的 Codex；请用 --app 指定应用');
}
export function parseListeners(output: string, port: number): number {
  validPort(port); const pids = new Set<number>(); let pid = 0, count = 0;
  for (const line of output.split('\n')) {
    if (line.startsWith('p')) { pid = Number(line.slice(1)); if (!Number.isSafeInteger(pid) || pid <= 0) throw new LensError('permission_denied', '监听进程无效'); }
    if (line.startsWith('n')) {
      const address = line.slice(1);
      if (!pid || ![`127.0.0.1:${port}`, `[::1]:${port}`, `::1:${port}`].includes(address)) throw new LensError('permission_denied', 'CDP 监听地址不受信任（必须仅回环）');
      pids.add(pid); count++;
    }
  }
  if (!count) throw new LensError('missing', '没有 CDP 监听；运行中的 Codex 不会被自动重启');
  if (pids.size !== 1) throw new LensError('permission_denied', 'CDP 端口存在多个监听进程');
  return [...pids][0]!;
}
export function isCodexTarget(value: unknown, port: number): value is CdpTarget {
  if (!value || typeof value !== 'object') return false;
  const target = value as Partial<CdpTarget>;
  try {
    const page = new URL(target.url ?? ''), socket = new URL(target.webSocketDebuggerUrl ?? '');
    return typeof target.id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(target.id) && target.type === 'page'
      && page.protocol === 'app:' && page.pathname === '/index.html' && !page.searchParams.has('initialRoute')
      && !page.username && !page.password && socket.protocol === 'ws:' && ['127.0.0.1', '[::1]', 'localhost'].includes(socket.hostname)
      && Number(socket.port) === port && !socket.username && !socket.password && !socket.hash && !socket.search
      && socket.pathname === `/devtools/page/${target.id}`;
  } catch { return false; }
}
export async function fetchTargetList(port: number): Promise<unknown[]> {
  validPort(port); let response: Response | undefined;
  for (const host of ['127.0.0.1', '[::1]']) {
    try { response = await fetch(`http://${host}:${port}/json/list`, { redirect: 'error', signal: AbortSignal.timeout(2500) }); if (response.ok) break; } catch { /* IPv6-only loopback is allowed. */ }
  }
  if (!response?.ok || !response.body) throw new LensError('missing', '无法读取本机 CDP target');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const item = await reader.read(); if (item.done) break; bytes += item.value.length; if (bytes > 512 * 1024) throw new LensError('unsupported', 'CDP target 列表超限'); chunks.push(item.value); }
  } finally { await reader.cancel().catch(() => undefined); }
  const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!Array.isArray(data) || data.length > 256) throw new LensError('unsupported', 'CDP target 列表无效');
  return data;
}
export async function verifyEndpoint(app: CodexApp, port: number, run: Command = command, list = fetchTargetList): Promise<TrustedEndpoint> {
  validPort(port);
  const listeners = await run('/usr/sbin/lsof', ['-nP', '-a', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpn']).catch(() => ({ stdout: '', stderr: '' }));
  const pid = parseListeners(listeners.stdout, port);
  const executable = (await run('/bin/ps', ['-p', String(pid), '-o', 'comm='])).stdout.trim();
  if (executable !== app.executable) throw new LensError('permission_denied', 'CDP 端口不属于已验证的 Codex 主进程');
  const targets = (await list(port)).filter(value => isCodexTarget(value, port));
  // Recheck ownership after HTTP discovery before returning the capability.
  const again = parseListeners((await run('/usr/sbin/lsof', ['-nP', '-a', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpn'])).stdout, port);
  if (again !== pid) throw new LensError('permission_denied', 'CDP 进程在检查中变化');
  return { port, pid, app, targets };
}
export async function launchCodex(app: CodexApp, port: number, consent: boolean, run: Command = command): Promise<void> {
  validPort(port);
  if (!consent) throw new LensError('permission_denied', '调试启动需要明确确认');
  const processes = (await run('/bin/ps', ['-axo', 'comm='])).stdout.split('\n').map(line => line.trim());
  if (processes.includes(app.executable)) throw new LensError('already_running', 'Codex 已运行；请等待任务结束并正常退出，不会强制重启');
  const listeners = await run('/usr/sbin/lsof', ['-nP', '-a', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpn']).catch(() => ({ stdout: '', stderr: '' }));
  if (listeners.stdout.trim()) throw new LensError('permission_denied', '端口已占用，不接管或终止现有进程');
  await run('/usr/bin/open', ['-na', app.bundle, '--args', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`]);
}
