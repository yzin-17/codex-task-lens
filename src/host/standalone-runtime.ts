import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BindingStore } from '../store/binding-store.js';
import { LensService } from './lens-service.js';
import { startLocalServer } from './local-server/server.js';
export async function startStandalone(options: { dataDirectory?: string; port?: number; uiDirectory?: string; openBrowser?: boolean } = {}) {
  const directory = options.dataDirectory ?? path.join(homedir(), 'Library', 'Application Support', 'CodexTaskLens');
  const store = await BindingStore.open(directory), service = new LensService(store);
  let server: Awaited<ReturnType<typeof startLocalServer>>;
  try { server = await startLocalServer(service, { port: options.port, uiDirectory: options.uiDirectory ?? fileURLToPath(new URL('../../ui/', import.meta.url)) }); }
  catch (error) { await service.close(); await store.close(); throw error; }
  let stopping: Promise<void> | undefined;
  const close = () => stopping ??= (async () => { await server.close(); await service.close(); await store.close(); })();
  if (options.openBrowser && process.platform === 'darwin') {
    try { await promisify(execFile)('/usr/bin/open', [server.url], { timeout: 10000, maxBuffer: 4096 }); }
    catch { await close(); throw new Error('无法打开本地面板；未输出访问凭证。请检查默认浏览器后重新启动。'); }
  }
  return { origin: server.origin, url: server.url, service, close };
}
async function main() {
  let dataDirectory: string | undefined, port = 0, openBrowser = process.platform === 'darwin';
  const args = process.argv.slice(2).filter(argument => argument !== '--');
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--standalone') continue;
    if (arg === '--no-open') { openBrowser = false; continue; }
    if (arg === '--data-dir') { const value = args[++i]; if (!value || !path.isAbsolute(value)) throw new Error('--data-dir 需要绝对路径'); dataDirectory = value; continue; }
    if (arg === '--port') { const value = args[++i]; port = Number(value); if (!value || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--port 需要 1024–65535 的端口'); continue; }
    if (arg === '--help') { console.log('Codex Task Lens 独立模式\n  pnpm start -- --standalone [--data-dir /absolute/path] [--port 9342] [--no-open]\nMac 默认打开浏览器；不启动或修改 Codex。Ctrl+C 停止本工具。\n当前交付不含 CDP 接入、doctor 或 Mac 产品验收入口。'); return; }
    throw new Error('不支持的参数。运行 --help 查看当前已实现的独立模式入口。');
  }
  const runtime = await startStandalone({ dataDirectory, port, openBrowser });
  console.log(`Codex Task Lens 已启动：${runtime.origin}（访问凭证未写入日志）`);
  if (!openBrowser) console.log('未自动打开浏览器；程序化调用 startStandalone 可取得仅存内存的授权入口。');
  const stop = () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); void runtime.close().catch(() => { console.error('关闭本地服务失败'); process.exitCode = 1; }); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) void main().catch(error => { console.error(error instanceof Error ? error.message : 'Task Lens 启动失败'); process.exitCode = 1; });
