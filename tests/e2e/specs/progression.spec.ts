import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Progression', () => {
  test('floor indicator shows Hub before run', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await expect(page.locator(SELECTORS.floorIndicator)).toHaveText('Hub');
  });

  test('floor indicator shows F1 during run', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await gameHelper.setupRun();
    const floorText = await page.locator(SELECTORS.floorIndicator).textContent();
    expect(floorText).toBe('F1');
  });
});
