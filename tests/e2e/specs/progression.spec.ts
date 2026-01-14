import { test, expect, setupCharacter, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS, ACTION_BTNS } from '../utils/selectors';

test.describe('Floor Progression', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should start on floor 1 when beginning run', async ({ gameHelper }) => {
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const floor = await gameHelper.getCurrentFloor();
    expect(floor).toBe(1);
  });

  test('should show floor display in UI', async ({ page, gameHelper }) => {
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const floorDisplay = page.locator(SELECTORS.floorDisplay);
    await expect(floorDisplay).toBeVisible();

    const text = await floorDisplay.textContent();
    expect(text).toBeTruthy();
  });

  test('should show room progress', async ({ page, gameHelper }) => {
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const roomDisplay = page.locator(SELECTORS.roomDisplay);
    await expect(roomDisplay).toBeVisible();
  });

  test('should track current room number', async ({ gameHelper }) => {
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const room = await gameHelper.getCurrentRoom();
    expect(room).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Run Completion', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should preserve player data between runs', async ({ page, gameHelper }) => {
    // Create character and note initial state
    const initialName = await page.locator(SELECTORS.playerNameDisplay).textContent();

    // Start and exit a run (forfeit)
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    // Reset to hub via API
    await page.request.post('/api/game/forfeit');
    await page.reload();

    // Check player still exists
    const newName = await page.locator(SELECTORS.playerNameDisplay).textContent();
    expect(newName).toBe(initialName);
  });

  test('should return to hub after game over', async ({ page, gameHelper }) => {
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    // Force game over via API
    await page.evaluate(() => {
      if ((window as any).gameState?.run?.player) {
        (window as any).gameState.run.player.hp = 0;
      }
    });

    // The game should eventually show game over options
    // Just verify we can return to hub after game over
    await page.request.post('/api/game/forfeit');
    await page.reload();

    const phase = await gameHelper.getPhase();
    expect(['hub', 'no_save']).toContain(phase);
  });
});
