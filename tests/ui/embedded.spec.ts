import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BindingStore } from '../../src/store/binding-store.js';
import { LensService } from '../../src/host/lens-service.js';
import { CdpSession } from '../../src/adapters/codex/cdp/session.js';
import { CdpBridge } from '../../src/host/cdp-bridge/bridge.js';
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'lens-real-cdp-'));
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
  // Test-only revalidator for the controlled Chromium process; production uses the macOS signed-app verifier.
  const session = await CdpSession.connect(target.webSocketDebuggerUrl, async () => { expect(new URL(target.webSocketDebuggerUrl).hostname).toBe('127.0.0.1'); });
  const store = await BindingStore.open(path.join(root, 'state')), service = new LensService(store);
  const options = { sourceId: 'fixture', bundle: await readFile('dist/inject/task-lens.js', 'utf8'), styles: await readFile('dist/inject/task-lens.css', 'utf8'), refreshMs: 40 };
  let bridge = await CdpBridge.attach(session, service, options);
  return { root, page, session, service, bridge: () => bridge, reattach: async () => { await bridge.close(); bridge = await CdpBridge.attach(session, service, options); }, close: async () => { await bridge.close(); session.close(); await context.close(); await service.close(); await store.close(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); } };
}
async function expand(page: Page) { await page.getByLabel('展开任务清单', { exact: true }).first().click(); }
async function bind(page: Page, file: string) {
  await page.getByRole('button', { name: '绑定 Task 文档', exact: true }).click();
  await page.getByLabel('本地绝对路径', { exact: true }).fill(file);
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '授权并预览', exact: true }).click();
  await page.getByRole('button', { name: '确认绑定', exact: true }).click();
}
test('real CDP + shared service + React: bind, watch atomic saves and isolate A→B→A', async () => {
  const f = await fixture(); try {
    const one = path.join(f.root, 'one.md'), two = path.join(f.root, 'two.md'); await writeFile(one, '- [ ] alpha\n- [x] already\n'); await writeFile(two, '- [ ] beta\n');
    await expand(f.page); await bind(f.page, one); await expect(f.page.getByText('alpha', { exact: true })).toBeVisible();
    await writeFile(one + '.tmp', '- [x] alpha\n- [x] already\n'); await rename(one + '.tmp', one);
    await expect(f.page.locator('.lens-task-count')).toContainText('2 / 2');
    await f.page.locator('.pane').evaluate((element, id) => element.setAttribute('data-thread-id', id), b);
    await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(1); await expand(f.page); await bind(f.page, two);
    await expect(f.page.getByText('beta', { exact: true })).toBeVisible(); await expect(f.page.getByText('alpha', { exact: true })).toHaveCount(0);
    await f.page.locator('.pane').evaluate((element, id) => element.setAttribute('data-thread-id', id), a);
    await expand(f.page); await expect(f.page.getByText('alpha', { exact: true })).toBeVisible(); await expect(f.page.getByText('beta', { exact: true })).toHaveCount(0);
    expect(await f.page.evaluate(() => Object.keys(globalThis).filter(key => key.startsWith('__taskLens_')))).toEqual([]);
    expect(await readFile(one, 'utf8')).toBe('- [x] alpha\n- [x] already\n');
  } finally { await f.close(); }
});
test('conflicting identities never display another task; controls and uninstall remain intact', async () => {
  const f = await fixture(); try {
    await f.page.locator('.pane').evaluate((element, id) => element.setAttribute('data-conversation-id', id), b);
    await expect(f.page.getByText('未识别到当前对话；未显示其他对话的任务')).toBeVisible();
    await f.page.getByLabel('输入', { exact: true }).fill('untouched input'); await f.page.locator('#send').click(); await f.page.locator('#approve').click();
    await expect(f.page.locator('body')).toHaveAttribute('data-sent', 'yes'); await expect(f.page.locator('body')).toHaveAttribute('data-approved', 'yes');
    await f.bridge().close(); await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(0);
    expect(f.service.resources().subscribers).toBe(0); await expect(f.page.getByLabel('输入', { exact: true })).toHaveValue('untouched input');
  } finally { await f.close(); }
});
test('separate panes, page reload and repeated remounts release all tool roots', async () => {
  test.setTimeout(60000); const f = await fixture(); try {
    await f.page.locator('main').evaluate((element, id) => { const region = document.createElement('section'); region.className = 'pane'; region.setAttribute('data-thread-id', id); region.innerHTML = '<div data-composer-root><textarea aria-label="second"></textarea></div>'; element.append(region); }, b);
    await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(2);
    await f.page.reload(); await expect.poll(() => f.bridge().isClosed).toBe(true); await f.reattach();
    await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(1);
    for (let i = 0; i < 50; i++) { await f.reattach(); await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(1); }
    await f.bridge().close(); await expect(f.page.locator('[data-task-lens-host]')).toHaveCount(0); expect(f.service.resources().subscribers).toBe(0);
  } finally { await f.close(); }
});
