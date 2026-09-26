import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { LensError } from '../contracts/index.js';
import { CdpSession } from '../adapters/codex/cdp/session.js';
import { command, discoverApp, verifyEndpoint } from '../platform/macos/codex-app.js';
import { parseArgs } from './index.js';
export function redactPanes(input: unknown, salt: string) {
  if (!Array.isArray(input) || input.length > 16) throw new LensError('unsupported', '无法读取受支持的对话区域');
  return input.map(item => {
    if (!item || typeof item !== 'object') throw new LensError('unsupported', '对话区域数据无效');
    const entry = item as Record<string, unknown>;
    const id = typeof entry.threadId === 'string' && /^[0-9a-f-]{36}$/i.test(entry.threadId) ? entry.threadId : null;
    const tag = (value: unknown) => typeof value === 'string' && /^[A-Z]{1,20}$/.test(value) ? value : 'UNKNOWN';
    const allowed = ['data-above-composer-conversation-id', 'data-conversation-id', 'data-thread-id'];
    return { identified: !!id, threadHash: id ? createHash('sha256').update(salt + id).digest('hex').slice(0, 16) : null, anchorTag: tag(entry.anchorTag), editorTag: tag(entry.editorTag), attributes: Array.isArray(entry.attributes) ? entry.attributes.filter(value => allowed.includes(String(value))) : [] };
  });
}
async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--');
  if (!args.includes('--enable')) throw new LensError('permission_denied', '真机探测需要 --enable 明确授权；不会自动启动、重启或发送消息');
  const probeOnly = args.includes('--probe-only');
  const options = parseArgs(args.filter(arg => !['--enable', '--probe-only'].includes(arg)));
  if (options.launch || options.workspace || options.sessionRoot || options.standalone) throw new LensError('invalid_request', '结构探测不启动应用、不授权文件、不读取日志');
  const app = await discoverApp(options.appPath), endpoint = await verifyEndpoint(app, options.cdpPort ?? 9341);
  if (!endpoint.targets.length) throw new LensError('missing', '没有可信的 Codex renderer；请打开一个对话后再试');
  const bundle = await readFile(new URL('../../inject/task-lens.js', import.meta.url), 'utf8');
  const salt = randomBytes(32).toString('hex'), reports = [];
  for (const target of endpoint.targets.slice(0, 8)) {
    const session = await CdpSession.connect(target.webSocketDebuggerUrl, async () => {
      const current = await verifyEndpoint(app, endpoint.port);
      if (current.pid !== endpoint.pid || !current.targets.some(entry => entry.id === target.id && entry.webSocketDebuggerUrl === target.webSocketDebuggerUrl)) throw new LensError('permission_denied', '探测目标已变化');
    });
    try {
      await session.send('Page.enable');
      const tree = await session.send('Page.getFrameTree'), frameId = (tree.frameTree as { frame?: { id?: string } } | undefined)?.frame?.id;
      if (!frameId) throw new LensError('unsupported', '顶层页面不可用');
      const world = await session.send('Page.createIsolatedWorld', { frameId, worldName: 'CodexTaskLensReadOnlyProbe' });
      const contextId = world.executionContextId;
      if (!Number.isSafeInteger(contextId)) throw new LensError('unsupported', '隔离上下文不可用');
      const evaluated = await session.send('Runtime.evaluate', { expression: bundle, contextId, returnByValue: true });
      if (evaluated.exceptionDetails) throw new LensError('unsupported', '结构探测产物不可执行');
      const result = await session.send('Runtime.callFunctionOn', { executionContextId: contextId, functionDeclaration: 'function(){return globalThis.CodexTaskLensBuild.probe();}', returnByValue: true });
      if (result.exceptionDetails) throw new LensError('unsupported', '结构探测执行失败');
      reports.push({ index: reports.length + 1, panes: redactPanes((result.result as { value?: unknown } | undefined)?.value, salt) });
    } finally { session.close(); }
  }
  const report = { schemaVersion: 1, capturedAt: new Date().toISOString(), platform: process.platform, architecture: process.arch, macOS: (await command('/usr/bin/sw_vers', ['-productVersion'])).stdout.trim(), codexVersion: app.version, bundleId: app.bundleId, signedAppAndLoopbackVerified: true, targets: reports, acceptanceComplete: false, remaining: ['T02：两个对话切换及脱敏会话记录基线', 'I2：绑定、文件同步、权限恢复、宿主操作、时延和完整清理的真机证据', 'R1：完整验收证据审计'] };
  await mkdir('test-results', { recursive: true, mode: 0o700 });
  const file = `test-results/mac-probe-${Date.now()}.json`;
  await writeFile(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const identified = reports.some(target => target.panes.some(pane => pane.identified));
  console.log(JSON.stringify({ report: file, identifiedPane: identified, probeOnly, acceptanceComplete: false, message: probeOnly ? '仅结构探测；不代表 I2 完整通过' : '结构探测已记录；完整 I2 尚需按验收清单执行，退出码 2 表示未完成' }, null, 2));
  process.exitCode = probeOnly && identified ? 0 : 2;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) void main().catch(error => { console.error(error instanceof LensError ? error.message : '真机探测失败；未输出私密上下文'); process.exitCode = 1; });
