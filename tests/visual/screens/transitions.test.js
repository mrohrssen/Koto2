import { test, expect } from '@playwright/test';
import { authenticatePage } from '../helpers/auth.js';
import {
  getGameState,
  getPhase,
  assertExplorationScreen,
  assertCombatScreen,
  assertNoStaleUI
} from '../helpers/dom-assertions.js';

/**
 * Visual regression tests for phase transitions.
 *
 * Tests that UI elements are properly cleaned up when transitioning
 * between exploration and combat phases, with no stale UI leaking.
 */

const TEST_TEAM = ['hi', 'mizu', 'ki'];

/**
 * Make an authenticated API call from within the browser page context.
 */
async function apiFetch(page, method, path, body) {
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
}

/**
 * Bootstrap a player into an exploration run with debug mode enabled.
 */
async function setupExplorationRun(page) {
  const createRes = await apiFetch(page, 'POST', '/api/game/create-player', { name: 'TestTransition' });
  expect(createRes.status).toBe(200);

  // Enable debug mode for room queueing
  await apiFetch(page, 'POST', '/api/game/debug-mode', { enabled: true });

  // Start bare run
  const startRes = await apiFetch(page, 'POST', '/api/game/start-run', {});
  expect(startRes.status).toBe(200);

  // Queue an encounter room so we can transition into combat later
  await apiFetch(page, 'POST', '/api/game/debug-queue-rooms', { rooms: ['encounter'] });

  // Select area
  const areaOptions = await apiFetch(page, 'GET', '/api/game/area-options');
  const areaId = areaOptions.body?.[0]?.id;
  expect(areaId).toBeTruthy();
  await apiFetch(page, 'POST', '/api/game/select-area', { areaId });

  // Confirm creatures
  await apiFetch(page, 'POST', '/api/game/confirm-creatures', { starterIds: TEST_TEAM });

  // Handle initial skill master pick
  const offersRes = await apiFetch(page, 'POST', '/api/game/skill-master-offers', {});
  if (offersRes.status === 200 && offersRes.body?.offered?.length > 0) {
    await apiFetch(page, 'POST', '/api/game/skill-master-choose', {
      skillId: offersRes.body.offered[0].id
    });
  }
}

/**
 * Wait for the game frontend to settle into a specific phase.
 */
async function waitForPhase(page, expectedPhase, timeoutMs = 10000) {
  await page.waitForFunction(
    (expected) => typeof window.__gamePhase === 'function' && window.__gamePhase() === expected,
    expectedPhase,
    { timeout: timeoutMs }
  );
}

/**
 * Wait for the game frontend to initialize (any known phase).
 */
async function waitForGameReady(page, timeoutMs = 10000) {
  await page.waitForFunction(
    () => typeof window.__gamePhase === 'function' && window.__gamePhase() !== 'unknown',
    { timeout: timeoutMs }
  );
}

test.describe('Phase transitions', () => {

  test.beforeEach(async ({ page, request }) => {
    await authenticatePage(page, request);
  });

  test('exploration -> combat transition cleans up exploration UI', async ({ page }) => {
    // Navigate and bootstrap the run
    await page.goto('/');
    await setupExplorationRun(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForGameReady(page);

    // Verify we start in a non-combat phase
    let phase = await getPhase(page);
    expect(phase).not.toBe('combat');

    // Transition into combat: proceed to encounter room, then start encounter
    // Check if we are already at an encounter room
    let stateRes = await apiFetch(page, 'GET', '/api/game/state');
    if (stateRes.body?.room?.type !== 'encounter') {
      await apiFetch(page, 'POST', '/api/game/proceed', {});
    }

    const encounterRes = await apiFetch(page, 'POST', '/api/game/start-creature-encounter', {});
    expect(encounterRes.status).toBe(200);

    // Reload and wait for combat phase
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForPhase(page, 'combat');

    phase = await getPhase(page);
    expect(phase).toBe('combat');

    // Assert combat UI is correct
    await assertCombatScreen(page);

    // Assert no stale exploration UI is leaking into combat
    await assertNoStaleUI(page, 'combat');
  });

  test('combat -> exploration transition cleans up combat UI', async ({ page }) => {
    // Navigate and bootstrap the run
    await page.goto('/');
    await setupExplorationRun(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForGameReady(page);

    // Enter combat
    let stateRes = await apiFetch(page, 'GET', '/api/game/state');
    if (stateRes.body?.room?.type !== 'encounter') {
      await apiFetch(page, 'POST', '/api/game/proceed', {});
    }
    await apiFetch(page, 'POST', '/api/game/start-creature-encounter', {});
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForPhase(page, 'combat');

    // Verify we are in combat
    let phase = await getPhase(page);
    expect(phase).toBe('combat');

    // Fight until combat ends (attack in a loop until phase changes)
    // Use a max iteration guard to avoid infinite loops
    const MAX_TURNS = 50;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const state = await getGameState(page);
      if (!state?.combat?.active) break;

      // Pick the first ally's first move and attack the first enemy
      const ally = state.combat.allies?.find(a => a.hp > 0);
      const enemy = state.combat.enemies?.find(e => e.hp > 0);
      if (!ally || !enemy) break;

      const moveId = ally.moves?.[0]?.id;
      if (!moveId) break;

      const allyIndex = state.combat.allies.indexOf(ally);
      const enemyIndex = state.combat.enemies.indexOf(enemy);

      await apiFetch(page, 'POST', '/api/game/creature-combat-cycle', {
        actionType: 'attack',
        moveChoices: [{ creatureIndex: allyIndex, moveId, targetIndex: enemyIndex }]
      });
    }

    // Reload to pick up the post-combat state
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForGameReady(page);

    // Phase should no longer be combat (could be victory, room, exploring, etc.)
    phase = await getPhase(page);
    expect(phase).not.toBe('combat');

    // Assert no stale combat UI remains
    await assertNoStaleUI(page, phase);
  });

});
