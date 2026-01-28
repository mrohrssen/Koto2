import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

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

  test('select ward transitions to exploring', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();
    // Either Proceed or Fight button should be visible depending on room type
    const proceedOrFight = page.locator(`${SELECTORS.proceedBtn}, ${SELECTORS.fightBtn}`);
    await expect(proceedOrFight.first()).toBeVisible({ timeout: 3000 });
    const floorText = await page.locator(SELECTORS.floorIndicator).textContent();
    expect(floorText).toMatch(/F\d+/);
  });

  test('proceed advances room counter', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();
    // Wait for proceed button (skip if first room is encounter)
    const proceedBtn = page.locator(SELECTORS.proceedBtn);
    if (await proceedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const roomBefore = await gameHelper.getCurrentRoom();
      await gameHelper.proceedToNextRoom();
      const roomAfter = await gameHelper.getCurrentRoom();
      expect(roomAfter).toBeGreaterThan(roomBefore);
    } else {
      // First room is encounter - just verify room tracking works
      const room = await gameHelper.getCurrentRoom();
      expect(room).toBeGreaterThanOrEqual(0);
    }
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
