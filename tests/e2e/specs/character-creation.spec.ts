import { test, expect, resetGameState, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Character Creation', () => {
  test.beforeEach(async ({ page }) => {
    await resetGameState(page);
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('load');
  });

  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should show start game button for new game', async ({ page }) => {
    const actionPanel = page.locator(SELECTORS.actionPanel);
    const startBtn = actionPanel.locator('button').first();

    await expect(startBtn).toBeVisible();
    await expect(startBtn).toContainText('Start Game');
  });

  test('should create character and go to hub', async ({ gameHelper }) => {
    await gameHelper.createCharacter('');
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('hub');
  });

  test('should start with default stats', async ({ page, gameHelper }) => {
    await gameHelper.createCharacter('');

    // Should be at hub with a player
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('hub');

    // Player stats panel should be visible
    const statsPanel = page.locator(SELECTORS.playerStats);
    await expect(statsPanel).toBeVisible();
  });
});
