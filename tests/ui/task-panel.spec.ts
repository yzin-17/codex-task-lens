import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4174'); });
test('shows both groups by default, retains details and allows independent collapse', async ({ page }) => {
  await expect(page.getByText('1 / 3 已完成', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '未完成', exact: true })).toContainText('检查更新');
  await expect(page.getByRole('region', { name: '已完成', exact: true })).toContainText('读取任务文件');
  await page.getByText('读取任务文件', { exact: false }).first().click();
  await expect(page.getByText('源位置：第 3–4 行')).toBeVisible();
  await expect(page.getByText('验证：通过', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '已完成 · 1', exact: true }).click();
  await expect(page.getByText('源位置：第 3–4 行')).not.toBeVisible();
  await expect(page.getByText('检查更新', { exact: true })).toBeVisible();
});
test('uses honest zero, complete and cached failure labels', async ({ page }) => {
  await page.getByRole('button', { name: '零任务', exact: true }).click(); await expect(page.getByText('所选范围没有任务清单')).toBeVisible(); await expect(page.getByText('清单已全部勾选', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: '全部勾选', exact: true }).click(); await expect(page.getByText('清单已全部勾选', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '源删除', exact: true }).click(); await expect(page.getByText('显示最近成功读取的缓存', { exact: false })).toBeVisible(); await expect(page.getByText('清单已全部勾选', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0); await expect(page.locator('body')).not.toContainText('项目已验收');
});
test('treats Markdown as text, never executes or fetches embedded content', async ({ page }) => {
  let foreign = 0; page.on('request', request => { if (request.url().includes('evil.invalid')) foreign++; });
  await page.getByText('<img src=', { exact: false }).click();
  await expect(page.getByText('[运行](javascript:alert(1))', { exact: false })).toBeVisible();
  expect(foreign).toBe(0); await expect(page.locator('img')).toHaveCount(0);
});
test('supports keyboard, preserves focus on refresh and fits light/dark narrow layouts', async ({ page }) => {
  const collapse = page.getByRole('button', { name: '未完成 · 2', exact: true }); await collapse.focus(); await page.keyboard.press('Enter'); await expect(collapse).toHaveAttribute('aria-expanded', 'false');
  const update = page.getByRole('button', { name: '普通更新', exact: true }); await update.click(); await expect(update).toBeFocused();
  for (const colorScheme of ['light', 'dark'] as const) { await page.emulateMedia({ colorScheme }); await page.setViewportSize({ width: 320, height: 800 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); }
});
