import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream'],
      ...(process.platform === 'win32' ? { channel: 'chrome' } : {}),
    },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1040 } } },
    { name: 'android', use: { ...devices['Galaxy S9+'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
