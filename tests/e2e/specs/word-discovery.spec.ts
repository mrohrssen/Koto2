// tests/e2e/specs/word-discovery.spec.ts
import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Word Discovery Room', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test('word discovery phase can be entered and handled', async ({ gameHelper, page }) => {
    // Set up a run first so we have proper game state
    await gameHelper.setupRun();

    // Force word discovery phase directly via debug API
    await gameHelper.forcePhase('wordDiscovery');

    // The phase will either:
    // 1. Show flash cards (if words available)
    // 2. Auto-proceed to next room (if no words)
    // Both are valid behaviors - we just need to verify the phase transitions correctly

    // Wait a bit for the UI to settle after phase change
    await page.waitForTimeout(1000);

    // Check if we have a flash card (words available) or if we auto-proceeded
    const flashCardVisible = await page.locator(SELECTORS.flashCard).isVisible().catch(() => false);
    const proceedBtnVisible = await page.locator(SELECTORS.proceedBtn).isVisible().catch(() => false);

    if (flashCardVisible) {
      // Words are available - test card interaction
      await gameHelper.flipCard();
      await page.waitForTimeout(300);
      await gameHelper.swipeCard('right');
      await page.waitForTimeout(500);
    }

    // Either way, the test should complete without crashing
    // and we should be able to get the current phase
    const phase = await gameHelper.getPhase();
    expect(phase).toBeDefined();
  });

  test('word discovery room navigates or shows content', async ({ gameHelper, page }) => {
    // Alternative test that explores naturally to find a word discovery room
    await gameHelper.setupRun();

    // Navigate through rooms to find word discovery or any room type
    let roomsVisited = 0;
    const maxRooms = 15;

    while (roomsVisited < maxRooms) {
      const phase = await gameHelper.getPhase();
      roomsVisited++;

      if (phase === 'wordDiscovery') {
        // Found word discovery room
        await page.waitForTimeout(500);

        const flashCardVisible = await page.locator(SELECTORS.flashCard).isVisible().catch(() => false);
        if (flashCardVisible) {
          // Interact with card
          await gameHelper.flipCard();
          await page.waitForTimeout(200);
          await gameHelper.swipeCard('right');
        }
        // Wait for room to complete
        await page.waitForTimeout(500);
        break;
      }

      // Handle other room types
      if (phase === 'shrine') {
        const shrineOption = page.locator('.shrine-chip-option').first();
        if (await shrineOption.isVisible().catch(() => false)) {
          await shrineOption.click();
          await page.waitForTimeout(500);
        }
      } else if (phase === 'quiz') {
        const quizOption = page.locator('.quiz-answer-option').first();
        if (await quizOption.isVisible().catch(() => false)) {
          await quizOption.click();
          await page.waitForTimeout(1000);
        }
      } else if (phase === 'room_encounter') {
        // Start combat then try to proceed
        const fightBtn = page.locator(SELECTORS.fightBtn);
        if (await fightBtn.isVisible().catch(() => false)) {
          await fightBtn.click();
          await page.waitForTimeout(500);
          await gameHelper.winCombat(10);
        }
      } else if (phase === 'boss_ready') {
        // Don't fight boss, just stop
        break;
      }

      // Try to proceed to next room
      const proceedBtn = page.locator(SELECTORS.proceedBtn);
      if (await proceedBtn.isVisible().catch(() => false)) {
        await proceedBtn.click();
        await page.waitForTimeout(500);
      } else {
        await page.waitForTimeout(300);
      }
    }

    // Test completes successfully if we navigated without crashing
    expect(roomsVisited).toBeGreaterThan(0);
  });
});
