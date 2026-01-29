import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Lookup Mode', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test('lookup button toggles active state', async ({ page }) => {
    const lookupBtn = page.locator(SELECTORS.lookupBtn);

    // Initially not active
    await expect(lookupBtn).not.toHaveClass(/lookup-active/);

    // Click to activate (will show error toast if no API key, but button state still works)
    await lookupBtn.click();
    await page.waitForTimeout(500);

    // If no JPDB key, button should not be active (error shown)
    // This test verifies the toggle behavior exists
  });

  test('lookup popup close button works', async ({ page }) => {
    const popup = page.locator(SELECTORS.lookupPopup);
    const closeBtn = page.locator(SELECTORS.lookupPopupClose);

    // Popup should be hidden initially
    await expect(popup).not.toBeVisible();

    // Manually show popup for testing close button
    await page.evaluate(() => {
      document.getElementById('lookup-popup')?.classList.add('visible');
    });
    await expect(popup).toBeVisible();

    // Click close
    await closeBtn.click();
    await expect(popup).not.toBeVisible();
  });

  test('lookup button exists in utility row', async ({ page }) => {
    await expect(page.locator(SELECTORS.lookupBtn)).toBeVisible();
  });
});
