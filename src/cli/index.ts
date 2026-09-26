import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LensError } from '../contracts/index.js';
import { startStandalone } from '../host/standalone-runtime.js';
import { startCodex } from '../host/codex-runtime.js';
import { discoverApp, verifyEndpoint, validPort } from '../platform/macos/codex-app.js';
export type CliOptions = { standalone: boolean; doctor: boolean; help: boolean; cdpPort?: number; port?: number; appPath?: string; dataDirectory?: string; sessionRoot?: string; allowSessionRead: boolean; sourceId: string; workspace?: string; launch: boolean; openBrowser: boolean };
export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { standalone: false, doctor: false, help: false, allowSessionRead: false, sourceId: 'codex-default', launch: false, openBrowser: process.platform === 'darwin' };
  const values: Record<string, 'appPath' | 'dataDirectory' | 'sessionRoot' | 'workspace'> = { '--app': 'appPath', '--data-dir': 'dataDirectory', '--session-root': 'sessionRoot', '--workspace': 'workspace' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--') continue;
    if (arg === '--help') { options.help = true; continue; }
    if (arg === '--standalone') { options.standalone = true; continue; }
    if (arg === '--doctor') { options.doctor = true; continue; }
    if (arg === '--no-open') { options.openBrowser = false; continue; }
    if (arg === '--allow-session-read') { options.allowSessionRead = true; continue; }
    if (arg === '--launch-codex') { options.launch = true; continue; }
    if (arg === '--cdp-port' || arg === '--port') { const value = args[++i]; if (!value) throw new LensError('invalid_request', '缺少端口'); options[arg === '--cdp-port' ? 'cdpPort' : 'port'] = validPort(Number(value)); continue; }
    if (arg === '--source-id') { const value = args[++i]; if (!value || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value)) throw new LensError('invalid_request', 'source-id 无效'); options.sourceId = value; continue; }
    const key = values[arg]; if (key) { const value = args[++i]; if (!value || !path.isAbsolute(value) || value.includes('\0')) throw new LensError('invalid_request', `${arg} 需要绝对路径`); options[key] = value; continue; }
    throw new LensError('invalid_request', '不支持的参数；请查看 --help');
  }
  if (options.standalone && (options.cdpPort || options.launch || options.sessionRoot || options.workspace || options.appPath || options.doctor)) throw new LensError('invalid_request', '独立模式与 Codex 参数不能同时使用');
  if (options.sessionRoot && !options.allowSessionRead) throw new LensError('permission_denied', '读取会话须同时指定 --allow-session-read');
  if (options.allowSessionRead && !options.sessionRoot) throw new LensError('invalid_request', '请明确指定 --session-root；不默认读取会话');
  return options;
}
export function wantsCodex(options: CliOptions): boolean { return !options.standalone && !!(options.cdpPort || options.launch || options.appPath || options.workspace || options.sessionRoot); }
export async function doctor(options: CliOptions) {
  const app = await discoverApp(options.appPath);
  const endpoint = await verifyEndpoint(app, options.cdpPort ?? 9341);
  return { platform: process.platform, architecture: process.arch, node: process.version, app: { bundleId: app.bundleId, version: app.version, executableName: path.basename(app.executable), signatureVerified: true }, endpoint: { port: endpoint.port, targets: endpoint.targets.length, loopbackAndOwnerVerified: true }, status: endpoint.targets.length ? 'endpoint_ready' : 'no_renderer', note: '端点检查不等于任务清单真机验收通过；未读取对话正文或登录文件' };
}
export const HELP = `Codex Task Lens\n  pnpm start -- --standalone\n  pnpm start -- --cdp-port 9341 [--app /Applications/Codex.app]\n  pnpm doctor -- --cdp-port 9341 [--app /Applications/Codex.app]\n  --launch-codex      明确调试启动；运行中的 Codex 不被强退\n  --workspace /path  授权读取该目录的 Markdown，作为初始候选范围\n  --session-root /path --allow-session-read  明确授权读取 rollout 路径线索\n  --source-id name   稳定的 Codex profile 标识（默认 codex-default）\n  --data-dir /path   工具状态目录；不修改项目或 Codex 配置\n  --no-open          不打开独立面板（内嵌入口仍可用）\nCtrl+C 停止本工具；不会关闭 Codex 仍开放的 CDP 端口。\n`;
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  if (options.doctor) { console.log(JSON.stringify(await doctor(options), null, 2)); return; }
  const connected = wantsCodex(options) ? await startCodex({ ...options, cdpPort: options.cdpPort ?? 9341 }) : null;
  const runtime = connected ?? await startStandalone(options);
  console.log(`Codex Task Lens 已启动：${runtime.origin}（访问凭证未写入日志）`);
  if (connected) console.log(connected.status().diagnostic);
  const stop = () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); void runtime.close().catch(() => { console.error('关闭工具失败'); process.exitCode = 1; }); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) void main().catch(error => { console.error(error instanceof LensError ? error.message : 'Task Lens 操作失败；运行 pnpm doctor 检查环境'); process.exitCode = 1; });
