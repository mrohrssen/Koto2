import { test, expect } from '@playwright/test';
import { authenticatePage } from '../helpers/auth.js';
import {
  getGameState,
  getPhase,
  assertExplorationScreen,
  assertNoStaleUI
} from '../helpers/dom-assertions.js';

/**
 * Visual regression tests for the exploration screen.
 *
 * These tests authenticate via HTTP, seed a player + run via API calls,
 * then navigate to the game and assert the exploration UI renders correctly.
 */

const API_HEADERS = { 'Content-Type': 'application/json' };

/** Common creature IDs that exist in data/creatures.json */
const TEST_TEAM = ['hi', 'mizu', 'ki'];

/**
 * Drive the game into exploring phase via API calls from within the browser.
 * Uses page.evaluate + fetch to hit the server with the auth token already
 * stored in localStorage.
 */
async function setupExplorationViaAPI(page) {
  // Helper: make an authenticated API call from within the page
  const apiFetch = async (method, path, body) => {
    return page.evaluate(async ({ method, path, body }) => {
      const token = localStorage.getItem('authToken');
      const res = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: body ? JSON.stringify(body) : undefined
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    }, { method, path, body });
  };

  // 1. Create player
  const createRes = await apiFetch('POST', '/api/game/create-player', { name: 'TestExplorer' });
  expect(createRes.status).toBe(200);

  // 2. Start a bare run (no creatures yet)
  const startRes = await apiFetch('POST', '/api/game/start-run', {});
  expect(startRes.status).toBe(200);

  // 3. Get area options and select the first one
  const areaOptions = await apiFetch('GET', '/api/game/area-options');
  expect(areaOptions.status).toBe(200);
  const areaId = areaOptions.body?.[0]?.id;
  expect(areaId).toBeTruthy();

  const selectRes = await apiFetch('POST', '/api/game/select-area', { areaId });
  expect(selectRes.status).toBe(200);

  // 4. Confirm creatures
  const confirmRes = await apiFetch('POST', '/api/game/confirm-creatures', {
    starterIds: TEST_TEAM
  });
  expect(confirmRes.status).toBe(200);

  // 5. Handle initial skill master pick (appears after confirm-creatures)
  const offersRes = await apiFetch('POST', '/api/game/skill-master-offers', {});
  if (offersRes.status === 200 && offersRes.body?.offered?.length > 0) {
    await apiFetch('POST', '/api/game/skill-master-choose', {
      skillId: offersRes.body.offered[0].id
    });
  }

  return confirmRes.body?.state;
}

test.describe('Exploration screen', () => {

  test.beforeEach(async ({ page, request }) => {
    await authenticatePage(page, request);
  });

  test('exploration UI shows with no combat elements', async ({ page }) => {
    // Navigate to the game (triggers frontend init + state load)
    await page.goto('/');

    // Set up the game state via API calls from within the page context
    await setupExplorationViaAPI(page);

    // Reload to let the frontend pick up the new state
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for the game to initialize and expose __gamePhase
    await page.waitForFunction(
      () => typeof window.__gamePhase === 'function' && window.__gamePhase() !== 'unknown',
      { timeout: 10000 }
    );

    const phase = await getPhase(page);
    // Phase should be one of the exploration-like phases (room, exploring, etc.)
    // It should NOT be 'combat'
    expect(phase).not.toBe('combat');
    expect(phase).not.toBe('no_save');

    // Assert exploration screen renders correctly
    await assertExplorationScreen(page);

    // Assert no stale combat UI is leaking
    await assertNoStaleUI(page, phase);
  });

  test('creature sprites match game state party count', async ({ page }) => {
    // Navigate and set up
    await page.goto('/');
    await setupExplorationViaAPI(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for game to initialize
    await page.waitForFunction(
      () => typeof window.__gameState === 'function' && window.__gameState()?.run != null,
      { timeout: 10000 }
    );

    const state = await getGameState(page);
    expect(state).toBeTruthy();
    expect(state.run).toBeTruthy();

    // Get the number of active creatures in the party from game state
    const partyCount = state.run?.creatureParty?.active?.length ?? 0;
    expect(partyCount).toBeGreaterThan(0);

    // The player formation should have visible sprite slots matching the party count.
    // In exploration, the player formation renders party creature sprites.
    const playerFormation = page.locator('#player-formation .formation-slot .formation-sprite:visible');
    // Wait briefly for formation sprites to render
    await page.waitForTimeout(1000);

    const visibleCount = await playerFormation.count();
    expect(visibleCount).toBe(partyCount);
  });

});
