import { test, expect } from '@playwright/test';
test('production React bundle mounts in a real browser', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await expect(page.getByRole('heading', { name: 'Codex Task Lens', exact: true })).toBeVisible();
});
