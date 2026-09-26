import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BindingStore } from '../store/binding-store.js';
import { LensService } from './lens-service.js';
import { startLocalServer } from './local-server/server.js';
import { CdpBridge } from './cdp-bridge/bridge.js';
import { CdpSession } from '../adapters/codex/cdp/session.js';
import { SessionRecords } from '../adapters/codex/session-records/index.js';
import { discoverApp, verifyEndpoint, launchCodex, type CodexApp } from '../platform/macos/codex-app.js';
import { claimTarget } from './target-lock.js';
import type { SessionHints } from '../contracts/index.js';
export type CodexOptions = { dataDirectory?: string; port?: number; cdpPort: number; appPath?: string; sourceId: string; sessionRoot?: string; allowSessionRead?: boolean; workspace?: string; launch?: boolean; openBrowser?: boolean };
export async function startCodex(options: CodexOptions) {
  const directory = options.dataDirectory ?? path.join(homedir(), 'Library/Application Support/CodexTaskLens');
  const store = await BindingStore.open(directory);
  let records: SessionRecords | undefined, service: LensService | undefined, server: Awaited<ReturnType<typeof startLocalServer>> | undefined;
  let sessionDiagnostic: string | undefined;
  try {
    if (options.sessionRoot && options.allowSessionRead) {
      try { records = await SessionRecords.open(options.sessionRoot, true); }
      catch { sessionDiagnostic = '已授权的会话记录不可用；目录扫描与手动绑定仍可使用。修复数据源后重新启动以恢复会话线索。'; }
    }
    const source = records;
    const unavailableHints: SessionHints = { status: 'unavailable', paths: [], diagnostics: sessionDiagnostic ? [sessionDiagnostic] : [] };
    service = new LensService(store, source ? { hints: ref => source.hints(ref.kind === 'thread' && ref.sourceId === options.sourceId ? { ...ref, sourceId: source.sourceId } : ref) } : sessionDiagnostic ? { hints: async () => unavailableHints } : {});
    server = await startLocalServer(service, { port: options.port, uiDirectory: fileURLToPath(new URL('../../ui/', import.meta.url)) });
    const initialGrantId = options.workspace ? (await service.authorize(options.workspace, 'directory')).id : undefined;
    const bundle = await readFile(new URL('../../inject/task-lens.js', import.meta.url), 'utf8'), styles = await readFile(new URL('../../inject/task-lens.css', import.meta.url), 'utf8');
    let app: CodexApp | undefined, diagnostic = '等待 Codex 连接', closed = false, pid = 0, retry = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined, active: Promise<void> | undefined;
    const targets = new Map<string, { session: CdpSession; bridge: CdpBridge; socket: string; lock: Awaited<ReturnType<typeof claimTarget>> }>();
    const release = async (id: string) => { const entry = targets.get(id); if (!entry) return; targets.delete(id); try { await entry.bridge.close(); entry.session.close(); } finally { await entry.lock.release(); } };
    const closeTargets = async () => { await Promise.all([...targets.keys()].map(release)); };
    const tick = async () => {
      try {
        app ??= await discoverApp(options.appPath);
        const endpoint = await verifyEndpoint(app, options.cdpPort);
        if (pid && pid !== endpoint.pid) await closeTargets(); pid = endpoint.pid;
        const ids = new Set(endpoint.targets.map(target => target.id)), failures: string[] = [];
        for (const id of targets.keys()) if (!ids.has(id)) await release(id);
        for (const target of endpoint.targets.slice(0, 8)) {
          if (closed) break;
          const old = targets.get(target.id);
          if (old && !old.session.isClosed && !old.bridge.isClosed && old.socket === target.webSocketDebuggerUrl) continue;
          await release(target.id);
          let lock: Awaited<ReturnType<typeof claimTarget>> | undefined, session: CdpSession | undefined;
          try {
            lock = await claimTarget(path.join(homedir(), '.codex-task-lens-targets'), `${endpoint.pid}:${options.cdpPort}:${target.id}`);
            session = await CdpSession.connect(target.webSocketDebuggerUrl, async () => {
              const current = await verifyEndpoint(app!, options.cdpPort);
              if (current.pid !== endpoint.pid || !current.targets.some(item => item.id === target.id && item.webSocketDebuggerUrl === target.webSocketDebuggerUrl)) throw new Error('Endpoint changed');
            });
            const bridge = await CdpBridge.attach(session, service!, { sourceId: options.sourceId, bundle, styles, initialGrantId });
            if (closed) { await bridge.close(); session.close(); await lock.release(); break; }
            targets.set(target.id, { session, bridge, socket: target.webSocketDebuggerUrl, lock });
          } catch (error) { session?.close(); await lock?.release(); failures.push(error instanceof Error && error.name === 'LensError' ? error.message : '页面连接失败'); }
        }
        diagnostic = targets.size ? 'CDP 已连接（会话识别以面板状态为准）' : failures[0] ?? '端点可信，但未找到可注入的主页面';
        if (targets.size && failures.length) diagnostic += '；部分页面：' + failures[0];
        retry = 2000;
      } catch (error) {
        diagnostic = error instanceof Error && error.name === 'LensError' ? error.message : 'CDP 连接或注入失败；独立面板仍可使用';
        await closeTargets(); retry = Math.min(retry * 2, 10000);
      } finally { if (!closed) timer = setTimeout(() => { active = tick(); }, retry); }
    };
    if (options.launch) {
      try { app = await discoverApp(options.appPath); await launchCodex(app, options.cdpPort, true); }
      catch (error) { diagnostic = error instanceof Error ? error.message : '未启动 Codex'; }
    }
    active = tick(); await active;
    if (options.openBrowser && process.platform === 'darwin') await promisify(execFile)('/usr/bin/open', [server.url], { timeout: 10000, maxBuffer: 4096 }).catch(() => { diagnostic += '；默认浏览器未打开'; });
    let stopping: Promise<void> | undefined;
    return { origin: server.origin, url: server.url, service, status: () => ({ diagnostic, targets: targets.size, sourceId: options.sourceId, sessionHints: !!source, sessionDiagnostic }), close: () => stopping ??= (async () => {
      closed = true; clearTimeout(timer); await active?.catch(() => undefined); clearTimeout(timer); await closeTargets(); source?.close(); await server!.close(); await service!.close(); await store.close();
    })() };
  } catch (error) { records?.close(); await server?.close(); await service?.close(); await store.close(); throw error; }
}
