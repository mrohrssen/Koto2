import { test, expect, resetGameState } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Character Creation', () => {
  test.beforeEach(async ({ page }) => {
    await resetGameState(page);
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('load');
  });

  test('fresh load shows New Game button', async ({ page }) => {
    await page.locator(SELECTORS.newGameBtn).waitFor({ state: 'visible', timeout: 5000 });
    await expect(page.locator(SELECTORS.newGameBtn)).toBeVisible();
  });

  test('create character transitions to hub', async ({ gameHelper, page }) => {
    await gameHelper.createCharacter();
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('hub');
    await expect(page.locator(SELECTORS.contextActionBtn)).toBeVisible();
    await expect(page.locator(SELECTORS.contextActionBtn)).toHaveText('Infiltrate');
  });

  test('hub shows correct initial state', async ({ gameHelper, page }) => {
    await gameHelper.createCharacter();
    await expect(page.locator(SELECTORS.floorIndicator)).toHaveText('Hub');
    await expect(page.locator(SELECTORS.essenceDisplay)).toHaveText('0');
  });
});
