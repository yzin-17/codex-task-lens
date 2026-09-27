import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BindingStore } from '../../src/store/binding-store.js';
import { LensService } from '../../src/host/lens-service.js';
import { CdpSession } from '../../src/adapters/codex/cdp/session.js';
import { CdpBridge } from '../../src/host/cdp-bridge/bridge.js';
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
async function fixture(authorizeWorkspace = false, sessionCandidate = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'lens-real-cdp-')), workspace = path.join(root, 'project');
  await mkdir(path.join(workspace, 'docs/tasks'), { recursive: true });
  const sessionFile = sessionCandidate ? path.join(workspace, 'docs/tasks/from-session.md') : undefined;
  if (sessionFile) await writeFile(sessionFile, '- [ ] pending\n- [x] done\n');
  const html = await readFile('tests/fixtures/codex/contract-baseline/panes.html', 'utf8');
  const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('no server');
  const origin = `http://127.0.0.1:${address.port}`;
  const context: BrowserContext = await chromium.launchPersistentContext(path.join(root, 'browser'), { headless: true, args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'] });
  const page: Page = context.pages()[0]!; await page.goto(origin);
  const port = Number((await readFile(path.join(root, 'browser/DevToolsActivePort'), 'utf8')).split('\n')[0]);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { url: string; webSocketDebuggerUrl: string }[];
  const target = targets.find(value => value.url.startsWith(origin))!;
  // Test-only controlled Chromium endpoint; production uses the macOS signed-app verifier.
  const connect = () => CdpSession.connect(target.webSocketDebuggerUrl, async () => { expect(new URL(target.webSocketDebuggerUrl).hostname).toBe('127.0.0.1'); });
  let session = await connect();
  const store = await BindingStore.open(path.join(root, 'state')), service = new LensService(store, sessionFile ? { hints: async () => ({ status: 'ready', paths: [{ path: sessionFile, source: 'current conversation' }], diagnostics: [] }) } : {});
  const initialGrantId = authorizeWorkspace ? (await service.authorize(workspace, 'directory')).id : undefined;
  let shutdownRequests = 0;
  const options = { sourceId: 'fixture', bundle: await readFile('dist/inject/task-lens.js', 'utf8'), styles: await readFile('dist/inject/task-lens.css', 'utf8'), refreshMs: 40, initialGrantId, shutdown: () => { shutdownRequests++; } };
  let bridge = await CdpBridge.attach(session, service, options);
  return {
    root, workspace, sessionFile, page, service, bridge: () => bridge, shutdownRequests: () => shutdownRequests,
    reattach: async () => { await bridge.close(); bridge = await CdpBridge.attach(session, service, options); },
    reconnect: async () => { session.close(); await expect.poll(() => bridge.isClosed).toBe(true); session = await connect(); bridge = await CdpBridge.attach(session, service, options); },
    close: async () => { await bridge.close(); session.close(); await context.close(); await service.close(); await store.close(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); },
  };
}
async function expand(page: Page) { await page.getByLabel('展开任务清单', { exact: true }).first().click(); }
async function bind(page: Page, file: string) {
  await page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
  await page.getByLabel('本地绝对路径', { exact: true }).fill(file);
  await page.getByRole('button', { name: '预览文件', exact: true }).click();
  await page.getByRole('button', { name: '确认绑定', exact: true }).click();
}
test('settings requires explicit confirmation before requesting graceful Task Lens shutdown', async () => {
  const f = await fixture(); try {
    await expand(f.page);
    await f.page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(f.page.getByText('退出只会停止 Task Lens 的 CDP 注入、文件监听和本地服务，不会关闭 Codex。之后再次双击 Codex Task Lens 即可重新启动。')).toBeVisible();
    await f.page.getByRole('button', { name: '退出 Task Lens', exact: true }).click();
    expect(f.shutdownRequests()).toBe(0);
    await f.page.getByRole('button', { name: '确认退出', exact: true }).click();
    await expect.poll(() => f.shutdownRequests()).toBe(1);
  } finally { await f.close(); }
});
test('real CDP + shared service + React: bind, watch atomic saves and isolate A→B→A', async () => {
  const f = await fixture(); try {
    const one = path.join(f.root, 'one.md'), two = path.join(f.root, 'two.md'); await writeFile(one, '- [ ] alpha\n- [x] already\n'); await writeFile(two, '- [ ] beta\n');
    await expand(f.page); await bind(f.page, one); await expect(f.page.getByText('alpha', { exact: true })).toBeVisible();
    await writeFile(one + '.tmp', '- [x] alpha\n- [x] already\n'); await rename(one + '.tmp', one);
    await expect(f.page.locator('.lens-task-count')).toContainText('2 / 2');
    await f.page.locator('.pane').evaluate((element, id) => element.setAttribute('data-thread-id', id), b);
    await expect(f.page.locator('.lens-thread-label')).toContainText(b.slice(0, 8)); await expand(f.page); await bind(f.page, two);
    await expect(f.page.getByText('beta', { exact: true })).toBeVisible(); await expect(f.page.getByText('alpha', { exact: true })).toHaveCount(0);
    await f.page.locator('.pane').evaluate((element, id) => element.setAttribute('data-thread-id', id), a);
    await expect(f.page.locator('.lens-thread-label')).toContainText(a.slice(0, 8)); await expand(f.page);
    await expect(f.page.getByText('alpha', { exact: true })).toBeVisible(); await expect(f.page.getByText('beta', { exact: true })).toHaveCount(0);
    expect(await f.page.evaluate(() => Object.keys(globalThis).filter(key => key.startsWith('__taskLens_')))).toEqual([]);
    expect(await readFile(one, 'utf8')).toBe('- [x] alpha\n- [x] already\n');
  } finally { await f.close(); }
});
test('conflicting identities never display another task; controls and uninstall remain intact', async () => {
  const f = await fixture(); try {
    await f.page.locator('.pane').evaluate((element, id) => element.setAttribute('data-conversation-id', id), b);
    await expect(f.page.getByText('进度 · 未识别')).toBeVisible();
    await f.page.getByLabel('输入', { exact: true }).fill('untouched input'); await f.page.locator('#send').click(); await f.page.locator('#approve').click();
    await expect(f.page.locator('body')).toHaveAttribute('data-sent', 'yes'); await expect(f.page.locator('body')).toHaveAttribute('data-approved', 'yes');
    await f.bridge().close(); await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(0);
    expect(f.service.resources().subscribers).toBe(0); await expect(f.page.getByLabel('输入', { exact: true })).toHaveValue('untouched input');
  } finally { await f.close(); }
});
test('separate panes, page reload and repeated remounts release all tool roots', async () => {
  test.setTimeout(60000); const f = await fixture(); try {
    await f.page.locator('main').evaluate((element, id) => { const region = document.createElement('section'); region.className = 'pane'; region.setAttribute('data-thread-id', id); region.innerHTML = '<div data-composer-root><textarea aria-label="second"></textarea><div data-composer-toolbar><button>操作</button></div></div>'; element.append(region); }, b);
    await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(2);
    await f.page.reload(); await expect.poll(() => f.bridge().isClosed).toBe(true); await f.reattach();
    await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(1);
    for (let i = 0; i < 50; i++) { await f.reattach(); await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(1); }
    await f.bridge().close(); await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(0); expect(f.service.resources().subscribers).toBe(0);
  } finally { await f.close(); }
});
test('reconnect disposes an orphaned renderer before restoring the existing binding', async () => {
  const f = await fixture(); try {
    const file = path.join(f.root, 'reconnect.md'); await writeFile(file, '- [ ] retained task\n'); await expand(f.page); await bind(f.page, file);
    await expect(f.page.getByText('retained task', { exact: true })).toBeVisible();
    await f.page.getByLabel('输入', { exact: true }).fill('preserve me'); await f.reconnect();
    await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(1); await expand(f.page);
    await expect(f.page.getByText('retained task', { exact: true })).toBeVisible();
    await expect(f.page.getByLabel('输入', { exact: true })).toHaveValue('preserve me'); expect(f.service.resources().subscribers).toBe(1);
    await f.bridge().close(); expect(f.service.resources().subscribers).toBe(0);
  } finally { await f.close(); }
});
test('session Task paths appear before directory authorization and selecting one authorizes only that file', async () => {
  const f = await fixture(false, true); try {
    const grants: { input: string; kind: string }[] = [], authorize = f.service.authorize.bind(f.service);
    f.service.authorize = async (input, kind) => { grants.push({ input, kind }); return authorize(input, kind); };
    await expand(f.page); await f.page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
    const candidate = f.page.locator('.lens-candidate').filter({ hasText: 'from-session.md' });
    await expect(candidate).toBeVisible(); await expect(candidate).toContainText('待授权');
    await expect(f.page.getByText('还没有授权项目目录', { exact: true })).toHaveCount(0);
    expect(grants).toEqual([]);
    await candidate.getByRole('button', { name: /添加 from-session\.md 来源/ }).click();
    await expect(f.page.getByLabel('已选摘要', { exact: true })).toContainText('已选 1 份');
    expect(grants).toEqual([{ input: f.sessionFile!, kind: 'file' }]);
    await f.page.getByRole('button', { name: '确认绑定', exact: true }).click();
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度 1/2');
  } finally { await f.close(); }
});
test('automatically discovers within an explicitly authorized workspace and supports zero-height identity markers', async () => {
  const f = await fixture(true); try {
    const file = path.join(f.workspace, 'docs/tasks/auto.md'); await writeFile(file, '# 自动发现\n- [ ] task from workspace\n');
    await f.page.locator('.pane').evaluate((element, id) => { element.removeAttribute('data-thread-id'); const marker = document.createElement('div'); marker.dataset.aboveComposerConversationId = id; element.prepend(marker); }, a);
    await expect(f.page.locator('.lens-thread-label')).toContainText(a.slice(0, 8)); await expand(f.page);
    await f.page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
    await f.page.getByRole('button', { name: /自动发现.*来源/ }).click();
    await f.page.getByRole('button', { name: '确认绑定', exact: true }).click();
    await expect(f.page.getByText('task from workspace', { exact: true })).toBeVisible();
    await f.page.locator('[data-above-composer-conversation-id]').evaluate(element => element.remove());
    await expect(f.page.getByText('进度 · 未识别')).toBeVisible();
    await expect(f.page.getByText('task from workspace', { exact: true })).toHaveCount(0);
  } finally { await f.close(); }
});


// Minimal structural reproduction of Codex 26.924: a hidden metadata DIV and
// the visible editor separated by wrappers; no private text or thread IDs.
async function hiddenSentinelLayout(page: Page) {
  await page.locator('.pane').evaluate((pane, id) => {
    pane.removeAttribute('data-thread-id');
    const marker = document.createElement('div');
    marker.setAttribute('data-above-composer-conversation-id', id);
    marker.style.display = 'none';
    const editor = document.createElement('div');
    editor.className = 'ProseMirror'; editor.contentEditable = 'true';
    editor.setAttribute('role', 'textbox'); editor.setAttribute('aria-label', '输入');
    editor.style.minHeight = '44px';
    let interior: HTMLElement = editor;
    for (let i = 0; i < 6; i++) {
      const wrapper = document.createElement('div'); wrapper.append(interior); interior = wrapper;
    }
    const shell = document.createElement('div'); shell.className = '_ComposerLayoutRoot_fixture'; shell.append(interior); const toolbar = document.createElement('div'); toolbar.setAttribute('data-composer-toolbar', ''); toolbar.innerHTML = '<button>操作</button>'; shell.append(toolbar);
    let outer = shell;
    for (let i = 0; i < 2; i++) { const wrapper = document.createElement('div'); wrapper.append(outer); outer = wrapper; }
    pane.replaceChildren(marker, outer);
  }, a);
  await expect(page.locator('[data-task-lens-host]')).toHaveCount(1);
}
test('hidden composer metadata identifies the real pane and restores A→B→A bindings', async () => {
  const f = await fixture(); try {
    await hiddenSentinelLayout(f.page);
    await expect(f.page.locator('.lens-thread-label')).toContainText(a.slice(0, 8));
    await expect(f.page.locator('.lens-unknown')).toHaveCount(0);
    const file = path.join(f.root, 'hidden-metadata.md'); await writeFile(file, '- [ ] metadata task\n- [x] done\n');
    await expand(f.page); await bind(f.page, file);
    await expect(f.page.locator('.lens-task-count')).toContainText('1 / 2');
    const marker = f.page.locator('[data-above-composer-conversation-id]');
    await expect(marker).toHaveCSS('display', 'none');
    await marker.evaluate((element, id) => element.setAttribute('data-above-composer-conversation-id', id), b);
    await expect(f.page.locator('.lens-thread-label')).toContainText(b.slice(0, 8));
    await expect(f.page.getByText('metadata task', { exact: true })).toHaveCount(0);
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度');
    await marker.evaluate((element, id) => element.setAttribute('data-above-composer-conversation-id', id), a);
    await expect(f.page.locator('.lens-thread-label')).toContainText(a.slice(0, 8)); await expand(f.page);
    await expect(f.page.getByText('metadata task', { exact: true })).toBeVisible();
    await writeFile(file + '.tmp', '- [x] metadata task\n- [x] done\n'); await rename(file + '.tmp', file);
    await expect(f.page.locator('.lens-task-count')).toContainText('2 / 2');
    await f.bridge().close(); await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(0);
    expect(f.service.resources().subscribers).toBe(0);
  } finally { await f.close(); }
});
for (const inactive of ['display', 'hidden', 'aria-hidden', 'visibility'] as const) {
  test(`hidden metadata never selects a marker under an inactive ${inactive} ancestor`, async () => {
    const f = await fixture(); try {
      await hiddenSentinelLayout(f.page);
      await f.page.locator('[data-above-composer-conversation-id]').evaluate((marker, state) => {
        const wrapper = document.createElement('div');
        if (state === 'display') wrapper.style.display = 'none';
        else if (state === 'visibility') wrapper.style.visibility = 'hidden';
        else wrapper.setAttribute(state, state === 'hidden' ? '' : 'true');
        marker.replaceWith(wrapper); wrapper.append(marker);
      }, inactive);
      await expect(f.page.locator('.lens-unknown')).toBeVisible();
      await expect(f.page.locator('.lens-thread-label')).toHaveCount(0);
      await f.page.locator('.pane').evaluate((pane, id) => {
        const active = document.createElement('div'); active.style.display = 'none';
        active.setAttribute('data-above-composer-conversation-id', id); pane.prepend(active);
      }, b);
      await expect(f.page.locator('.lens-thread-label')).toContainText(b.slice(0, 8));
      await expect(f.page.locator('.lens-unknown')).toHaveCount(0);
    } finally { await f.close(); }
  });
}
test('only an empty dedicated sentinel may use display:none; malformed and conflicting IDs stay unknown', async () => {
  const f = await fixture(); try {
    await hiddenSentinelLayout(f.page);
    const marker = f.page.locator('[data-above-composer-conversation-id]');
    await marker.evaluate(node => node.append(document.createElement('span')));
    await expect(f.page.locator('.lens-unknown')).toBeVisible();
    await marker.evaluate(node => node.replaceChildren());
    await expect(f.page.locator('.lens-thread-label')).toContainText(a.slice(0, 8));
    await marker.evaluate(node => node.setAttribute('data-above-composer-conversation-id', 'not-a-thread'));
    await expect(f.page.locator('.lens-unknown')).toBeVisible();
    await marker.evaluate((node, id) => node.setAttribute('data-above-composer-conversation-id', id), a);
    await f.page.locator('.pane').evaluate((pane, id) => {
      const conflict = document.createElement('div'); conflict.style.display = 'none';
      conflict.setAttribute('data-above-composer-conversation-id', id); pane.prepend(conflict);
    }, b);
    await expect(f.page.locator('.lens-unknown')).toBeVisible();
    await expect(f.page.locator('.lens-thread-label')).toHaveCount(0);
    await f.page.locator('[data-above-composer-conversation-id]').evaluateAll(nodes => {
      nodes[0]!.remove(); const node = nodes[1]!;
      node.setAttribute('data-thread-id', node.getAttribute('data-above-composer-conversation-id')!);
      node.removeAttribute('data-above-composer-conversation-id');
    });
    await expect(f.page.locator('.lens-unknown')).toBeVisible();
  } finally { await f.close(); }
});
test('separate visible composers use their own hidden sentinel, never a global first marker', async () => {
  const f = await fixture(); try {
    await hiddenSentinelLayout(f.page);
    await f.page.locator('main').evaluate((main, id) => {
      const pane = document.createElement('section'); pane.className = 'pane';
      const marker = document.createElement('div'); marker.style.display = 'none';
      marker.setAttribute('data-above-composer-conversation-id', id);
      const shell = document.createElement('div'); shell.setAttribute('data-composer-root', '');
      const editor = document.createElement('textarea'); editor.setAttribute('aria-label', 'second');
      shell.append(editor); const toolbar = document.createElement('div'); toolbar.setAttribute('data-composer-toolbar', ''); toolbar.innerHTML = '<button>操作</button>'; shell.append(toolbar); pane.append(marker, shell); main.append(pane);
    }, b);
    await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(2);
    await expect(f.page.locator('.lens-thread-label')).toHaveText([`当前对话 · ${a.slice(0, 8)}`, `当前对话 · ${b.slice(0, 8)}`]);
    await f.page.locator('.pane').first().evaluate(node => { (node as HTMLElement).style.display = 'none'; });
    await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(1);
    await expect(f.page.locator('.lens-thread-label')).toContainText(b.slice(0, 8));
    await f.bridge().close(); expect(f.service.resources().subscribers).toBe(0);
  } finally { await f.close(); }
});

test('toolbar entry opens a top-layer popover without moving the composer; outside and Escape close it', async () => {
  const f = await fixture(); try {
    const entry = f.page.getByLabel('展开任务清单', { exact: true });
    await expect(f.page.locator('[data-composer-toolbar] [data-task-lens-host]')).toHaveCount(1);
    const before = await f.page.getByLabel('输入', { exact: true }).boundingBox();
    await entry.click(); await expect(f.page.getByRole('dialog', { name: '任务清单', exact: true })).toBeVisible();
    const box = await f.page.locator('.lens-embedded-shell').boundingBox(), viewport = f.page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect(await f.page.getByLabel('输入', { exact: true }).boundingBox()).toEqual(before);
    // Electron hosts may consume keyboard events before injected document listeners.
    await f.page.evaluate(() => document.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopImmediatePropagation(); setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea')?.focus(), 0); } }, true));
    await expect(entry).toHaveAttribute('popovertargetaction', 'toggle');
    await f.page.keyboard.press('Escape'); await expect(entry).toHaveAttribute('aria-expanded', 'false'); await expect(entry).toBeFocused();
    await entry.click(); await f.page.getByLabel('输入', { exact: true }).click();
    await expect(entry).toHaveAttribute('aria-expanded', 'false');
    await expect(f.page.getByLabel('输入', { exact: true })).toBeFocused();
  } finally { await f.close(); }
});
test('multiple Markdown previews commit together and the closed trigger keeps updating', async () => {
  const f = await fixture(); try {
    const one = path.join(f.root, 'multi-a.md'), two = path.join(f.root, 'multi-b.md');
    await writeFile(one, '- [ ] alpha\n- [x] done\n'); await writeFile(two, '- [ ] beta\n- [x] done\n');
    await expand(f.page); await f.page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
    await f.page.getByLabel('本地绝对路径', { exact: true }).fill(`${one}\n${two}`);
    await f.page.getByRole('button', { name: '预览文件', exact: true }).click();
    await expect(f.page.getByLabel('已选摘要', { exact: true })).toContainText('已选 2 份');
    await f.page.getByRole('button', { name: '确认绑定', exact: true }).click();
    await expect(f.page.locator('.lens-trigger')).toContainText('进度 2/4');
    await expect(f.page.locator('.lens-file-section')).toHaveCount(2);
    await expect(f.page.locator('.lens-task-group h3>button[aria-expanded=true]')).toHaveCount(4);
    await f.page.getByLabel('关闭任务清单', { exact: true }).click();
    await writeFile(one, '- [x] alpha\n- [x] done\n');
    await expect(f.page.locator('.lens-trigger')).toContainText('进度 3/4');
    await expect(f.page.getByRole('dialog')).not.toBeVisible();
    await expand(f.page); await f.page.getByRole('button', { name: '管理文档', exact: true }).click();
    await f.page.getByRole('button', { name: '管理已选文档', exact: true }).click();
    await f.page.getByLabel('移除 multi-b.md', { exact: true }).click();
    await f.page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(f.page.locator('.lens-trigger')).toContainText('进度 3/4');
    await f.page.getByRole('button', { name: '管理文档', exact: true }).click();
    await f.page.getByRole('button', { name: '管理已选文档', exact: true }).click();
    await f.page.getByLabel('移除 multi-b.md', { exact: true }).click();
    await f.page.getByRole('button', { name: '确认更改', exact: true }).click();
    await expect(f.page.locator('.lens-trigger')).toContainText('进度 2/2');
    await f.reattach(); await expect(f.page.locator('.lens-trigger')).toContainText('进度 2/2');
    expect(await readFile(two, 'utf8')).toBe('- [ ] beta\n- [x] done\n');
  } finally { await f.close(); }
});
test('a missing toolbar is not replaced by arbitrary page insertion', async () => {
  const f = await fixture(); try {
    await f.page.locator('[data-composer-toolbar]').evaluate(node => node.remove());
    await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(0);
    await expect(f.page.getByLabel('输入', { exact: true })).toBeVisible();
  } finally { await f.close(); }
});

test('mouse focus and typing remain inside Task Lens despite composer mouse handlers', async () => {
  const f = await fixture(); try {
    await f.page.locator('[data-composer-root]').evaluate(shell => {
      const editor = shell.querySelector('textarea')!;
      const takeFocus = (event: Event) => { if (event.target !== editor) { event.preventDefault(); editor.focus(); } };
      shell.addEventListener('mousedown', takeFocus); shell.addEventListener('pointerdown', takeFocus);
    });
    await expand(f.page); await f.page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
    const paths = f.page.getByLabel('本地绝对路径', { exact: true });
    await paths.click(); await expect(paths).toBeFocused();
    await paths.pressSequentially('/fixture/one.md'); await paths.press('Enter'); await paths.pressSequentially('/fixture/two.md');
    await expect(paths).toHaveValue('/fixture/one.md\n/fixture/two.md');
    await expect(f.page.getByLabel('输入', { exact: true })).toHaveValue('');
    const type = f.page.getByRole('radio', { name: '文件', exact: true });
    await type.click(); await expect(type).toBeFocused(); await type.press('ArrowRight');
    await expect(f.page.getByRole('dialog', { name: '任务清单', exact: true })).toBeVisible();
    const directory = f.page.getByRole('radio', { name: '目录', exact: true });
    await expect(directory).toHaveAttribute('aria-checked', 'true'); await paths.click(); await expect(paths).toBeFocused();
    await paths.pressSequentially('/fixture/project'); await expect(paths).toHaveValue('/fixture/project');
    await directory.focus(); await directory.press('ArrowLeft'); await expect(type).toHaveAttribute('aria-checked', 'true');
    await paths.click(); await paths.pressSequentially('/fixture/single.md'); await expect(paths).toHaveValue('/fixture/single.md');
    await expect(f.page.getByRole('region', { name: '手动添加', exact: true }).getByRole('checkbox')).toHaveCount(0);
    await f.page.getByLabel('关闭任务清单', { exact: true }).click();
    await f.page.getByLabel('输入', { exact: true }).click(); await f.page.keyboard.type('host still works');
    await expect(f.page.getByLabel('输入', { exact: true })).toHaveValue('host still works');
    await expect(f.page.locator('body')).not.toHaveAttribute('data-sent', 'yes');
  } finally { await f.close(); }
});

test('pin survives outside input and Escape there; unpin and explicit close remain usable', async () => {
  const f = await fixture(); try {
    await expand(f.page);
    const popup = f.page.locator('.lens-embedded-shell'), entry = f.page.locator('.lens-trigger');
    await expect(entry).toHaveText('进度');
    await expect(f.page.locator('.lens-progress-ring')).toHaveAttribute('data-percent', 'unknown');
    await f.page.getByLabel('固定浮窗', { exact: true }).click();
    await expect(f.page.getByLabel('取消固定浮窗', { exact: true })).toHaveAttribute('aria-pressed', 'true');
    await f.page.getByLabel('输入', { exact: true }).click(); await f.page.keyboard.type('outside draft');
    await f.page.keyboard.press('Escape'); await expect(popup).toBeVisible();
    await expect(f.page.getByLabel('输入', { exact: true })).toHaveValue('outside draft');
    await f.page.getByLabel('取消固定浮窗', { exact: true }).click();
    await f.page.getByLabel('输入', { exact: true }).click(); await expect(popup).not.toBeVisible();
    await entry.click(); await f.page.getByLabel('固定浮窗', { exact: true }).click();
    await f.page.getByLabel('关闭任务清单', { exact: true }).click(); await expect(popup).not.toBeVisible();
    await expect(entry).toBeFocused();
    await entry.click(); await f.page.getByLabel('关闭任务清单', { exact: true }).focus();
    await f.page.keyboard.press('Escape'); await expect(popup).not.toBeVisible();
  } finally { await f.close(); }
});

test('drag clamps to the conversation, persists on updates and resets on thread switch', async () => {
  const f = await fixture(); try {
    await f.page.locator('.pane').evaluate(node => { (node as HTMLElement).style.width = '840px'; (node as HTMLElement).style.height = '620px'; });
    const file = path.join(f.root, 'drag.md'); await writeFile(file, '- [ ] first\n- [x] second\n');
    await expand(f.page); await bind(f.page, file);
    await expect(f.page.locator('.lens-progress-ring')).toHaveAttribute('data-percent', '50');
    await f.page.getByLabel('固定浮窗', { exact: true }).click();
    const popup = f.page.locator('.lens-embedded-shell'), handle = f.page.getByLabel('移动进度浮窗', { exact: true });
    const start = await handle.boundingBox();
    await f.page.mouse.move(start!.x + 5, start!.y + 5); await f.page.mouse.down();
    await f.page.mouse.move(1250, 700, { steps: 8 }); await f.page.mouse.up();
    const moved = await popup.boundingBox(), column = await f.page.locator('.pane').boundingBox();
    expect(moved!.x).toBeGreaterThanOrEqual(column!.x);
    expect(moved!.x + moved!.width).toBeLessThanOrEqual(column!.x + column!.width);
    expect(moved!.y).toBeGreaterThanOrEqual(column!.y);
    expect(moved!.y + moved!.height).toBeLessThanOrEqual(column!.y + column!.height);
    await writeFile(file, '- [x] first\n- [x] second\n');
    await expect(f.page.locator('.lens-progress-ring')).toHaveAttribute('data-percent', '100');
    expect((await popup.boundingBox())!.x).toBe(moved!.x);
    await handle.focus(); await handle.press('ArrowLeft');
    expect((await popup.boundingBox())!.x).toBe(moved!.x - 10);
    await f.page.setViewportSize({ width: 700, height: 550 });
    await expect.poll(async () => { const box = (await popup.boundingBox())!; return box.x + box.width <= 700 && box.y + box.height <= 550; }).toBe(true);
    await f.page.locator('.pane').evaluate((node, id) => node.setAttribute('data-thread-id', id), b);
    await expect(f.page.locator('.lens-trigger')).toHaveAttribute('aria-expanded', 'false');
    await expand(f.page); await expect(f.page.getByLabel('固定浮窗', { exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(f.page.getByText('first', { exact: true })).toHaveCount(0);
    await f.bridge().close(); await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(0);
    expect(f.service.resources().subscribers).toBe(0);
  } finally { await f.close(); }
});

test('empty candidate state presents a clear project authorization action', async () => {
  const f = await fixture(); try {
    await expand(f.page); await f.page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
    const authorize = f.page.getByRole('button', { name: '授权项目目录', exact: true });
    await expect(authorize).toBeVisible();
    await expect(authorize).toHaveClass(/lens-authorize-workspace/);
    await authorize.click();
    await expect(f.page.getByRole('radio', { name: '目录', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(f.page.getByLabel('本地绝对路径', { exact: true })).toBeFocused();
  } finally { await f.close(); }
});

test('candidate-first document manager keeps selected summary and confirmation visible while scrolling', async () => {
  const f = await fixture(true); try {
    for (let i = 0; i < 24; i++) await writeFile(path.join(f.workspace, `docs/tasks/${String(i).padStart(2, '0')}.md`), `# Candidate${i}\n- [ ] pending\n- [x] done\n`);
    await expand(f.page); await f.page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
    const summary = f.page.getByLabel('已选摘要', { exact: true }), scroll = f.page.locator('.lens-manager-scroll'), footer = f.page.locator('.lens-manager-footer');
    const initialScroll = await scroll.evaluate(node => node.scrollTop);
    for (let i = 0; i < 3; i++) {
      await f.page.getByRole('button', { name: new RegExp(`^添加 Candidate${i} 来源`) }).click();
      await expect(summary).toContainText(`已选 ${i + 1} 份`);
      await expect(f.page.getByRole('button', { name: new RegExp(`^已选 Candidate${i} 来源`) })).toBeDisabled();
    }
    expect(await scroll.evaluate(node => node.scrollTop)).toBe(initialScroll);
    await expect(summary.locator('button').filter({ hasText: '+1' })).toBeVisible();
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度');
    const top = await summary.boundingBox(), bottom = await footer.boundingBox();
    await scroll.evaluate(node => { node.scrollTop = node.scrollHeight; });
    const savedScroll = await scroll.evaluate(node => node.scrollTop);
    expect(savedScroll).toBeGreaterThan(0);
    expect(await summary.boundingBox()).toEqual(top); expect(await footer.boundingBox()).toEqual(bottom);
    const popup = (await f.page.locator('.lens-embedded-shell').boundingBox())!;
    expect(bottom!.y + bottom!.height).toBeLessThanOrEqual(popup.y + popup.height);
    await f.page.getByRole('button', { name: '查看其余 1 份文档', exact: true }).click();
    await expect(f.page.locator('.lens-draft-files>li')).toHaveCount(3);
    await expect(f.page.locator('.lens-draft-files>li').nth(2)).toBeFocused();
    await f.page.getByRole('button', { name: '返回添加文档', exact: true }).click();
    expect(await scroll.evaluate(node => node.scrollTop)).toBe(savedScroll);
    await f.page.getByRole('button', { name: '确认绑定', exact: true }).click();
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度 3/6');
  } finally { await f.close(); }
});

test('bound scopes use a searchable short-label list; Escape closes only the inner list and changes remain a draft', async () => {
  const f = await fixture(); try {
    const file = path.join(f.root, 'long-scope.md');
    await writeFile(file, '# ' + '很长的文档总标题'.repeat(12) + '\n\n## 接口验证\n- [x] checked\n\n## 其他范围\n- [ ] pending\n');
    await expand(f.page); await bind(f.page, file); await expect(f.page.locator('.lens-trigger')).toHaveText('进度 1/2');
    await f.page.getByRole('button', { name: '管理文档', exact: true }).click();
    await f.page.getByRole('button', { name: '管理已选文档', exact: true }).click();
    await expect(f.page.locator('.lens-draft-files>li')).toHaveCount(1);
    expect(await f.page.locator('.lens-draft-files>li').evaluate(node => getComputedStyle(node).borderBottomWidth)).toBe('0px');
    const scope = f.page.getByRole('button', { name: '计数范围 long-scope.md', exact: true });
    await expect(f.page.locator('.lens-document-manager select')).toHaveCount(0);
    await scope.click(); const search = f.page.getByRole('combobox');
    await search.fill('接口'); await expect(f.page.getByRole('option')).toHaveCount(1);
    await search.press('Escape'); await expect(f.page.getByRole('listbox')).toHaveCount(0);
    await expect(f.page.getByRole('dialog', { name: '任务清单', exact: true })).toBeVisible(); await expect(scope).toBeFocused();
    await scope.click(); await search.fill('接口'); await search.press('Enter');
    await expect(scope).toHaveText('接口验证');
    await expect(f.page.locator('.lens-change-summary')).toContainText('范围更改 1 份');
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度 1/2');
    expect(await f.page.locator('.lens-document-manager').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await f.page.getByRole('button', { name: '确认更改', exact: true }).click();
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度 1/1');
  } finally { await f.close(); }
});

test('failed additions are visible in the top summary and cancellation preserves saved progress', async () => {
  const f = await fixture(); try {
    const file = path.join(f.root, 'retained.md'), missing = path.join(f.root, 'missing.md'); await writeFile(file, '- [ ] pending\n- [x] done\n');
    await expand(f.page); await bind(f.page, file);
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度 1/2');
    await f.page.getByRole('button', { name: '管理文档', exact: true }).click();
    await f.page.getByLabel('本地绝对路径', { exact: true }).fill(missing);
    await f.page.getByRole('button', { name: '预览文件', exact: true }).click();
    const errors = f.page.getByRole('button', { name: '1 份需处理', exact: true }); await expect(errors).toBeVisible();
    await expect(f.page.getByRole('button', { name: '确认更改', exact: true })).toBeDisabled();
    await errors.click(); await expect(f.page.locator('.lens-draft-files>li').last()).toBeFocused();
    await expect(f.page.locator('.lens-draft-files').getByRole('alert')).toBeVisible();
    await f.page.getByRole('button', { name: '移除 missing.md', exact: true }).click();
    await expect(f.page.getByLabel('已选摘要', { exact: true })).toContainText('已选 1 份');
    await expect(f.page.getByRole('button', { name: '确认更改', exact: true })).toBeDisabled();
    await f.page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度 1/2');
    expect(await readFile(file, 'utf8')).toBe('- [ ] pending\n- [x] done\n');
  } finally { await f.close(); }
});

test('document summary and searchable scopes fit narrow light and dark popovers with duplicate filenames', async () => {
  const f = await fixture(); try {
    await f.page.setViewportSize({ width: 520, height: 740 });
    await f.page.locator('.pane').evaluate(node => { (node as HTMLElement).style.width = '390px'; });
    const files = ['one', 'two'].map(name => path.join(f.root, name, 'tasks.md'));
    for (const file of files) { await mkdir(path.dirname(file)); await writeFile(file, '# ' + '长文档标题'.repeat(12) + '\n\n## ' + '层级章节'.repeat(20) + '\n- [ ] task\n'); }
    await expand(f.page); await f.page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
    await f.page.getByLabel('本地绝对路径', { exact: true }).fill(files.join('\n'));
    await f.page.getByRole('button', { name: '预览文件', exact: true }).click();
    await expect(f.page.locator('.lens-selected-chips')).toContainText('one/tasks.md'); await expect(f.page.locator('.lens-selected-chips')).toContainText('two/tasks.md');
    await f.page.getByRole('button', { name: '管理已选文档', exact: true }).click();
    await f.page.getByRole('button', { name: '计数范围 one/tasks.md', exact: true }).click();
    for (const dark of [true, false]) {
      await f.page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
      await expect(f.page.locator('[data-task-lens-host]')).toHaveAttribute('data-theme', dark ? 'dark' : 'light');
      const geometry = await f.page.locator('.lens-document-manager').evaluate(node => {
        const top = node.querySelector('.lens-selected-summary')!.getBoundingClientRect(), foot = node.querySelector('.lens-manager-footer')!.getBoundingClientRect(), box = node.getBoundingClientRect();
        const menu = node.querySelector('.lens-scope-menu')!, menuBox = menu.getBoundingClientRect();
        return { fits: node.scrollWidth <= node.clientWidth && menu.scrollWidth <= menu.clientWidth, rails: top.top >= box.top && foot.bottom <= box.bottom, menuOpen: menu.matches(':popover-open'), menuClear: menuBox.bottom <= foot.top + 1, bg: getComputedStyle(node).backgroundColor };
      });
      expect(geometry.fits).toBe(true); expect(geometry.rails).toBe(true); expect(geometry.menuOpen).toBe(true); expect(geometry.menuClear).toBe(true); expect(geometry.bg).toBe(dark ? 'rgb(36, 37, 40)' : 'rgb(255, 255, 255)');
    }
  } finally { await f.close(); }
});

test('cancelling an in-flight preview cannot resurrect selected documents or write a binding', async () => {
  const f = await fixture(); let release: () => void = () => undefined;
  try {
    const file = path.join(f.root, 'late.md'); await writeFile(file, '- [ ] late task\n');
    let started = false, finished = false;
    const gate = new Promise<void>(resolve => { release = resolve; }), preview = f.service.preview.bind(f.service);
    f.service.preview = async (...args) => { started = true; await gate; try { return await preview(...args); } finally { finished = true; } };
    await expand(f.page); await f.page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
    await f.page.getByLabel('本地绝对路径', { exact: true }).fill(file);
    await f.page.getByRole('button', { name: '预览文件', exact: true }).click();
    await expect.poll(() => started).toBe(true);
    await f.page.getByRole('button', { name: '取消', exact: true }).click(); release();
    await expect.poll(() => finished).toBe(true);
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度'); expect(f.service.listMonitors()).toEqual([]);
    await f.page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
    await expect(f.page.getByLabel('已选摘要', { exact: true })).toContainText('已选 0 份');
    await expect(f.page.getByRole('button', { name: '确认绑定', exact: true })).toBeDisabled();
  } finally { release(); await f.close(); }
});


test('unified file entry previews one or many paths without a checkbox or implicit reads', async () => {
  const f = await fixture(); try {
    // Canonical inputs avoid macOS /var → /private/var aliases in the exact request-count assertion.
    const root = await realpath(f.root);
    const files = ['first.md', 'second.md'].map(name => path.join(root, name));
    for (const file of files) await writeFile(file, '- [ ] pending\n- [x] done\n');
    const authorized: string[] = [], previewed: string[] = [];
    const authorize = f.service.authorize.bind(f.service), preview = f.service.preview.bind(f.service);
    f.service.authorize = async (...args) => { authorized.push(args[0]); return authorize(...args); };
    f.service.preview = async (...args) => { previewed.push(args[3]); return preview(...args); };
    await expand(f.page); await f.page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
    const manual = f.page.getByRole('region', { name: '手动添加', exact: true });
    await expect(manual.getByRole('radio')).toHaveText(['文件', '目录']);
    await expect(manual.getByRole('radio', { name: '文件', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(manual.getByRole('checkbox')).toHaveCount(0);
    const input = manual.getByLabel('本地绝对路径', { exact: true }), action = manual.getByRole('button', { name: '预览文件', exact: true });
    await expect(action).toBeDisabled(); await input.fill(' \n \n'); await expect(action).toBeDisabled();
    await input.fill(files[0]!); await expect(action).toBeEnabled();
    expect(authorized).toEqual([]); expect(previewed).toEqual([]);
    await action.click(); await expect(f.page.getByLabel('已选摘要', { exact: true })).toContainText('已选 1 份');
    await input.fill(` ${files[0]}\r\n\r\n${files[1]}\n${files[1]}\n`); await action.click();
    await expect(f.page.getByLabel('已选摘要', { exact: true })).toContainText('已选 2 份');
    expect(authorized).toEqual(files); expect(previewed).toEqual(files);
    expect(f.service.listMonitors()).toEqual([]); await expect(f.page.locator('.lens-trigger')).toHaveText('进度');
    await f.page.getByRole('button', { name: '确认绑定', exact: true }).click();
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度 2/4');
  } finally { await f.close(); }
});

test('directory entry reads only after search click and does not bind discovered documents automatically', async () => {
  const f = await fixture(); try {
    await writeFile(path.join(f.workspace, 'docs/tasks/directory.md'), '# Directory candidate\n- [ ] task\n');
    const grants: { input: string; kind: string }[] = [];
    const authorize = f.service.authorize.bind(f.service);
    f.service.authorize = async (input, kind) => { grants.push({ input, kind }); return authorize(input, kind); };
    await expand(f.page); await f.page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
    const manual = f.page.getByRole('region', { name: '手动添加', exact: true });
    await manual.getByRole('radio', { name: '目录', exact: true }).click();
    const action = manual.getByRole('button', { name: '查找文档', exact: true });
    await expect(manual.getByRole('checkbox')).toHaveCount(0); await expect(action).toBeDisabled();
    await manual.getByLabel('本地绝对路径', { exact: true }).fill(f.workspace);
    await expect(action).toBeEnabled(); expect(grants).toEqual([]);
    await expect(f.page.locator('.lens-candidate')).toHaveCount(0);
    await action.click(); await expect(f.page.locator('.lens-candidate')).toHaveCount(1);
    expect(grants).toEqual([{ input: f.workspace, kind: 'directory' }]);
    await expect(f.page.getByLabel('已选摘要', { exact: true })).toContainText('已选 0 份');
    expect(f.service.listMonitors()).toEqual([]);
    await f.page.getByRole('button', { name: /^添加 Directory candidate 来源/ }).click();
    await expect(f.page.getByLabel('已选摘要', { exact: true })).toContainText('已选 1 份');
    expect(grants).toHaveLength(1);
    await f.page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度'); expect(f.service.listMonitors()).toEqual([]);
  } finally { await f.close(); }
});

test('selected chips remove saved bindings only on confirmation and never open management', async () => {
  const f = await fixture(true); try {
    const names = ['a-long-document-name-for-chip-truncation.md', 'b.md', 'c.md'];
    const files = names.map(name => path.join(f.workspace, 'docs/tasks', name));
    for (const file of files) await writeFile(file, '- [ ] pending\n- [x] done\n');
    await expand(f.page); await f.page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
    await f.page.getByLabel('本地绝对路径', { exact: true }).fill(files.join('\n'));
    await f.page.getByRole('button', { name: '预览文件', exact: true }).click();
    await expect(f.page.getByLabel('已选摘要', { exact: true })).toContainText('已选 3 份');
    await f.page.getByRole('button', { name: '确认绑定', exact: true }).click();
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度 3/6');
    await f.page.getByRole('button', { name: '管理文档', exact: true }).click();
    const summary = f.page.getByLabel('已选摘要', { exact: true });
    const remove = summary.getByRole('button', { name: `移除已选 ${names[0]}`, exact: true });
    await expect(remove).toBeVisible(); await expect(summary.locator('button button')).toHaveCount(0);
    await remove.focus(); await remove.press('Enter');
    await expect(f.page.locator('.lens-document-manager')).toHaveAttribute('data-page', 'add');
    await expect(summary).toContainText('已选 2 份'); await expect(summary).toContainText('c.md');
    await expect(summary.getByRole('button', { name: '移除已选 b.md', exact: true })).toBeFocused();
    await expect(f.page.locator('.lens-change-summary')).toContainText('移除 1 份');
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度 3/6');
    await f.page.getByRole('button', { name: '取消', exact: true }).click();
    await f.page.getByRole('button', { name: '管理文档', exact: true }).click();
    await expect(summary).toContainText('已选 3 份'); await remove.click();
    await f.page.getByRole('button', { name: '确认更改', exact: true }).click();
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度 2/4');
    for (const file of files) expect(await readFile(file, 'utf8')).toBe('- [ ] pending\n- [x] done\n');
  } finally { await f.close(); }
});

test('chip remove remains visible for long names and preserves final-binding confirmation', async () => {
  const f = await fixture(); try {
    await f.page.setViewportSize({ width: 520, height: 740 });
    await f.page.locator('.pane').evaluate(node => { (node as HTMLElement).style.width = '390px'; });
    const name = 'very-long-document-name-that-must-not-hide-the-remove-icon.md', file = path.join(f.root, name);
    await writeFile(file, '- [x] done\n'); await expand(f.page); await bind(f.page, file);
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度 1/1');
    await f.page.getByRole('button', { name: '管理文档', exact: true }).click();
    const chip = f.page.locator('.lens-selected-chip'), remove = chip.getByRole('button', { name: `移除已选 ${name}`, exact: true });
    for (const dark of [true, false]) {
      await f.page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
      await expect(f.page.locator('[data-task-lens-host]')).toHaveAttribute('data-theme', dark ? 'dark' : 'light');
      await expect(remove).toBeVisible();
      const outer = (await chip.boundingBox())!, icon = (await remove.boundingBox())!;
      expect(icon.width).toBeGreaterThanOrEqual(22); expect(icon.x + icon.width).toBeLessThanOrEqual(outer.x + outer.width);
      expect(await f.page.locator('.lens-selected-summary').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    await remove.click(); await expect(f.page.getByLabel('已选摘要', { exact: true })).toContainText('已选 0 份');
    await expect(f.page.getByRole('button', { name: '管理已选文档', exact: true })).toBeFocused();
    await expect(f.page.getByRole('button', { name: '确认解除', exact: true })).toBeDisabled();
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度 1/1');
    await f.page.getByRole('checkbox', { name: '确认解除此对话的全部文档绑定' }).check();
    await f.page.getByRole('button', { name: '确认解除', exact: true }).click();
    await expect(f.page.locator('.lens-trigger')).toHaveText('进度');
    expect(await readFile(file, 'utf8')).toBe('- [x] done\n');
  } finally { await f.close(); }
});

for (const via of ['close-button', 'trigger', 'escape', 'native-hide'] as const) {
  test(`closing a pinned popover via ${via} resets pinning before it reopens`, async () => {
    const f = await fixture(); try {
      const file = path.join(f.root, 'unpin.md'); await writeFile(file, '- [x] done\n- [ ] pending\n');
      await expand(f.page); await bind(f.page, file);
      const popup = f.page.locator('.lens-embedded-shell'), entry = f.page.locator('.lens-trigger');
      await f.page.getByLabel('固定浮窗', { exact: true }).click();
      await expect(f.page.getByLabel('取消固定浮窗', { exact: true })).toHaveAttribute('aria-pressed', 'true');
      if (via === 'close-button') await f.page.getByLabel('关闭任务清单', { exact: true }).click();
      else if (via === 'trigger') await entry.click();
      else if (via === 'escape') await f.page.getByLabel('关闭任务清单', { exact: true }).press('Escape');
      else await popup.evaluate(node => (node as HTMLElement).hidePopover());
      await expect(popup).not.toBeVisible();
      await entry.click();
      await expect(f.page.getByLabel('固定浮窗', { exact: true })).toHaveAttribute('aria-pressed', 'false');
      await expect(entry).toHaveText('进度 1/2');
      await f.page.getByLabel('输入', { exact: true }).click();
      await expect(popup).not.toBeVisible();
      expect(await readFile(file, 'utf8')).toBe('- [x] done\n- [ ] pending\n');
    } finally { await f.close(); }
  });
}

test('pin reset is synchronous even when close and reopen coalesce into one toggle event', async () => {
  const f = await fixture(); try {
    await expand(f.page); await f.page.getByLabel('固定浮窗', { exact: true }).click();
    const popup = f.page.locator('.lens-embedded-shell');
    await popup.evaluate(node => { (node as HTMLElement).hidePopover(); (node as HTMLElement).showPopover(); });
    await expect(popup).toBeVisible();
    await expect(f.page.getByLabel('固定浮窗', { exact: true })).toHaveAttribute('aria-pressed', 'false');
    await f.page.getByLabel('输入', { exact: true }).click(); await expect(popup).not.toBeVisible();
  } finally { await f.close(); }
});

test('Escape inside the section picker leaves the parent popover pinned', async () => {
  const f = await fixture(); try {
    const file = path.join(f.root, 'pinned-scope.md'); await writeFile(file, '# Tasks\n## Section\n- [ ] task\n');
    await expand(f.page); await bind(f.page, file); await f.page.getByLabel('固定浮窗', { exact: true }).click();
    await f.page.getByRole('button', { name: '管理文档', exact: true }).click();
    await f.page.getByRole('button', { name: '管理已选文档', exact: true }).click();
    await f.page.getByRole('button', { name: '计数范围 pinned-scope.md', exact: true }).click();
    await f.page.getByRole('combobox').press('Escape');
    await expect(f.page.getByRole('listbox')).toHaveCount(0);
    await expect(f.page.getByLabel('取消固定浮窗', { exact: true })).toHaveAttribute('aria-pressed', 'true');
    await f.page.getByLabel('输入', { exact: true }).click();
    await expect(f.page.locator('.lens-embedded-shell')).toBeVisible();
  } finally { await f.close(); }
});

for (const closeBy of ['button', 'trigger', 'escape', 'native', 'outside', 'rapid'] as const) {
  test(`closing via ${closeBy} forgets the floating position and reanchors on reopen`, async () => {
    const f = await fixture(); try {
      await f.page.setViewportSize({ width: 1200, height: 900 });
      await f.page.locator('.pane').evaluate(node => { (node as HTMLElement).style.width = '900px'; (node as HTMLElement).style.height = '780px'; });
      await expand(f.page);
      const popup = f.page.locator('.lens-embedded-shell'), entry = f.page.locator('.lens-trigger');
      await expect(popup).toBeVisible();
      await expect.poll(async () => (await popup.boundingBox())?.width).toBe(460);
      const anchored = (await popup.boundingBox())!;
      if (closeBy !== 'outside') await f.page.getByLabel('固定浮窗', { exact: true }).click();
      await f.page.getByLabel('移动进度浮窗', { exact: true }).focus();
      await f.page.keyboard.press('Shift+ArrowRight'); await f.page.keyboard.press('Shift+ArrowRight');
      await expect.poll(async () => Math.abs((await popup.boundingBox())!.x - anchored.x)).toBeGreaterThan(50);
      if (closeBy === 'button') await f.page.getByLabel('关闭任务清单', { exact: true }).click();
      else if (closeBy === 'trigger') await entry.click();
      else if (closeBy === 'escape') await f.page.keyboard.press('Escape');
      else if (closeBy === 'outside') await f.page.getByLabel('输入', { exact: true }).click();
      else await popup.evaluate(node => { (node as HTMLElement).hidePopover(); });
      if (closeBy !== 'rapid') await expect(popup).not.toBeVisible();
      await entry.click();
      await expect(f.page.getByLabel('固定浮窗', { exact: true })).toHaveAttribute('aria-pressed', 'false');
      await expect.poll(async () => Math.abs((await popup.boundingBox())!.x - anchored.x)).toBeLessThan(2);
      await expect.poll(async () => Math.abs((await popup.boundingBox())!.y - anchored.y)).toBeLessThan(2);
      await expect(popup).not.toHaveAttribute('data-dragging', 'true');
    } finally { await f.close(); }
  });
}
