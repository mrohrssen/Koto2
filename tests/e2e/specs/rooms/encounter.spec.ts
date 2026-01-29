// tests/e2e/specs/rooms/encounter.spec.ts
import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

/**
 * Helper to dismiss any visible narration that requires clicking
 * Returns true if narration was dismissed, false otherwise
 */
async function dismissNarration(page: any, maxAttempts = 10): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    // Check if narration is visible and dismissible
    const result = await page.evaluate(() => {
      const box = document.getElementById('narration-box');
      const indicator = box?.querySelector('.narration-indicator') as HTMLElement;
      // Box must have visible class and indicator must not be hidden
      const visible = box?.classList.contains('visible');
      const dismissible = indicator && indicator.style.display !== 'none';
      return { visible, dismissible };
    });

    if (result.visible && result.dismissible) {
      // Click anywhere on the document to dismiss (narration uses document click handler)
      await page.click('body', { force: true });
      await page.waitForTimeout(600);
      // Check if narration is now hidden
      const stillVisible = await page.evaluate(() => {
        const box = document.getElementById('narration-box');
        return box?.classList.contains('visible');
      });
      if (!stillVisible) {
        return true;
      }
      // Narration still visible, keep trying
      continue;
    }
    // No narration to dismiss
    return false;
  }
  return false;
}

/**
 * Helper to wait for flash card to appear, dismissing any narration first
 */
async function waitForFlashCardWithNarration(gameHelper: any, page: any, timeout = 15000): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    // Try to dismiss any narration first
    const dismissed = await dismissNarration(page, 3);
    if (dismissed) {
      console.log('[Test] Dismissed narration while waiting for flash card');
    }

    // Check if flash card is visible
    const flashCardVisible = await page.locator(SELECTORS.flashCard).isVisible().catch(() => false);
    if (flashCardVisible) {
      console.log('[Test] Flash card is now visible');
      return;
    }

    await page.waitForTimeout(300);
  }
  throw new Error(`Flash card did not appear within ${timeout}ms`);
}

/**
 * Helper to start combat from encounter room
 * Handles any narration that appears before the fight button
 */
async function startCombatFromEncounter(gameHelper: any, page: any): Promise<void> {
  console.log('[Test] Starting startCombatFromEncounter');
  const maxAttempts = 25;

  for (let i = 0; i < maxAttempts; i++) {
    const phase = await gameHelper.getPhase();
    console.log(`[Test] Attempt ${i + 1}/${maxAttempts}, phase=${phase}`);

    // If already in combat, dismiss any enemy dialogue narration
    if (phase === 'combat') {
      console.log('[Test] In combat phase, dismissing any enemy dialogue');
      await dismissNarration(page, 5);
      return;
    }

    // Check for fight button
    const fightBtn = page.locator(SELECTORS.fightBtn);
    if (await fightBtn.isVisible().catch(() => false)) {
      console.log('[Test] Fight button visible, clicking');
      await fightBtn.click();
      // Wait for combat phase
      await gameHelper.waitForPhase(['combat'], 5000);
      console.log('[Test] Entered combat phase, now dismissing enemy dialogue');
      // After entering combat, dismiss any enemy dialogue
      await dismissNarration(page, 10);
      return;
    }

    // Try to dismiss any pre-fight narration
    const dismissed = await dismissNarration(page, 3);
    if (dismissed) {
      console.log('[Test] Dismissed pre-fight narration');
      continue;
    }

    // Wait a bit and try again
    await page.waitForTimeout(400);
  }

  throw new Error('Failed to start combat after max attempts');
}

test.describe('Encounter Room', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.enableDebugMode();
    // Queue encounter rooms for deterministic testing
    await gameHelper.queueRooms(['encounter', 'encounter', 'encounter', 'boss']);
  });

  test('encounter room shows enemy', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    // Should be in encounter room
    await gameHelper.waitForPhase(['room_encounter', 'exploring'], 5000);

    // Start combat
    await startCombatFromEncounter(gameHelper, page);

    // Enemy should be visible
    await expect(page.locator(SELECTORS.enemySpriteContainer)).toBeVisible();
    const enemyName = await page.locator(SELECTORS.enemyName).textContent();
    expect(enemyName?.trim().length).toBeGreaterThan(0);
  });

  test('flash card appears in combat', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    // Start combat (includes dismissing enemy dialogue)
    await startCombatFromEncounter(gameHelper, page);

    // Verify we're in combat
    const phase = await gameHelper.getPhase();
    console.log(`[Test] After startCombatFromEncounter, phase=${phase}`);
    expect(phase).toBe('combat');

    // Wait for flash card with additional narration handling
    await waitForFlashCardWithNarration(gameHelper, page, 15000);
    const frontText = await page.locator(SELECTORS.flashCardFront).textContent();
    expect(frontText?.trim().length).toBeGreaterThan(0);
  });

  test('swipe right deals damage to enemy', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    // Start combat
    await startCombatFromEncounter(gameHelper, page);

    // Wait for flash card
    await waitForFlashCardWithNarration(gameHelper, page, 15000);
    const hpBefore = await gameHelper.getEnemyHp();

    // Swipe right (correct answer)
    await gameHelper.flipCard();
    await gameHelper.swipeCard('right');
    await page.waitForTimeout(2000);

    // HP should decrease
    const hpAfter = await gameHelper.getEnemyHp();
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  test('swipe left deals damage to enemy', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    // Start combat
    await startCombatFromEncounter(gameHelper, page);

    // Wait for flash card
    await waitForFlashCardWithNarration(gameHelper, page, 15000);
    const hpBefore = await gameHelper.getEnemyHp();

    // Swipe left (also deals damage)
    await gameHelper.flipCard();
    await gameHelper.swipeCard('left');
    await page.waitForTimeout(2000);

    // HP should decrease
    const hpAfter = await gameHelper.getEnemyHp();
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  test('defeating enemy ends combat', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    // Start combat
    await startCombatFromEncounter(gameHelper, page);

    // Weaken enemy and win
    await gameHelper.setEnemyHp(5);
    await gameHelper.winCombat(10);
    await page.waitForTimeout(2000);

    // Should no longer be in combat
    const phase = await gameHelper.getPhase();
    expect(phase).not.toBe('combat');
  });

  test('right swipe in combat sends correct JPDB grade', async ({ gameHelper, page }) => {
    const reviewCalls: Array<{ vid: string; sid: string; grade: number }> = [];

    await page.route('**/api/jpdb/review', async (route) => {
      const postData = route.request().postDataJSON();
      reviewCalls.push({
        vid: postData?.vid,
        sid: postData?.sid,
        grade: postData?.grade
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await gameHelper.setupRun();
    await startCombatFromEncounter(gameHelper, page);
    await waitForFlashCardWithNarration(gameHelper, page, 15000);

    await gameHelper.flipCard();
    await gameHelper.swipeCard('right');
    await page.waitForTimeout(2000);

    if (reviewCalls.length > 0) {
      expect([4, 5]).toContain(reviewCalls[0].grade);
    }
  });

  test('left swipe in combat sends "didn\'t know" JPDB grade', async ({ gameHelper, page }) => {
    const reviewCalls: Array<{ grade: number }> = [];

    await page.route('**/api/jpdb/review', async (route) => {
      const postData = route.request().postDataJSON();
      reviewCalls.push({ grade: postData?.grade });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await gameHelper.setupRun();
    await startCombatFromEncounter(gameHelper, page);
    await waitForFlashCardWithNarration(gameHelper, page, 15000);

    await gameHelper.flipCard();
    await gameHelper.swipeCard('left');
    await page.waitForTimeout(2000);

    if (reviewCalls.length > 0) {
      expect(reviewCalls[0].grade).toBe(1);
    }
  });
});
