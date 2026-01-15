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

  test('should have action buttons in hub', async ({ page }) => {
    // Hub should have action buttons (Infiltrate, Upgrades, etc.)
    const actionBtns = page.locator('#action-panel button');
    const count = await actionBtns.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should have equipment list with content', async ({ page }) => {
    // Equipment list exists and displays equipment info
    const equipmentList = page.locator(SELECTORS.equipmentList);
    await expect(equipmentList).toBeVisible();

    // Equipment list should have some text content (even if empty, shows placeholder)
    const text = await equipmentList.textContent();
    expect(text).toBeTruthy();
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
