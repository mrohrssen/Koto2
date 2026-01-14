import { test, expect, setupCharacter, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS, ACTION_BTNS } from '../utils/selectors';

test.describe('Run Start and Ward Selection', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should be in hub phase after character creation', async ({ gameHelper }) => {
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('hub');
  });

  test('should show start run button in hub', async ({ page }) => {
    const startRunBtn = page.locator(ACTION_BTNS.startRun);
    await expect(startRunBtn).toBeVisible();
  });

  test('should show ward selection when starting run', async ({ page, gameHelper }) => {
    await gameHelper.startRun();

    // Should be in ward selection phase
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('ward_selection');

    // Should show ward options
    const wardOptions = page.locator('.ward-option');
    const count = await wardOptions.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should enter dungeon after selecting ward', async ({ gameHelper }) => {
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const phase = await gameHelper.getPhase();
    expect(['exploring', 'room', 'room_encounter']).toContain(phase);
  });

  test('should show floor indicator after entering dungeon', async ({ page, gameHelper }) => {
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const floorDisplay = await page.locator(SELECTORS.floorDisplay).textContent();
    expect(floorDisplay).toBeTruthy();
  });
});

test.describe('Dungeon Exploration', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');
  });

  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should start on floor 1', async ({ gameHelper }) => {
    const floor = await gameHelper.getCurrentFloor();
    expect(floor).toBe(1);
  });

  test('should proceed through rooms', async ({ gameHelper }) => {
    const initialRoom = await gameHelper.getCurrentRoom();

    // Check if proceed button is visible
    const canProceed = await gameHelper.isActionVisible('proceed');
    if (canProceed) {
      await gameHelper.proceedToNextRoom();
      const newRoom = await gameHelper.getCurrentRoom();
      expect(newRoom).toBe(initialRoom + 1);
    }
  });

  test('should show narration when entering rooms', async ({ page, gameHelper }) => {
    // Get initial narration
    const initialNarration = await page.locator(SELECTORS.narrationText).textContent();

    // Proceed if possible
    const canProceed = await gameHelper.isActionVisible('proceed');
    if (canProceed) {
      await gameHelper.proceedToNextRoom();

      // Narration should have content
      const narration = await page.locator(SELECTORS.narrationText).textContent();
      expect(narration).toBeTruthy();
    }
  });

  test('should show VN stage background', async ({ page }) => {
    const vnStage = page.locator(SELECTORS.vnStage);
    await expect(vnStage).toBeVisible();

    const background = page.locator(SELECTORS.vnBackground);
    await expect(background).toBeVisible();
  });

  test('should show player sprite', async ({ page }) => {
    const playerSprite = page.locator(SELECTORS.playerSprite);
    await expect(playerSprite).toBeVisible();
  });
});
