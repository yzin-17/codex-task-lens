import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rename, unlink, rm } from 'node:fs/promises';
import path from 'node:path'; import os from 'node:os';
import { launchStandalone } from './runtime-helper.js';
test.use({ trace: 'off' });
async function selectFile(page: Page, file: string) {
  await page.getByRole('button', { name: /^(选择文档|更换文档)$/ }).click();
  await page.getByLabel('本地绝对路径', { exact: true }).fill(file); await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '授权并预览', exact: true }).click(); await expect(page.getByRole('region', { name: '绑定预览' })).toBeVisible();
}
async function confirm(page: Page) { await page.getByRole('button', { name: /^(确认绑定|确认更换绑定)$/ }).click(); await expect(page.getByRole('region', { name: '选择 Task 文档' })).toHaveCount(0); }
test('I1 real file changes, atomic save, process restart, deletion and recovery', async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lens-flow-')), file = path.join(root, 'tasks.md'), state = path.join(root, 'state');
  const initial = '# 当前任务\n\n- [x] 完成 A\n- [ ] 实施 B\n'; await writeFile(file, initial);
  let runtime = await launchStandalone(state);
  try {
    await page.goto(runtime.url); await selectFile(page, file); await confirm(page);
    await expect(page.getByText('1 / 2 已完成', { exact: true })).toBeVisible();
    await writeFile(file, initial.replace('- [ ] 实施 B', '- [x] 实施 B'));
    await expect(page.getByText('2 / 2 已完成', { exact: true })).toBeVisible(); await expect(page.getByText('清单已全部勾选', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '已完成', exact: true })).toContainText('实施 B'); await expect(page.getByRole('region', { name: '未完成', exact: true })).not.toContainText('实施 B');
    const expanded = initial + '- [ ] 新增 C\n'; await writeFile(file + '.tmp', expanded); await rename(file + '.tmp', file);
    await expect(page.getByText('1 / 3 已完成', { exact: true })).toBeVisible(); expect(await readFile(file, 'utf8')).toBe(expanded);
    await runtime.stop(); await expect(page.getByText('本地连接已断开，正在重连', { exact: false })).toBeVisible();
    runtime = await launchStandalone(state); await page.goto(runtime.url); await expect(page.getByText('1 / 3 已完成', { exact: true })).toBeVisible();
    await unlink(file); await expect(page.getByText('显示最近成功读取的缓存', { exact: false })).toBeVisible(); await expect(page.getByText('1 / 3 已完成 · 缓存', { exact: true })).toBeVisible();
    await writeFile(file, initial); await expect(page.getByText('1 / 2 已完成', { exact: true })).toBeVisible(); await expect(page.getByText('显示最近成功读取的缓存', { exact: false })).not.toBeVisible();
    const other = path.join(root, 'other.md'); await writeFile(other, '- [x] 其他任务'); await selectFile(page, other); await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('.lens-document-meta')).toContainText(file); await expect(page.locator('.lens-document-meta')).not.toContainText('other.md'); expect(await readFile(file, 'utf8')).toBe(initial);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  } finally { await page.close(); await runtime.stop(); await rm(root, { recursive: true, force: true }); }
});
test('I1 chapter scopes count only leaves and never widen when the heading disappears', async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lens-scope-')), file = path.join(root, 'tasks.md');
  const source = '# 项目\n## 实施\n- [ ] 分组\n  - [x] 子任务 A\n  - [ ] 子任务 B\n## 其他\n- [x] 不在范围内\n'; await writeFile(file, source);
  const runtime = await launchStandalone(path.join(root, 'state'));
  try {
    await page.goto(runtime.url); await selectFile(page, file); await expect(page.getByRole('region', { name: '绑定预览' })).toContainText('2 / 3 已完成');
    await page.getByLabel('计数范围', { exact: true }).selectOption({ label: '项目 / 实施' }); await expect(page.getByRole('region', { name: '绑定预览' })).toContainText('1 / 2 已完成'); await confirm(page);
    await expect(page.getByText('1 / 2 已完成', { exact: true })).toBeVisible(); await expect(page.getByRole('region', { name: '任务清单', exact: true })).not.toContainText('不在范围内');
    await writeFile(file, source.replace('## 实施', '## 实施新版')); await expect(page.getByText('所选章节已变化，请重新选择', { exact: false })).toBeVisible(); await expect(page.getByText('1 / 2 已完成 · 缓存', { exact: true })).toBeVisible();
  } finally { await page.close(); await runtime.stop(); await rm(root, { recursive: true, force: true }); }
});
test('I1 explicit monitor selection isolates document state during repeated switches', async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lens-monitors-')), a = path.join(root, 'a.md'), b = path.join(root, 'b.md');
  await writeFile(a, '- [ ] 文档 A'); await writeFile(b, '- [x] 文档 B'); const runtime = await launchStandalone(path.join(root, 'state'));
  try {
    await page.goto(runtime.url); await selectFile(page, a); await confirm(page); await expect(page.getByText('0 / 1 已完成', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '新增独立文档', exact: true }).click(); await expect(page.getByText('文档 A', { exact: true })).not.toBeVisible(); await selectFile(page, b); await confirm(page); await expect(page.getByText('1 / 1 已完成', { exact: true })).toBeVisible();
    const select = page.getByLabel('当前查看', { exact: true }); const bValue = await select.inputValue();
    for (let i = 0; i < 3; i++) { await select.selectOption({ label: '独立文档 · 默认 · a.md' }); await expect(page.getByText('0 / 1 已完成', { exact: true })).toBeVisible(); await expect(page.locator('.lens-document-meta')).toContainText(a); await select.selectOption(bValue); await expect(page.getByText('1 / 1 已完成', { exact: true })).toBeVisible(); await expect(page.locator('.lens-document-meta')).toContainText(b); }
    expect(await readFile(a, 'utf8')).toBe('- [ ] 文档 A'); expect(await readFile(b, 'utf8')).toBe('- [x] 文档 B');
  } finally { await page.close(); await runtime.stop(); await rm(root, { recursive: true, force: true }); }
});
