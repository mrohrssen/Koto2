import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Shop', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test('starting chip shop shows 3 options', async ({ gameHelper, page }) => {
    await gameHelper.startRun();
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.chipShopView);
    expect(isOpen).toBe(true);
    const chipCount = await page.locator(SELECTORS.shopChipOption).count();
    expect(chipCount).toBe(3);
  });

  test('selecting a chip closes shop and equips it', async ({ gameHelper, page }) => {
    await gameHelper.startRun();
    await gameHelper.selectStartingChip(0);
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.chipShopView);
    expect(isOpen).toBe(false);
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
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.chipShopView);
    expect(isOpen).toBe(true);
    const chipCount = await page.locator(SELECTORS.shopChipOption).count();
    expect(chipCount).toBeGreaterThanOrEqual(1);
  });

  test('skip button closes post-combat shop', async ({ gameHelper, page }) => {
    await gameHelper.forcePhase('post_combat_shop');
    await expect(page.locator(SELECTORS.shopSkipBtn)).toBeVisible({ timeout: 3000 });
    await page.locator(SELECTORS.shopSkipBtn).click();
    await page.waitForTimeout(1000);
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.chipShopView);
    expect(isOpen).toBe(false);
  });
});
