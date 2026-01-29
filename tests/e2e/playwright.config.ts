import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries - tests must be deterministic
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list', { printSteps: true }]
  ],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  globalSetup: './setup/global-setup.ts',
  globalTeardown: './setup/global-teardown.ts',

  projects: [
    {
      name: 'rooms',
      testMatch: /rooms\/.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'features',
      testMatch: /features\/.*\.spec\.ts$/,
      dependencies: ['rooms'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'integration',
      testMatch: /integration\/.*\.spec\.ts$/,
      dependencies: ['rooms', 'features'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: { NODE_ENV: 'test' },
  },
});
