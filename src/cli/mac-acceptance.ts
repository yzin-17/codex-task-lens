import { createInterface } from 'node:readline/promises';
import { mkdtemp, mkdir, realpath, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { CdpSession } from '../adapters/codex/cdp/session.js';
import { SessionRecords } from '../adapters/codex/session-records/index.js';
import { startCodex } from '../host/codex-runtime.js';
import { startStandalone } from '../host/standalone-runtime.js';
import { command, discoverApp, verifyEndpoint, type TrustedEndpoint } from '../platform/macos/codex-app.js';
import type { MonitorRef } from '../contracts/index.js';
import { parseArgs } from './index.js';
import { AcceptanceReport, AUTOMATED_CHECKS, OPERATOR_CHECKS, percentile95, writeAcceptanceReport, type CheckId } from '../validation/acceptance-report.js';
import { DesktopObserver } from '../validation/desktop-observer.js';
import { atomicFixtureWrite, exerciseFileLifecycle, measureVisibleUpdates, SMALL_DOCUMENT, waitUntil } from '../validation/document-checks.js';

export const ACCEPTANCE_HELP = `Codex Task Lens Mac 验收向导\n  pnpm test:mac:acceptance -- --enable --interactive --cdp-port 9341\n  可选 --app /Applications/Codex.app\n  可选 --session-root /absolute/path --allow-session-read\n只在临时目录创建测试仓库、Task 文档与工具绑定。请先停止 Task Lens（不是 Codex），并准备同一窗口内两个专用测试对话。\n不会发送消息、改写宿主输入、重启 Codex、读取 auth.json 或上传报告。\n自动测量 20 次更新、50 次工具启停；人工项目逐项输入 PASS / FAIL / SKIP。SKIP 不算通过。\n完整报告写入 test-results 下的私有目录；不会自动勾选 Task。\n`;
export function parseAcceptanceArgs(args: string[], interactive: boolean) {
  const input = args.filter(arg => arg !== '--');
  if (!input.includes('--enable') || !input.includes('--interactive') || !interactive) throw new Error('需要 --enable --interactive 和真实交互终端；不会自动执行真机验收');
  const options = parseArgs(input.filter(arg => !['--enable', '--interactive'].includes(arg)));
  if (options.standalone || options.launch || options.doctor || options.workspace || options.dataDirectory || options.port || options.help) throw new Error('验收使用隔离的临时文件和状态，不接受启动应用、项目授权或自定义状态目录');
  return options;
}
async function artifactFingerprint(): Promise<string> {
  const root = fileURLToPath(new URL('../../', import.meta.url)), hash = createHash('sha256');
  let visited = 0, bytes = 0;
  async function walk(directory: string): Promise<void> {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++visited > 2000 || entry.isSymbolicLink()) throw new Error('Unsupported build artifact tree');
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile()) throw new Error('Unsupported build artifact');
      const content = await readFile(file); bytes += content.length;
      if (bytes > 64 * 1024 * 1024) throw new Error('Build artifacts exceed limit');
      hash.update(path.relative(root, file)).update('\0').update(content);
    }
  }
  await walk(path.join(root, 'node')); await walk(path.join(root, 'inject')); await walk(path.join(root, 'ui'));
  return hash.digest('hex');
}
const manualInstructions: Record<typeof OPERATOR_CHECKS[number], string> = {
  multiple_windows: '人工打开第二个 Codex 窗口，确认两个窗口可分别查看不同绑定、更新不串用。输入 PASS 时保留第二窗口；记录后可关闭它。',
  auxiliary_and_unknown: '人工打开侧聊／辅助区域及首页，确认未知身份不借用主对话任务；完成后回到测试 A。无法覆盖该场景请输入 SKIP。',
  worktree_and_shared_document: 'A、B 已绑定两个真实临时 worktree 中相同相对路径。请再把 B 更换为 A 文件，确认共享更新一致、取消更换不丢原绑定；完成后回到 A。',
  session_candidates: '在另一个专用测试对话中核对真实会话明确引用的 Markdown 候选来源；日志未授权时目录和手动绑定仍可使用。只有实际观察到该行为才输入 PASS。',
  host_controls: '仅在专用测试对话中人工检查输入、发送、审批、滚动和焦点。向导不会代发消息；没有实际覆盖的操作请输入 SKIP。',
  theme_and_layout: '切换 Codex 浅／深色并缩窄窗口，检查清单、原文与绑定控件没有遮挡、横向溢出；完成后恢复正常大小并回到 A。',
  page_reload_and_disconnect: '人工检查页面重载及连接丢失后的恢复，确认恢复后单一面板、绑定保留、草稿不变。不要中断生产长任务；无法安全执行请输入 SKIP。',
  missed_event_recovery: '核对事件丢失补偿测试的实际证据：版本轮询不高于每 5 秒一次，变化在 6 秒内恢复。仅正常保存成功不能算通过；缺少此场景证据请输入 SKIP。',
  security_boundaries: '核对当前提交的端点／bridge 负例测试，确认未知监听者、错误 context、旧 generation 被拒绝；检查无正文或凭证输出，停止工具不宣称关闭 Codex CDP 端口。',
};
export async function runMacAcceptance(args: string[]): Promise<number> {
  const options = parseAcceptanceArgs(args, !!process.stdin.isTTY && !!process.stdout.isTTY);
  if (process.platform !== 'darwin') throw new Error('真机验收只在 macOS 执行；受控 CI 不替代它');
  const report = new AcceptanceReport('codex-desktop'), controller = new AbortController();
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const abort = () => controller.abort(); process.once('SIGINT', abort); process.once('SIGTERM', abort); terminal.on('SIGINT', abort);
  let fixtureRoot: string | undefined, observer: DesktopObserver | undefined, runtime: Awaited<ReturnType<typeof startCodex>> | undefined;
  let standalone: Awaited<ReturnType<typeof startStandalone>> | undefined, endpoint: TrustedEndpoint | undefined;
  let a: string | undefined, b: string | undefined, fileA = '', fileB = '';
  const sourceId = 'acceptance-' + report.runId;
  const monitor = (threadId: string): MonitorRef => ({ kind: 'thread', sourceId, threadId });
  const question = async (message: string) => { controller.signal.throwIfAborted(); return terminal.question(message + '\n> ', { signal: controller.signal }); };
  const check = async (id: CheckId, action: () => Promise<void>): Promise<boolean> => {
    if (controller.signal.aborted) { report.finish(id, 'blocked', 0, 'interrupted'); return false; }
    const start = performance.now();
    try { await action(); report.finish(id, 'passed', performance.now() - start); console.log(`[PASS] ${id}`); return true; }
    catch { report.finish(id, controller.signal.aborted ? 'blocked' : 'failed', performance.now() - start, controller.signal.aborted ? 'interrupted' : 'check_failed'); console.log(`[未通过] ${id}；详细异常不写入报告，避免泄露本地上下文。`); return false; }
  };
  const ensureBinding = async (threadId: string, expectedPath: string, total: number, completed: number) => {
    const expected = await realpath(expectedPath);
    const view = await waitUntil(() => runtime!.service.snapshot(monitor(threadId)), value => value.binding?.documentRealPath === expected && value.snapshot?.status === 'ready', controller.signal);
    if (view.binding?.scope.kind !== 'document') throw new Error('Choose the complete temporary document');
    await observer!.expand(threadId);
    const panel = await waitUntil(() => observer!.observe(threadId), value => value.ready && !value.cached && value.total === total && value.completed === completed, controller.signal);
    if (!panel.groupsExpanded) throw new Error('Both task groups must initially be expanded');
  };
  const start = () => startCodex({ cdpPort: options.cdpPort ?? 9341, appPath: endpoint!.app.bundle, sourceId, dataDirectory: path.join(fixtureRoot!, 'state'), workspace: path.join(fixtureRoot!, 'worktree-a'), sessionRoot: options.sessionRoot, allowSessionRead: options.allowSessionRead, openBrowser: false });
  const cleanup = async (): Promise<boolean> => {
    let cleaned = true;
    try {
      await standalone?.close(); await runtime?.close();
      if (observer && !observer.peer.isClosed) await observer.assertUnoccupied();
      if (endpoint) {
        const current = await verifyEndpoint(endpoint.app, endpoint.port);
        for (const target of current.targets) {
          const reader = new DesktopObserver(await CdpSession.connect(target.webSocketDebuggerUrl, async () => {
            const verified = await verifyEndpoint(endpoint!.app, endpoint!.port);
            if (verified.pid !== current.pid || !verified.targets.some(item => item.webSocketDebuggerUrl === target.webSocketDebuggerUrl)) throw new Error('Cleanup target changed');
          }));
          try { await reader.start(); await reader.assertUnoccupied(); } finally { reader.close(); }
        }
      }
      if (runtime) { const resources = runtime.service.resources(); if (resources.documents || resources.watchers || resources.subscribers) cleaned = false; }
    } catch { cleaned = false; }
    observer?.close();
    if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true }).catch(() => { cleaned = false; });
    return cleaned;
  };
  try {
    console.log(ACCEPTANCE_HELP);
    if (!(await check('environment', async () => {
      const app = await discoverApp(options.appPath); endpoint = await verifyEndpoint(app, options.cdpPort ?? 9341);
      if (endpoint.targets.length !== 1) throw new Error('Start with exactly one Codex main window');
      const target = endpoint.targets[0]!;
      observer = new DesktopObserver(await CdpSession.connect(target.webSocketDebuggerUrl, async () => {
        const current = await verifyEndpoint(app, endpoint!.port);
        if (current.pid !== endpoint!.pid || !current.targets.some(item => item.id === target.id && item.webSocketDebuggerUrl === target.webSocketDebuggerUrl)) throw new Error('Target identity changed');
      }));
      await observer.start(); await observer.assertUnoccupied();
      const repo = fileURLToPath(new URL('../../../', import.meta.url));
      const commit = (await command('/usr/bin/git', ['-C', repo, 'rev-parse', '--verify', 'HEAD'])).stdout.trim();
      const dirty = (await command('/usr/bin/git', ['-C', repo, 'status', '--porcelain', '--untracked-files=no'])).stdout.trim();
      report.environment = { platform: process.platform, architecture: process.arch, macOS: (await command('/usr/bin/sw_vers', ['-productVersion'])).stdout.trim(), codexVersion: app.version.slice(0, 128), node: process.version, signedEndpoint: true, commit: /^[a-f0-9]{40}$/.test(commit) ? commit : null, artifactHash: await artifactFingerprint(), cleanWorktree: !dirty };
      if (dirty) throw new Error('Commit or stash code changes before acceptance');
    }))) {
      console.log('请核对：仅保留一个 Codex 主窗口；已停止其他 Task Lens；pnpm run doctor 通过；仓库已构建且无未提交修改。'); return 2;
    }
    fixtureRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'codex-task-lens-acceptance-')));
    const workA = path.join(fixtureRoot, 'worktree-a'), workB = path.join(fixtureRoot, 'worktree-b');
    await command('/usr/bin/git', ['init', '--quiet', '--initial-branch=main', workA]);
    await command('/usr/bin/git', ['-C', workA, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Task Lens Acceptance', '-c', 'user.email=acceptance@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'temporary acceptance fixture']);
    await command('/usr/bin/git', ['-C', workA, '-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--quiet', '--detach', workB, 'HEAD']);
    for (const workspace of [workA, workB]) await mkdir(path.join(workspace, 'docs/tasks'), { recursive: true });
    fileA = path.join(workA, 'docs/tasks/TASKS.md'); fileB = path.join(workB, 'docs/tasks/TASKS.md');
    await atomicFixtureWrite(fileA, SMALL_DOCUMENT); await atomicFixtureWrite(fileB, '# CTL-ACCEPTANCE-B\n- [x] CTL-B-one\n- [x] CTL-B-two\n- [ ] CTL-B-three\n');
    runtime = await start();
    if (!(await check('conversation_a', async () => {
      await question(`在当前 Codex 窗口选择专用测试对话 A。展开任务清单，使用面板预览并确认绑定下面的临时文档（整份文档），完成后回车：\n${fileA}`);
      const capture = await observer!.capture(); a = capture.threadId; report.capture('a', endpoint!.targets[0]!.id, a, capture.identifiedPanes); await ensureBinding(a, fileA, 2, 1);
    }))) return 2;
    if (!(await check('conversation_b', async () => {
      await question(`切换同一窗口到不同的专用测试对话 B。使用面板手动路径授权、预览并确认下面的临时文档，完成后回车：\n${fileB}`);
      const capture = await observer!.capture(); b = capture.threadId;
      if (b === a) throw new Error('A and B must be different conversations');
      report.capture('b', endpoint!.targets[0]!.id, b, capture.identifiedPanes); await ensureBinding(b, fileB, 3, 2);
    }))) return 2;
    if (!(await check('return_to_a', async () => {
      await question('回到同一窗口的对话 A，不重新绑定，完成后回车。');
      const capture = await observer!.capture();
      if (capture.threadId !== a) throw new Error('A binding was not restored');
      report.capture('return_a', endpoint!.targets[0]!.id, capture.threadId, capture.identifiedPanes); await ensureBinding(a!, fileA, 2, 1);
    }))) return 2;
    await check('file_lifecycle', () => exerciseFileLifecycle(fileA, () => observer!.observe(a!), controller.signal));
    await check('update_latency', async () => {
      const samples = await measureVisibleUpdates(fileA, () => observer!.observe(a!), controller.signal); report.setLatency(samples);
      if (percentile95(samples) > 1000) throw new Error('p95 exceeds one second');
    });
    await check('restart_restore', async () => {
      await runtime!.close(); await observer!.assertUnoccupied(); runtime = await start();
      await ensureBinding(a!, fileA, 2, 1);
    });
    await check('mount_cleanup', async () => {
      console.log('开始 50 次 Task Lens 启停与资源核对；不会退出或重启 Codex。');
      for (let iteration = 1; iteration <= 50; iteration++) {
        controller.signal.throwIfAborted(); await runtime!.close();
        const roots = await observer!.rootCount(), resources = runtime!.service.resources();
        await observer!.assertUnoccupied(); report.addCycle(iteration, { roots, documents: resources.documents, subscribers: resources.subscribers });
        if (roots || resources.documents || resources.subscribers || resources.watchers) throw new Error('Tool resources leaked');
        runtime = await start(); await ensureBinding(a!, fileA, 2, 1);
        if (iteration % 10 === 0) console.log(`已核对 ${iteration} / 50 次`);
      }
    });
    for (const id of OPERATOR_CHECKS) {
      if (controller.signal.aborted) break;
      let answer = '';
      while (!['PASS', 'FAIL', 'SKIP'].includes(answer)) answer = (await question(`${manualInstructions[id]}\n结果（PASS / FAIL / SKIP）：`)).trim().toUpperCase();
      if (answer === 'PASS' && id === 'multiple_windows') {
        const current = await verifyEndpoint(endpoint!.app, endpoint!.port);
        if (current.targets.length < 2) { report.finish(id, 'failed', 0, 'second_window_not_observed'); continue; }
      }
      if (answer === 'PASS' && id === 'session_candidates') {
        if (!options.sessionRoot || !options.allowSessionRead) { report.finish(id, 'blocked', 0, 'session_read_not_authorized'); continue; }
        let records: SessionRecords | undefined;
        try {
          records = await SessionRecords.open(options.sessionRoot, true);
          const hints = await records.hints({ kind: 'thread', sourceId: records.sourceId, threadId: a! });
          if (hints.status !== 'ready' || !hints.cwd || !hints.paths.length) { report.finish(id, 'blocked', 0, 'actual_session_structure_missing'); continue; }
        } catch { report.finish(id, 'blocked', 0, 'session_source_unavailable'); continue; }
        finally { records?.close(); }
      }
      report.finish(id, answer === 'PASS' ? 'passed' : answer === 'FAIL' ? 'failed' : 'blocked', 0, answer === 'SKIP' ? 'operator_not_observed' : answer === 'PASS' ? 'operator_confirmed' : 'operator_failed');
    }
    await check('standalone_fallback', async () => {
      await runtime!.close(); await observer!.assertUnoccupied();
      standalone = await startStandalone({ dataDirectory: path.join(fixtureRoot!, 'state'), openBrowser: true });
      await atomicFixtureWrite(fileA, SMALL_DOCUMENT.replace('- [ ]', '- [x]'));
      await waitUntil(() => standalone!.service.snapshot(monitor(a!)), view => view.snapshot?.status === 'ready' && view.snapshot.tasks?.completed === 2, controller.signal);
      const token = new URLSearchParams(new URL(standalone.url).hash.slice(1)).get('token');
      const response = await fetch(standalone.origin + '/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, origin: standalone.origin }, body: JSON.stringify({ protocolVersion: 1, requestId: 'acceptance-read', monitor: monitor(a!), generation: 0, operation: 'getSnapshot', params: {} }), signal: AbortSignal.timeout(5000) });
      if (!response.ok || !(await response.text()).includes('CTL-ACCEPTANCE-pending')) throw new Error('Standalone service failed');
      const answer = (await question('Task Lens 的 CDP 接入已停止。请在刚打开的独立浏览器面板选择对话 A 的绑定，确认两项均已完成。实际可见请输入 PASS，否则 FAIL / SKIP。')).trim().toUpperCase();
      if (answer !== 'PASS') throw new Error('Standalone visible result was not confirmed');
      await standalone.close(); standalone = undefined;
    });
  } catch { console.log('验收已中断或遇到环境问题；保留未通过状态并执行清理。'); }
  finally {
    const started = performance.now(), cleaned = await cleanup();
    report.finish('final_cleanup', cleaned ? 'passed' : 'failed', performance.now() - started, cleaned ? 'resources_released' : 'cleanup_not_confirmed');
    for (const id of [...AUTOMATED_CHECKS, ...OPERATOR_CHECKS]) if (report.status(id) === 'pending') report.finish(id, 'blocked', 0, controller.signal.aborted ? 'interrupted' : 'prerequisite_not_met');
    terminal.close(); process.off('SIGINT', abort); process.off('SIGTERM', abort);
    const files = await writeAcceptanceReport(report, path.resolve('test-results'));
    console.log(`报告：${files.json}\n摘要：${files.markdown}\n${report.snapshot().acceptanceComplete ? '场景记录齐备；仍需核对 T02 并执行 R1，不自动勾选任务。' : '尚未完成全部验收；报告逐项保留失败、阻塞与人工观察。'}`);
  }
  return report.snapshot().acceptanceComplete ? 0 : 2;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) console.log(ACCEPTANCE_HELP);
  else void runMacAcceptance(args).then(code => { process.exitCode = code; }).catch(() => { console.error('验收未启动或报告保存失败。需要 macOS、交互终端、--enable --interactive、可信 CDP 端点及可写报告目录；不会输出私密异常。'); process.exitCode = 1; });
}
