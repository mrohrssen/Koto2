import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Settings', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test('settings button opens takeover with inputs', async ({ gameHelper, page }) => {
    await page.locator(SELECTORS.settingsBtn).click();
    await page.waitForTimeout(500);
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.settingsView);
    expect(isOpen).toBe(true);
    await expect(page.locator(SELECTORS.settingsJpdbKey)).toBeVisible();
    await expect(page.locator(SELECTORS.settingsTtsEnabled)).toBeVisible();
    await expect(page.locator(SELECTORS.settingsSaveBtn)).toBeVisible();
  });

  // Known issue: test environment can't validate API keys, so save always fails
  test.skip('save settings shows toast and closes takeover', async ({ gameHelper, page }) => {
    await page.locator(SELECTORS.settingsBtn).click();
    await page.waitForTimeout(500);
    await page.locator(SELECTORS.settingsJpdbKey).fill('test-key-123');
    await page.locator(SELECTORS.settingsSaveBtn).click();
    await page.waitForTimeout(500);
    // Toast should show
    const toastText = await page.locator(SELECTORS.sceneToast).textContent();
    expect(toastText).toContain('Settings saved');
    // Takeover closes immediately on save
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.settingsView);
    expect(isOpen).toBe(false);
  });

  test('close button dismisses without saving', async ({ gameHelper, page }) => {
    await page.locator(SELECTORS.settingsBtn).click();
    await page.waitForTimeout(500);
    await page.locator(SELECTORS.settingsJpdbKey).fill('should-not-persist');
    await page.locator(SELECTORS.settingsClose).click();
    await page.waitForTimeout(500);
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.settingsView);
    expect(isOpen).toBe(false);
    // Re-open and verify value was not saved
    await page.locator(SELECTORS.settingsBtn).click();
    await page.waitForTimeout(500);
    const value = await page.locator(SELECTORS.settingsJpdbKey).inputValue();
    expect(value).not.toBe('should-not-persist');
  });
});
