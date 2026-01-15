import { test as base, expect } from '@playwright/test';
import { GameHelper } from './game-helpers';

/**
 * Custom test fixtures for JRPG e2e tests
 */
export const test = base.extend<{
  gameHelper: GameHelper;
}>({
  gameHelper: async ({ page }, use) => {
    const helper = new GameHelper(page);
    await use(helper);
  },
});

// Re-export expect for convenience
export { expect };

/**
 * Helper to reset game state before a test
 */
export async function resetGameState(page: any): Promise<void> {
  try {
    await page.request.post('http://localhost:3000/api/game/full-reset');
  } catch (e) {
    // Ignore errors - reset is best effort
  }
  await page.waitForTimeout(100);
}

/**
 * Helper to cleanup after a test - call in afterEach
 * Note: This is best-effort and silently ignores all errors
 */
export async function cleanupAfterTest(page: any): Promise<void> {
  // No-op: Playwright handles browser cleanup automatically
  // Removing API calls here prevents "Page closed" errors
}

/**
 * Helper to create a character and get to hub
 */
export async function setupCharacter(gameHelper: GameHelper, name: string = 'TestHacker'): Promise<void> {
  // Reset game state first to ensure fresh start
  await resetGameState(gameHelper.page);
  await gameHelper.page.goto('http://localhost:3000');
  await gameHelper.page.waitForLoadState('networkidle');
  await gameHelper.createCharacter(name);
}

/**
 * Helper to get into combat state reliably using debug API
 * Returns true if combat was reached, false otherwise
 */
export async function setupCombat(gameHelper: GameHelper): Promise<boolean> {
  await setupCharacter(gameHelper);

  try {
    // Use debug API to reliably enter combat
    // This creates a real combat state with a real enemy
    const response = await gameHelper.page.evaluate(async () => {
      const res = await fetch('/api/game/debug-force-combat', { method: 'POST' });
      return res.json();
    });

    if (!response.success) {
      console.log('[setupCombat] Debug API failed:', response.error);
      return false;
    }

    // Reload page to ensure UI reflects new state
    await gameHelper.page.reload();
    await gameHelper.page.waitForLoadState('networkidle');

    // Wait for combat phase
    const phase = await gameHelper.getPhase();
    if (phase === 'combat') {
      return true;
    }

    // Give UI a moment to update
    await gameHelper.page.waitForTimeout(500);
    const finalPhase = await gameHelper.getPhase();
    return finalPhase === 'combat';
  } catch (e) {
    console.log('[setupCombat] Error:', e);
    return false;
  }
}
