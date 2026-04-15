import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '..',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    // Match the existing .mcp.json WebKit iPhone config
    browserName: 'webkit',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 15000,
    cwd: '../..',
  },
});
