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

  test('should have VN stage element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    // VN stage exists but may be hidden in hub mode
    const vnStage = page.locator(SELECTORS.vnStage);
    await expect(vnStage).toBeAttached();
  });

  test('should have player sprite element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    // Player sprite exists but may be hidden in hub mode
    const playerSprite = page.locator(SELECTORS.playerSprite);
    await expect(playerSprite).toBeAttached();
  });

  test('should show narration panel', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const narrationPanel = page.locator(SELECTORS.narrationPanel);
    await expect(narrationPanel).toBeVisible();
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

    // Wait for ward cards to render
    const wardCards = page.locator('.ward-card');
    await wardCards.first().waitFor({ state: 'visible', timeout: 5000 });

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

    // Floor indicator exists but may be hidden in hub mode
    const floorIndicator = page.locator(SELECTORS.floorIndicator);
    await expect(floorIndicator).toBeAttached();
  });

  test('should have floor display element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    // Floor display exists but may be hidden in hub mode
    const floorDisplay = page.locator(SELECTORS.floorDisplay);
    await expect(floorDisplay).toBeAttached();
  });

  test('should have room display element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    // Room display exists but may be hidden in hub mode
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
