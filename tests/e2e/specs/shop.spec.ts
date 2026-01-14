import { test, expect, setupCharacter, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Shop System', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should have shop modal structure', async ({ page }) => {
    const shopModal = page.locator(SELECTORS.shopModal);
    await expect(shopModal).toBeAttached();
  });

  test('should have shop items container', async ({ page }) => {
    const shopItems = page.locator(SELECTORS.shopItems);
    await expect(shopItems).toBeAttached();
  });

  test('should have shop close button', async ({ page }) => {
    const closeBtn = page.locator(SELECTORS.shopCloseBtn);
    await expect(closeBtn).toBeAttached();
  });

  test('should have gold display in shop', async ({ page }) => {
    const goldDisplay = page.locator(SELECTORS.shopPlayerGold);
    await expect(goldDisplay).toBeAttached();
  });

  test('should track player gold', async ({ gameHelper }) => {
    const gold = await gameHelper.getPlayerGold();
    expect(gold).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Blacksmith System', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should have blacksmith modal structure', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const blacksmithModal = page.locator(SELECTORS.blacksmithModal);
    await expect(blacksmithModal).toBeAttached();
  });

  test('should have blacksmith items container', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const blacksmithItems = page.locator(SELECTORS.blacksmithItems);
    await expect(blacksmithItems).toBeAttached();
  });
});
