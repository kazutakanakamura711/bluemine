import { defineConfig, devices } from '@playwright/test';
import { browserE2E, rootDirectory } from './e2e/environment.mjs';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: browserE2E.webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      name: 'API',
      command: 'node e2e/serve.mjs api',
      cwd: rootDirectory,
      url: `${browserE2E.apiUrl}/api/health`,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      name: 'Web',
      command: 'node e2e/serve.mjs web',
      cwd: rootDirectory,
      url: `${browserE2E.webUrl}/login`,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
