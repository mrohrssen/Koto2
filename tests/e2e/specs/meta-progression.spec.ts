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
    const upgradesBtn = page.locator(ACTION_BTNS.upgrades);
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

    // Click achievements tab
    await page.click('[data-tab="achievements"]');
    await page.waitForTimeout(300);

    const achievementsTab = page.locator(SELECTORS.tabAchievements);
    const isActive = await achievementsTab.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBeTruthy();
  });

  test('should switch to stats tab', async ({ page, gameHelper }) => {
    await gameHelper.openUpgrades();

    // Click stats tab
    await page.click('[data-tab="stats"]');
    await page.waitForTimeout(300);

    const statsTab = page.locator(SELECTORS.tabStats);
    const isActive = await statsTab.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBeTruthy();
  });

  test('should close upgrades modal', async ({ page, gameHelper }) => {
    await gameHelper.openUpgrades();
    await expect(page.locator(SELECTORS.upgradesModal)).toBeVisible();

    await page.click(SELECTORS.closeUpgrades);
    await expect(page.locator(SELECTORS.upgradesModal)).toBeHidden();
  });
});
