import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: true,
  forbidOnly: !!process.env.CI, retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  use: { browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
  webServer: [
    { command: `${JSON.stringify(process.execPath)} node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort`, url: 'http://127.0.0.1:4173', reuseExistingServer: false },
    { command: `${JSON.stringify(process.execPath)} node_modules/vite/bin/vite.js --config vite.fixtures.config.ts`, url: 'http://127.0.0.1:4174', reuseExistingServer: false }
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
