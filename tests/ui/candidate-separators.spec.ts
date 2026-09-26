import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
for (const count of [0, 1, 3]) test(`candidate list with ${count} documents only separates adjacent items`, async ({ page }) => {
  await page.setContent(`<section class="lens-document-manager"><section>${'<article class="lens-candidate">Document</article>'.repeat(count)}</section><section class="lens-manual-add">Manual</section></section>`);
  await page.addStyleTag({ content: await readFile('src/ui/components/binding-picker/document-manager.css', 'utf8') });
  const borders = await page.locator('.lens-candidate').evaluateAll(nodes => nodes.map(node => ({ top: getComputedStyle(node).borderTopWidth, bottom: getComputedStyle(node).borderBottomWidth })));
  expect(borders).toEqual(Array.from({ length: count }, (_, index) => ({ top: index ? '1px' : '0px', bottom: '0px' })));
  await expect(page.locator('.lens-manual-add')).toHaveCSS('border-top-width', '1px');
});
