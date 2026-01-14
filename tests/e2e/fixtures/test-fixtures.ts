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
  const response = await page.request.post('/api/game/full-reset');
  if (!response.ok()) {
    console.warn('Failed to reset game state:', response.status());
  }
  // Small delay to ensure state is cleared
  await page.waitForTimeout(100);
}

/**
 * Helper to cleanup after a test - call in afterEach
 */
export async function cleanupAfterTest(page: any): Promise<void> {
  try {
    await page.request.post('/api/game/full-reset');
  } catch (e) {
    // Ignore errors during cleanup
  }
}

/**
 * Helper to create a character and get to hub
 */
export async function setupCharacter(gameHelper: GameHelper, name: string = 'TestHacker'): Promise<void> {
  await resetGameState(gameHelper.page);
  await gameHelper.page.goto('/');
  await gameHelper.page.waitForLoadState('networkidle');
  await gameHelper.createCharacter(name);
}

/**
 * Helper to get into combat state (best effort)
 * Returns true if combat was reached, false otherwise
 */
export async function setupCombat(gameHelper: GameHelper): Promise<boolean> {
  await setupCharacter(gameHelper);

  try {
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    // Try to proceed to combat, but don't fail if we can't
    for (let i = 0; i < 5; i++) {
      const phase = await gameHelper.getPhase();
      if (phase === 'combat' || phase === 'room_encounter') {
        return true;
      }

      // Try proceeding
      const canProceed = await gameHelper.isActionVisible('proceed');
      if (canProceed) {
        await gameHelper.proceedToNextRoom();
        await gameHelper.page.waitForTimeout(500);
      } else {
        break;
      }
    }

    // Check final state
    const finalPhase = await gameHelper.getPhase();
    return finalPhase === 'combat' || finalPhase === 'room_encounter';
  } catch (e) {
    // If setup fails, return false but don't throw
    return false;
  }
}
