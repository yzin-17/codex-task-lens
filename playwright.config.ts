import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: true,
  forbidOnly: !!process.env.CI, retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  use: { browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
  reporter: [['list'], ['html', { open: 'never' }]],
});
