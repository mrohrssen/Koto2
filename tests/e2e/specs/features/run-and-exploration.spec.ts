import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Run and Exploration', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test('Infiltrate opens starting chip selection', async ({ gameHelper, page }) => {
    await gameHelper.startRun();
    // Chip selection now uses in-scene cards in the action area
    // Chip selection uses a single-card carousel; wait for the card to be visible
    await expect(page.locator(SELECTORS.chipSelectCard)).toBeVisible({ timeout: 5000 });
  });

  test('select starting chip transitions to ward selection', async ({ gameHelper, page }) => {
    await gameHelper.startRun();
    await gameHelper.selectStartingChip(0);
    await gameHelper.waitForPhase(['ward_selection'], 5000);
    const wardCount = await page.locator(SELECTORS.wardOption).count();
    expect(wardCount).toBeGreaterThanOrEqual(1);
  });

  test('chip selection updates backend state', async ({ gameHelper, page }) => {
    // Start run to get to chip selection
    await gameHelper.startRun();

    // Check backend state before selection - player should have no chips yet
    const stateBefore = await page.evaluate(async () => {
      const res = await fetch('/api/game/state');
      return res.json();
    });
    const chipsBefore = stateBefore?.run?.player?.chips || stateBefore?.player?.chips || [];
    const chipCountBefore = chipsBefore.length;

    // Click the chip card and confirm button directly (don't wait for ward selection)
    await page.locator(SELECTORS.chipSelectCard).first().click();
    await page.waitForTimeout(200);
    await page.locator(SELECTORS.chipSelectConfirm).click();

    // Wait for backend state to update (poll for chip count increase)
    await page.waitForFunction(
      async (prevCount: number) => {
        const res = await fetch('/api/game/state');
        const state = await res.json();
        const chips = state?.run?.player?.chips || state?.player?.chips || [];
        return chips.length > prevCount;
      },
      chipCountBefore,
      { timeout: 5000, polling: 300 }
    );

    // Verify backend state updated with a new chip
    const stateAfter = await page.evaluate(async () => {
      const res = await fetch('/api/game/state');
      return res.json();
    });
    const chipsAfter = stateAfter?.run?.player?.chips || stateAfter?.player?.chips || [];
    expect(chipsAfter.length).toBeGreaterThan(chipCountBefore);

    // Verify the chip has required properties
    const newChip = chipsAfter[chipsAfter.length - 1];
    expect(newChip).toHaveProperty('id');
    expect(newChip.id).toBeTruthy();
  });

  test('select ward transitions to exploring', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    // After setupRun, we could be in various room phases depending on what was queued
    // Verify we're in a valid in-run phase (not hub, ward_selection, or chip selection)
    const phase = await gameHelper.getPhase();
    const validRunPhases = ['exploring', 'room_encounter', 'combat', 'boss_ready', 'shrine', 'quiz', 'wordDiscovery'];
    expect(validRunPhases).toContain(phase);

    // Verify floor indicator shows we're on a floor
    const floorText = await page.locator(SELECTORS.floorIndicator).textContent();
    expect(floorText).toMatch(/F\d+/);
  });

  test('completing room advances room counter', async ({ gameHelper, page }) => {
    await gameHelper.enableDebugMode();
    // Queue shrine - completing it auto-advances to next room
    await gameHelper.queueRooms(['shrine', 'encounter', 'boss']);
    await gameHelper.setupRun();

    // Wait for shrine phase
    await gameHelper.waitForPhase(['shrine'], 8000);

    const roomBefore = await gameHelper.getCurrentRoom();

    // Complete shrine (select a chip reward) - this auto-advances
    await gameHelper.completeShrineRoom();
    await page.waitForTimeout(1000);

    // Room counter should have advanced automatically
    const roomAfter = await gameHelper.getCurrentRoom();
    expect(roomAfter).toBeGreaterThan(roomBefore);
  });

  test('room encounter shows Fight button', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();
    const found = await gameHelper.proceedToEncounter(50);
    expect(found).toBe(true);
    await expect(page.locator(SELECTORS.fightBtn)).toBeVisible({ timeout: 3000 });
  });

  test('floor complete shows Continue button', async ({ gameHelper, page }) => {
    await gameHelper.forcePhase('floor_complete');
    await expect(page.locator(SELECTORS.nextFloorBtn)).toBeVisible({ timeout: 3000 });
  });
});
