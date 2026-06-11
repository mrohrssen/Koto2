/**
 * Playwright config for the Kanji Kombat subway harness.
 *
 * Uses non-default ports (API=3099, Vite=5199) so the harness can run
 * alongside a dev server already occupying the standard 3000/5173 ports.
 * Set SUBWAY_API_PORT / SUBWAY_VITE_PORT to override if those are taken too.
 */
import { defineConfig } from '@playwright/test';

const API_PORT = parseInt(process.env.SUBWAY_API_PORT || '3099', 10);
const VITE_PORT = parseInt(process.env.SUBWAY_VITE_PORT || '5199', 10);

export default defineConfig({
  testDir: '..',
  timeout: 600_000,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${VITE_PORT}`,
    browserName: 'webkit',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
  },
  webServer: {
    command: `PORT=${API_PORT} VITE_API_PORT=${API_PORT} VITE_PORT=${VITE_PORT} npm run dev`,
    url: `http://127.0.0.1:${VITE_PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
    cwd: '../..',
  },
});
