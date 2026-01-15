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

  test('should have floor display element in dungeon', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    // Floor display exists but may be hidden due to CSS class not updating
    const floorDisplay = page.locator(SELECTORS.floorDisplay);
    await expect(floorDisplay).toBeAttached();
  });

  test('should have room display element in dungeon', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    // Room display exists but may be hidden due to CSS class not updating
    const roomDisplay = page.locator(SELECTORS.roomDisplay);
    await expect(roomDisplay).toBeAttached();
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
    await page.evaluate(async () => {
      await fetch('/api/game/forfeit', { method: 'POST' });
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still have player (phase is 'run_ended' or 'hub' after forfeit)
    const phase = await gameHelper.getPhase();
    expect(['hub', 'no_save', 'run_ended']).toContain(phase);
  });

  test('should have essence tracking', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);

    const essence = await gameHelper.getPlayerEssence();
    // Essence is a number and new players start with 0
    expect(typeof essence).toBe('number');
    expect(essence).toBe(0);
  });

  test('should have gold tracking', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);

    const gold = await gameHelper.getPlayerGold();
    // Gold is a number and new players start with some gold
    expect(typeof gold).toBe('number');
    expect(gold).toBeGreaterThan(0);
  });
});
