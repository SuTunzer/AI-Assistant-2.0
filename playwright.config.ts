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
      // Bundled Chromium needs the fake UI flag as well; without it
      // getUserMedia rejects with NotSupportedError and the recording tests
      // fail on Linux CI while passing against installed Chrome locally.
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
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
