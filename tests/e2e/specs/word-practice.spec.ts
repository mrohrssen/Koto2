import { test, expect, setupCharacter, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Word Practice Structure', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should have word cards container', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const wordCardsContainer = page.locator(SELECTORS.wordCards);
    await expect(wordCardsContainer).toBeAttached();
  });

  test('should have word input modal structure', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const inputModal = page.locator(SELECTORS.wordInputModal);
    await expect(inputModal).toBeAttached();
  });

  test('should have self-grade modal structure', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const gradeModal = page.locator(SELECTORS.selfGradeModal);
    await expect(gradeModal).toBeAttached();
  });

  test('should have word definition input', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const input = page.locator(SELECTORS.wordDefinitionInput);
    await expect(input).toBeAttached();
  });

  test('should have word feedback element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const feedback = page.locator(SELECTORS.wordFeedback);
    await expect(feedback).toBeAttached();
  });

  test('should have review buttons in self-grade modal', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const gradeModal = page.locator(SELECTORS.selfGradeModal);
    const reviewBtns = gradeModal.locator(SELECTORS.reviewBtn);

    // Should have 5 review buttons (1-5 grades)
    await expect(reviewBtns).toHaveCount(5);
  });
});
