import { test, expect } from '@playwright/test';
import { authenticatePage } from '../helpers/auth.js';
import {
  getGameState,
  getPhase,
  assertCombatScreen,
  assertNoStaleUI
} from '../helpers/dom-assertions.js';

/**
 * Visual regression tests for the combat screen.
 *
 * These tests authenticate, set up a full game run via API, navigate
 * into combat, and assert that the combat UI renders correctly with
 * the right number of enemy/ally sprites.
 */

const TEST_TEAM = ['hi', 'mizu', 'ki'];

/**
 * Drive the game into active combat via API calls from within the browser.
 * Flow: create player -> start run -> select area -> confirm creatures ->
 *       skill master -> proceed to encounter -> start creature encounter
 */
async function setupCombatViaAPI(page) {
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
  const createRes = await apiFetch('POST', '/api/game/create-player', { name: 'TestFighter' });
  expect(createRes.status).toBe(200);

  // 2. Enable debug mode so we can queue specific room types
  await apiFetch('POST', '/api/game/debug-mode', { enabled: true });

  // 3. Start a bare run
  const startRes = await apiFetch('POST', '/api/game/start-run', {});
  expect(startRes.status).toBe(200);

  // 4. Queue an encounter room so we get combat
  await apiFetch('POST', '/api/game/debug-queue-rooms', { rooms: ['encounter'] });

  // 5. Get area options and select area
  const areaOptions = await apiFetch('GET', '/api/game/area-options');
  expect(areaOptions.status).toBe(200);
  const areaId = areaOptions.body?.[0]?.id;
  expect(areaId).toBeTruthy();

  const selectRes = await apiFetch('POST', '/api/game/select-area', { areaId });
  expect(selectRes.status).toBe(200);

  // 6. Confirm creatures
  const confirmRes = await apiFetch('POST', '/api/game/confirm-creatures', {
    starterIds: TEST_TEAM
  });
  expect(confirmRes.status).toBe(200);

  // 7. Handle initial skill master pick
  const offersRes = await apiFetch('POST', '/api/game/skill-master-offers', {});
  if (offersRes.status === 200 && offersRes.body?.offered?.length > 0) {
    await apiFetch('POST', '/api/game/skill-master-choose', {
      skillId: offersRes.body.offered[0].id
    });
  }

  // 8. Check current state; if not at encounter room, proceed
  let stateRes = await apiFetch('GET', '/api/game/state');
  if (stateRes.body?.room?.type !== 'encounter') {
    await apiFetch('POST', '/api/game/proceed', {});
  }

  // 9. Start the creature encounter to enter combat
  const encounterRes = await apiFetch('POST', '/api/game/start-creature-encounter', {});
  expect(encounterRes.status).toBe(200);

  return encounterRes.body?.state;
}

test.describe('Combat screen', () => {

  test.beforeEach(async ({ page, request }) => {
    await authenticatePage(page, request);
  });

  test('combat UI has correct enemy/ally counts matching state', async ({ page }) => {
    // Navigate to game
    await page.goto('/');

    // Set up combat via API
    const initialState = await setupCombatViaAPI(page);
    expect(initialState?.combat).toBeTruthy();

    // Reload to let the frontend render the combat state
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for game to initialize into combat phase
    await page.waitForFunction(
      () => typeof window.__gamePhase === 'function' && window.__gamePhase() === 'combat',
      { timeout: 10000 }
    );

    const phase = await getPhase(page);
    expect(phase).toBe('combat');

    // Assert combat screen renders correctly: action area, battle stage,
    // correct enemy and ally sprite counts
    await assertCombatScreen(page);

    // Verify counts from game state match DOM
    const state = await getGameState(page);
    expect(state.combat).toBeTruthy();

    const aliveEnemies = state.combat.enemies?.filter(e => e.hp > 0).length ?? 0;
    const aliveAllies = state.combat.allies?.filter(a => a.hp > 0).length ?? 0;

    expect(aliveEnemies).toBeGreaterThan(0);
    expect(aliveAllies).toBeGreaterThan(0);

    // Double-check that the DOM sprite counts match
    if (aliveEnemies > 0) {
      const enemySprites = page.locator('#enemy-formation .formation-slot .formation-sprite:visible');
      await expect(enemySprites).toHaveCount(aliveEnemies);
    }

    if (aliveAllies > 0) {
      const allySprites = page.locator('#player-formation .formation-slot .formation-sprite:visible');
      await expect(allySprites).toHaveCount(aliveAllies);
    }
  });

});
