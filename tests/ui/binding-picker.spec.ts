import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4174/picker.html'); });
test('requires authorization, previews scope and commits once only after confirmation', async ({ page }) => {
  await page.getByLabel('本地绝对路径', { exact: true }).fill('/fixture/task.md');
  await expect(page.getByRole('button', { name: '授权并预览', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '授权并预览', exact: true }).click();
  await expect(page.getByRole('region', { name: '绑定预览' })).toContainText('1 / 2 已完成');
  await page.getByLabel('计数范围', { exact: true }).selectOption({ label: '实施' });
  await expect(page.getByRole('region', { name: '绑定预览' })).toContainText('1 / 1 已完成');
  await expect(page.getByTestId('commits')).toHaveText('0');
  await page.getByRole('button', { name: '确认更换绑定', exact: true }).click(); await expect(page.getByTestId('picker-result')).toHaveText('已提交'); await expect(page.getByTestId('commits')).toHaveText('1');
});
test('shows sources and partial scans; a late preview cannot replace the newer selection', async ({ page }) => {
  await page.getByLabel('路径类型', { exact: true }).selectOption('directory'); await page.getByLabel('本地绝对路径', { exact: true }).fill('/fixture'); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '授权并查找', exact: true }).click();
  await expect(page.getByText('扫描结果不完整，请缩小范围。')).toBeVisible(); await expect(page.getByRole('region', { name: '候选文档' })).toContainText('来源：目录扫描');
  await page.getByRole('button', { name: /slow 文档/ }).click(); await page.getByRole('button', { name: /fast 文档/ }).click();
  await expect(page.getByRole('region', { name: '绑定预览' })).toContainText('/fixture/fast.md'); await page.waitForTimeout(550); await expect(page.getByRole('region', { name: '绑定预览' })).not.toContainText('/fixture/slow.md');
});
test('cancel and view changes do not submit or reuse old previews', async ({ page }) => {
  await page.getByLabel('本地绝对路径', { exact: true }).fill('/fixture/slow.md'); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '授权并预览', exact: true }).click();
  await page.getByRole('button', { name: '切换视图', exact: true }).click(); await page.waitForTimeout(550); await expect(page.getByRole('region', { name: '绑定预览' })).toHaveCount(0);
  await page.getByRole('button', { name: '取消', exact: true }).click(); await expect(page.getByTestId('picker-result')).toHaveText('已取消'); await expect(page.getByTestId('commits')).toHaveText('0');
});
test('permission and version failures keep the original binding and remain actionable', async ({ page }) => {
  await page.getByLabel('本地绝对路径', { exact: true }).fill('/fixture/denied.md'); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '授权并预览', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('授权被拒绝');
  await page.getByLabel('本地绝对路径', { exact: true }).fill('/fixture/task.md'); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '授权并预览', exact: true }).click(); await expect(page.getByRole('region', { name: '绑定预览' })).toBeVisible();
  await page.getByRole('button', { name: '模拟版本冲突', exact: true }).click(); await page.getByRole('button', { name: '确认更换绑定', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('绑定已被另一窗口更新'); await expect(page.getByTestId('commits')).toHaveText('0');
});
