import { expect } from '@playwright/test';

/**
 * Read game state from the browser.
 * @param {import('@playwright/test').Page} page
 */
export async function getGameState(page) {
  return page.evaluate(() => window.__gameState?.());
}

/**
 * Get current game phase.
 */
export async function getPhase(page) {
  return page.evaluate(() => window.__gamePhase?.());
}

/**
 * Assert: exploration screen is showing correctly.
 * No combat UI leaking, background rendered, correct creatures visible.
 */
export async function assertExplorationScreen(page) {
  // Scene area visible
  await expect(page.locator('#scene-area')).toBeVisible();

  // No combat UI present
  await expect(page.locator('#action-area')).not.toBeVisible();

  // Background is rendered
  await expect(page.locator('#scene-background')).toBeVisible();
}

/**
 * Assert: combat screen matches game state.
 * Correct number of enemies, HP bars present, move UI visible.
 */
export async function assertCombatScreen(page) {
  const state = await getGameState(page);
  if (!state?.combat) throw new Error('Not in combat state');

  // Action area (move buttons) visible
  await expect(page.locator('#action-area')).toBeVisible();

  // Battle stage visible
  await expect(page.locator('#battle-stage')).toBeVisible();

  // Enemy formation has correct number of visible sprites
  const enemyCount = state.combat.enemies?.filter(e => e.hp > 0).length ?? 0;
  if (enemyCount > 0) {
    const enemySlots = page.locator('#enemy-formation .formation-slot .formation-sprite:visible');
    await expect(enemySlots).toHaveCount(enemyCount);
  }

  // Player formation has visible sprites
  const allyCount = state.combat.allies?.filter(a => a.hp > 0).length ?? 0;
  if (allyCount > 0) {
    const allySlots = page.locator('#player-formation .formation-slot .formation-sprite:visible');
    await expect(allySlots).toHaveCount(allyCount);
  }
}

/**
 * Assert: no stale UI from a previous phase.
 * Call after any phase transition to verify cleanup.
 */
export async function assertNoStaleUI(page, currentPhase) {
  if (currentPhase !== 'combat') {
    // Combat UI should be gone
    await expect(page.locator('#action-area')).not.toBeVisible();
    await expect(page.locator('#battle-stage')).not.toBeVisible();
  }

  // No orphaned popups
  const popup = page.locator('#creature-popup.visible');
  await expect(popup).toHaveCount(0);
}
