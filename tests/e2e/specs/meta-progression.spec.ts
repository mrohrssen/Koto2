import { test, expect, setupCharacter, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS, ACTION_BTNS } from '../utils/selectors';

test.describe('Meta-Progression', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should show upgrades button in hub', async ({ page }) => {
    // The upgrades button has text "Upgrades" and class "secondary"
    const upgradesBtn = page.locator('#action-panel button.secondary:has-text("Upgrades")');
    await expect(upgradesBtn).toBeVisible();
  });

  test('should open upgrades modal', async ({ page, gameHelper }) => {
    await gameHelper.openUpgrades();
    await expect(page.locator(SELECTORS.upgradesModal)).toBeVisible();
  });

  test('should show essence count in upgrades modal', async ({ page, gameHelper }) => {
    await gameHelper.openUpgrades();

    const essenceCount = page.locator(SELECTORS.modalEssenceCount);
    await expect(essenceCount).toBeVisible();

    const text = await essenceCount.textContent();
    expect(text).toMatch(/\d+/);
  });

  test('should show upgrades grid', async ({ page, gameHelper }) => {
    await gameHelper.openUpgrades();

    const upgradesGrid = page.locator(SELECTORS.upgradesGrid);
    await expect(upgradesGrid).toBeVisible();
  });

  test('should have tab navigation', async ({ page, gameHelper }) => {
    await gameHelper.openUpgrades();

    const tabs = page.locator(SELECTORS.tabBtns);
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('should switch to achievements tab', async ({ page, gameHelper }) => {
    await gameHelper.openUpgrades();

    // Click achievements tab and wait for it to become active
    const achievementsTab = page.locator(SELECTORS.tabAchievements);
    await page.click('[data-tab="achievements"]');
    await expect(achievementsTab).toHaveClass(/active/);
  });

  test('should switch to stats tab', async ({ page, gameHelper }) => {
    await gameHelper.openUpgrades();

    // Click stats tab and wait for it to become active
    const statsTab = page.locator(SELECTORS.tabStats);
    await page.click('[data-tab="stats"]');
    await expect(statsTab).toHaveClass(/active/);
  });

  test('should close upgrades modal', async ({ page, gameHelper }) => {
    await gameHelper.openUpgrades();
    await expect(page.locator(SELECTORS.upgradesModal)).toBeVisible();

    await page.click(SELECTORS.closeUpgrades);
    await expect(page.locator(SELECTORS.upgradesModal)).toBeHidden();
  });
});
