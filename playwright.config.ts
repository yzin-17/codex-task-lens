import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: true,
  forbidOnly: !!process.env.CI, retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  use: { browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
  reporter: [['list'], ['html', { open: 'never' }]],
});
