import { test as base, expect } from '@playwright/test';
import { GameHelper } from './game-helpers';

/**
 * Custom test fixtures for JRPG e2e tests (mobile UI)
 */
export const test = base.extend<{
  gameHelper: GameHelper;
}>({
  gameHelper: async ({ page }, use) => {
    const helper = new GameHelper(page);
    await use(helper);
  },
});

export { expect };

/**
 * Reset game state before a test
 */
export async function resetGameState(page: any): Promise<void> {
  try {
    await page.request.post('http://localhost:3000/api/game/full-reset');
  } catch (e) {
    // Best effort
  }
  await page.waitForTimeout(100);
}

/**
 * Setup: reset + navigate + create character → hub phase
 */
export async function setupCharacter(gameHelper: GameHelper): Promise<void> {
  await resetGameState(gameHelper.page);
  await gameHelper.page.goto('http://localhost:3000');
  await gameHelper.page.waitForLoadState('load');
  await gameHelper.createCharacter();
}

/**
 * Setup: character + debug force combat → combat phase
 */
export async function setupCombat(gameHelper: GameHelper): Promise<void> {
  await setupCharacter(gameHelper);
  await gameHelper.setupCombat();
}
