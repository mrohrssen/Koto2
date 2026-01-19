import { test, expect, setupCharacter, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Game Over', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should have game over modal structure', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const gameoverModal = page.locator(SELECTORS.gameoverModal);
    await expect(gameoverModal).toBeAttached();
  });

  test('should have retry button in game over modal', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const retryBtn = page.locator(SELECTORS.gameoverRetryBtn);
    await expect(retryBtn).toBeAttached();
  });

  test('should have return to hub button in game over modal', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const hubBtn = page.locator(SELECTORS.gameoverHubBtn);
    await expect(hubBtn).toBeAttached();
  });

  test('should have stats display in game over modal', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const stats = page.locator(SELECTORS.gameoverStats);
    await expect(stats).toBeAttached();
  });

  test('should be able to start new run after game over', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    // Start a run
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    // Forfeit the run
    await page.evaluate(async () => {
      await fetch('/api/game/forfeit', { method: 'POST' });
    });
    await page.reload();
    await page.waitForLoadState('load');

    // Should be back in hub/run_ended and able to start again
    const phase = await gameHelper.getPhase();
    expect(['hub', 'no_save', 'run_ended']).toContain(phase);
  });
});

test.describe('Result Modal', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should have result modal structure', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const resultModal = page.locator(SELECTORS.resultModal);
    await expect(resultModal).toBeAttached();
  });

  test('should have continue button in result modal', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const continueBtn = page.locator(SELECTORS.resultContinueBtn);
    await expect(continueBtn).toBeAttached();
  });

  test('should have rewards display in result modal', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const rewards = page.locator(SELECTORS.resultRewards);
    await expect(rewards).toBeAttached();
  });
});
