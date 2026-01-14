import { test, expect, setupCharacter, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS, ACTION_BTNS } from '../utils/selectors';

test.describe('Run Start', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should be in hub phase after character creation', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('hub');
  });

  test('should have action panel with buttons', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const actionPanel = page.locator(SELECTORS.actionPanel);
    await expect(actionPanel).toBeVisible();

    const buttons = actionPanel.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should show VN stage', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const vnStage = page.locator(SELECTORS.vnStage);
    await expect(vnStage).toBeVisible();
  });

  test('should show player sprite element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const playerSprite = page.locator(SELECTORS.playerSprite);
    await expect(playerSprite).toBeAttached();
  });

  test('should show narration panel', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const narrationPanel = page.locator(SELECTORS.narrationPanel);
    await expect(narrationPanel).toBeAttached();
  });
});

test.describe('Ward Selection', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should enter ward selection when starting run', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();

    const phase = await gameHelper.getPhase();
    expect(phase).toBe('ward_selection');
  });

  test('should show ward options', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();

    // Should show ward cards
    const wardCards = page.locator('.ward-card');
    const count = await wardCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Floor Indicator Structure', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should have floor indicator element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const floorIndicator = page.locator(SELECTORS.floorIndicator);
    await expect(floorIndicator).toBeAttached();
  });

  test('should have floor display element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const floorDisplay = page.locator(SELECTORS.floorDisplay);
    await expect(floorDisplay).toBeAttached();
  });

  test('should have room display element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const roomDisplay = page.locator(SELECTORS.roomDisplay);
    await expect(roomDisplay).toBeAttached();
  });
});

test.describe('Dungeon Exploration', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should enter dungeon after selecting ward', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const phase = await gameHelper.getPhase();
    expect(['exploring', 'room', 'room_encounter', 'combat', 'boss_ready']).toContain(phase);
  });

  test('should track floor number', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const floor = await gameHelper.getCurrentFloor();
    expect(floor).toBeGreaterThanOrEqual(1);
  });

  test('should track room number', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const room = await gameHelper.getCurrentRoom();
    expect(room).toBeGreaterThanOrEqual(0);
  });
});
