import { test, expect, setupCharacter, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Boss Fights', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should track encounters in run state', async ({ page, gameHelper }) => {
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    // Check game state has run tracking
    const state = await page.evaluate(() => (window as any).gameState);
    expect(state.run).toBeTruthy();
    expect(state.run.encountersCompleted).toBeDefined();
  });

  test('should have encountersNeeded for boss progression', async ({ page, gameHelper }) => {
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    // The game should track when boss is ready
    const state = await page.evaluate(() => (window as any).gameState);
    expect(state.run.encountersNeeded).toBeGreaterThan(0);
  });
});

test.describe('Boss State Tracking', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should start on floor 1', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const floor = await gameHelper.getCurrentFloor();
    expect(floor).toBe(1);
  });

  test('should have floor indicator visible', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const floorDisplay = page.locator(SELECTORS.floorDisplay);
    await expect(floorDisplay).toBeVisible();
  });
});
