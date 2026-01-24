import { test, expect, setupCombat } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Word Practice', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCombat(gameHelper);
  });

  test('flash card front shows Japanese word', async ({ gameHelper, page }) => {
    await gameHelper.waitForFlashCard(10000);
    const frontText = await page.locator(SELECTORS.flashCardFront).textContent();
    expect(frontText?.trim().length).toBeGreaterThan(0);
  });

  test('card flip reveals reading and meaning', async ({ gameHelper, page }) => {
    await gameHelper.waitForFlashCard(10000);
    await gameHelper.flipCard();
    const isFlipped = await page.locator(SELECTORS.flashCard).evaluate(
      el => el.classList.contains('flipped')
    );
    expect(isFlipped).toBe(true);
    // Reading may be empty when using fallback words (no JPDB API key)
    const reading = await page.locator(SELECTORS.flashCardReading).textContent();
    expect(reading).not.toBeNull();
    const meaning = await page.locator(SELECTORS.flashCardMeaning).textContent();
    expect(meaning?.trim().length).toBeGreaterThan(0);
  });

  test('mouse gesture swipe triggers combat resume', async ({ gameHelper }) => {
    await gameHelper.waitForFlashCard(10000);
    const hpBefore = await gameHelper.getEnemyHp();
    await gameHelper.swipeCardGesture('right');
    await gameHelper.page.waitForTimeout(2000);
    const hpAfter = await gameHelper.getEnemyHp();
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  test('new card appears after swipe', async ({ gameHelper, page }) => {
    await gameHelper.waitForFlashCard(10000);
    await gameHelper.flipCard();
    await gameHelper.swipeCard('right');
    await gameHelper.page.waitForTimeout(2000);
    // Either next card appears (still in combat) or combat ended
    const phase = await gameHelper.getPhase();
    if (phase === 'combat') {
      await gameHelper.waitForFlashCard(8000);
      const frontText = await page.locator(SELECTORS.flashCardFront).textContent();
      expect(frontText?.trim().length).toBeGreaterThan(0);
    }
    // If combat ended (enemy died in one hit), that's valid — card cycle happened
  });
});
