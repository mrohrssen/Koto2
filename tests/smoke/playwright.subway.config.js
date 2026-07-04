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
    // Bound individual actions. Playwright's default actionTimeout is 0 (no limit),
    // so a click on an element that never becomes actionable (e.g. a dialogue button
    // detaching while its card re-renders) hangs until the 600s TEST timeout — a
    // silent freeze. Capping it turns such a stall into a fast, precise failure that
    // names the selector, instead of a mislabeled test-level timeout. Generous enough
    // that legitimately slow-but-actionable taps still succeed.
    actionTimeout: 15_000,
  },
  webServer: {
    command: `PORT=${API_PORT} VITE_API_PORT=${API_PORT} VITE_PORT=${VITE_PORT} npm run dev`,
    url: `http://127.0.0.1:${VITE_PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
    cwd: '../..',
    // Surface the game server's console in the harness log. `npm run dev` runs
    // concurrently(server, vite), which merges the child streams into ITS stdout;
    // without piping, the server-side [Exploration] / [Shrine] / [ExploreSync]
    // lines are dropped. Harness-only and zero-cost (no effect on the app or
    // production) — kept for future gate triage; the transcript-mismatch tracing
    // it once carried was reverted with the rest of the diagnostics.
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
