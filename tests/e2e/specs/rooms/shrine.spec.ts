// tests/e2e/specs/rooms/shrine.spec.ts
import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Shrine Room', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.enableDebugMode();
    // Queue shrine as first room
    await gameHelper.queueRooms(['shrine', 'encounter', 'boss']);
  });

  test('shrine room shows chip options', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    // Should be in shrine phase
    await gameHelper.waitForPhase(['shrine'], 8000);

    // Shrine options should be visible
    const shrineOptions = page.locator(SELECTORS.shrineChipOption);
    await expect(shrineOptions.first()).toBeVisible({ timeout: 5000 });

    // Should have at least one option
    const count = await shrineOptions.count();
    expect(count).toBeGreaterThan(0);
  });

  test('selecting shrine chip continues run', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    await gameHelper.waitForPhase(['shrine'], 8000);

    // Click first shrine option
    const shrineOption = page.locator(SELECTORS.shrineChipOption).first();
    await expect(shrineOption).toBeVisible({ timeout: 5000 });
    await shrineOption.click();
    await page.waitForTimeout(1000);

    // Should have left shrine phase
    const phase = await gameHelper.getPhase();
    expect(phase).not.toBe('shrine');
  });
});
