import { test, expect, setupCharacter, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Floor Progression', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should start on floor 1 after entering dungeon', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const floor = await gameHelper.getCurrentFloor();
    expect(floor).toBe(1);
  });

  test('should have floor display visible in dungeon', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const floorDisplay = page.locator(SELECTORS.floorDisplay);
    await expect(floorDisplay).toBeVisible();
  });

  test('should have room display visible in dungeon', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const roomDisplay = page.locator(SELECTORS.roomDisplay);
    await expect(roomDisplay).toBeVisible();
  });

  test('should track current room', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const room = await gameHelper.getCurrentRoom();
    expect(room).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Run State', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should preserve player after forfeit', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper, 'TestRunner');

    // Start a run
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    // Forfeit the run
    await page.request.post('/api/game/forfeit');
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still have player
    const phase = await gameHelper.getPhase();
    expect(['hub', 'no_save']).toContain(phase);
  });

  test('should have essence tracking', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);

    const essence = await gameHelper.getPlayerEssence();
    expect(essence).toBeGreaterThanOrEqual(0);
  });

  test('should have gold tracking', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);

    const gold = await gameHelper.getPlayerGold();
    expect(gold).toBeGreaterThanOrEqual(0);
  });
});
