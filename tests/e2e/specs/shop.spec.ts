import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Shop', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test('starting chip selection shows 3 options', async ({ gameHelper, page }) => {
    await gameHelper.startRun();
    // Chip selection now uses in-scene cards in the action area
    const chipCount = await page.locator(SELECTORS.chipSelectCard).count();
    expect(chipCount).toBe(3);
  });

  test('selecting a chip confirms selection and equips it', async ({ gameHelper, page }) => {
    await gameHelper.startRun();
    await gameHelper.selectStartingChip(0);
    // Verify chip selection UI is gone
    const chipCards = await page.locator(SELECTORS.chipSelectCard).count();
    expect(chipCards).toBe(0);
    // Verify chip is equipped via server state (authoritative)
    const chips = await page.evaluate(async () => {
      const res = await fetch('/api/game/state');
      const state = await res.json();
      return state?.run?.player?.chips || state?.player?.chips || [];
    });
    expect(chips.length).toBeGreaterThanOrEqual(1);
  });

  test('post-combat shop opens after victory', async ({ gameHelper, page }) => {
    // Use debug API to force post_combat_shop phase deterministically
    await gameHelper.forcePhase('post_combat_shop');
    // Post-combat chip selection uses in-scene cards
    await page.locator(SELECTORS.chipSelectCard).first().waitFor({ state: 'visible', timeout: 5000 });
    const chipCount = await page.locator(SELECTORS.chipSelectCard).count();
    expect(chipCount).toBeGreaterThanOrEqual(1);
  });

  test('skip button closes post-combat shop', async ({ gameHelper, page }) => {
    await gameHelper.forcePhase('post_combat_shop');
    await expect(page.locator(SELECTORS.chipSelectSkip)).toBeVisible({ timeout: 3000 });
    await page.locator(SELECTORS.chipSelectSkip).click();
    await page.waitForTimeout(1000);
    // Verify chip selection is gone
    const chipCards = await page.locator(SELECTORS.chipSelectCard).count();
    expect(chipCards).toBe(0);
  });
});
