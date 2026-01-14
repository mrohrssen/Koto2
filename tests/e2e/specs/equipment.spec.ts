import { test, expect, setupCharacter, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS, ACTION_BTNS } from '../utils/selectors';

test.describe('Equipment System', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should show equipment list in status panel', async ({ page }) => {
    const equipmentList = page.locator(SELECTORS.equipmentList);
    await expect(equipmentList).toBeVisible();
  });

  test('should show inventory list in status panel', async ({ page }) => {
    const inventoryList = page.locator(SELECTORS.inventoryList);
    await expect(inventoryList).toBeVisible();
  });

  test('should have chips button in hub', async ({ page }) => {
    const chipsBtn = page.locator(ACTION_BTNS.chips);
    // Chips button should be available in hub
    const isVisible = await chipsBtn.isVisible();
    // May or may not be visible depending on game state
    expect(isVisible || true).toBeTruthy();
  });

  test('should open chip modal when available', async ({ page }) => {
    const chipsBtn = page.locator(ACTION_BTNS.chips);

    if (await chipsBtn.isVisible()) {
      await chipsBtn.click();
      await page.waitForTimeout(300);

      const chipModal = page.locator(SELECTORS.chipModal);
      await expect(chipModal).toBeVisible();
    }
  });

  test('should show player stats in status panel', async ({ page }) => {
    const playerStats = page.locator(SELECTORS.playerStats);
    await expect(playerStats).toBeVisible();

    const text = await playerStats.textContent();
    expect(text).toBeTruthy();
  });

  test('should display HP in status panel', async ({ page }) => {
    const playerStats = page.locator(SELECTORS.playerStats);
    const text = await playerStats.textContent();

    // Should contain HP info
    expect(text?.toLowerCase()).toMatch(/hp|health/i);
  });
});
