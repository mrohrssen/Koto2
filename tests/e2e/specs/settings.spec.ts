import { test, expect, resetGameState, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await resetGameState(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should show settings button in header', async ({ page }) => {
    const settingsBtn = page.locator(SELECTORS.settingsBtn);
    await expect(settingsBtn).toBeVisible();
  });

  test('should open settings modal', async ({ page, gameHelper }) => {
    await gameHelper.openSettings();
    await expect(page.locator(SELECTORS.settingsModal)).toBeVisible();
  });

  test('should have AI provider selector', async ({ page, gameHelper }) => {
    await gameHelper.openSettings();

    const aiProvider = page.locator(SELECTORS.aiProvider);
    await expect(aiProvider).toBeVisible();
  });

  test('should have JLPT level selector', async ({ page, gameHelper }) => {
    await gameHelper.openSettings();

    const jlptLevel = page.locator(SELECTORS.jlptLevel);
    await expect(jlptLevel).toBeVisible();
  });

  test('should have TTS toggle', async ({ page, gameHelper }) => {
    await gameHelper.openSettings();

    const ttsEnabled = page.locator(SELECTORS.gameTtsEnabled);
    await expect(ttsEnabled).toBeVisible();
  });

  test('should have review type selector', async ({ page, gameHelper }) => {
    await gameHelper.openSettings();

    const reviewType = page.locator(SELECTORS.reviewType);
    await expect(reviewType).toBeVisible();
  });

  test('should close settings modal with close button', async ({ page, gameHelper }) => {
    await gameHelper.openSettings();
    await expect(page.locator(SELECTORS.settingsModal)).toBeVisible();

    await page.click(SELECTORS.closeSettings);
    await expect(page.locator(SELECTORS.settingsModal)).toBeHidden();
  });

  test('should close settings modal with cancel button', async ({ page, gameHelper }) => {
    await gameHelper.openSettings();
    await expect(page.locator(SELECTORS.settingsModal)).toBeVisible();

    await page.click(SELECTORS.cancelSettings);
    await expect(page.locator(SELECTORS.settingsModal)).toBeHidden();
  });

  test('should have save settings button', async ({ page, gameHelper }) => {
    await gameHelper.openSettings();

    const saveBtn = page.locator(SELECTORS.saveSettings);
    await expect(saveBtn).toBeVisible();
  });
});
