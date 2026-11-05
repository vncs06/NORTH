import { defineConfig, devices } from '@playwright/test';
import { configuredE2ePorts } from './packages/testing/src/e2e-ports.js';

const ports = configuredE2ePorts();
const webOrigin = `http://localhost:${ports.web}`;
const apiOrigin = `http://localhost:${ports.api}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'npm run start:e2e:api',
      url: `${apiOrigin}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run start:e2e:web',
      url: `${webOrigin}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
