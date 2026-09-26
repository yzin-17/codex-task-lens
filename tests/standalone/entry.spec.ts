import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { launchStandalone } from './runtime-helper.js';
test.use({ trace: 'off' });
test('compiled standalone runtime grants, previews, binds and cancels without Codex', async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lens-entry-')); const file = path.join(root, 'tasks.md'); await writeFile(file, '# 实施\n- [x] 已完成事项\n- [ ] 未完成事项\n');
  const runtime = await launchStandalone(path.join(root, 'state'));
  try {
    await page.goto(runtime.url); await expect(page.getByRole('heading', { name: 'Codex Task Lens', exact: true })).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toBe('');
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    await page.getByRole('button', { name: '选择文档', exact: true }).click(); await page.getByLabel('本地绝对路径', { exact: true }).fill(file); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '授权并预览', exact: true }).click();
    await expect(page.getByRole('region', { name: '绑定预览' })).toContainText('1 / 2 已完成');
    await page.getByRole('button', { name: '确认绑定', exact: true }).click(); await expect(page.getByRole('region', { name: '已完成', exact: true })).toContainText('已完成事项'); await expect(page.getByRole('region', { name: '未完成', exact: true })).toContainText('未完成事项');
    await page.getByRole('button', { name: '更换文档', exact: true }).click(); await page.getByRole('button', { name: '取消', exact: true }).click(); await expect(page.getByText('1 / 2 已完成', { exact: true })).toBeVisible();
    expect(await readFile(file, 'utf8')).toBe('# 实施\n- [x] 已完成事项\n- [ ] 未完成事项\n');
  } finally { await page.close(); await runtime.stop(); await rm(root, { recursive: true, force: true }); }
});
