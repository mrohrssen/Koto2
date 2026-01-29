// tests/e2e/specs/rooms/quiz.spec.ts
import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Quiz Room', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.enableDebugMode();
    // Queue quiz as first room
    await gameHelper.queueRooms(['quiz', 'encounter', 'boss']);
  });

  /** Helper to dismiss any narration box that appears */
  async function dismissNarration(page: import('@playwright/test').Page) {
    const narrationBox = page.locator(SELECTORS.narrationBox);
    const narrationIndicator = page.locator(SELECTORS.narrationIndicator);
    // Keep clicking narration boxes until they're gone or no indicator visible
    for (let i = 0; i < 3; i++) {
      const boxVisible = await narrationBox.isVisible().catch(() => false);
      const indicatorVisible = await narrationIndicator.isVisible().catch(() => false);
      if (boxVisible && indicatorVisible) {
        // Use force: true to bypass any overlapping elements
        await narrationBox.click({ force: true });
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }
  }

  test('quiz room shows question with answer options', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    // Should be in quiz phase
    await gameHelper.waitForPhase(['quiz'], 8000);

    // Dismiss intro narration if present
    await dismissNarration(page);

    // Quiz answer options should be visible
    const answerOptions = page.locator(SELECTORS.quizAnswerOption);
    await expect(answerOptions.first()).toBeVisible({ timeout: 5000 });

    // Should have multiple options
    const count = await answerOptions.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('answering quiz shows result', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    await gameHelper.waitForPhase(['quiz'], 8000);

    // Dismiss intro narration if present
    await dismissNarration(page);

    // Click first answer
    const answerOption = page.locator(SELECTORS.quizAnswerOption).first();
    await expect(answerOption).toBeVisible({ timeout: 5000 });
    await answerOption.click();
    await page.waitForTimeout(1500);

    // Should show reward options or narration
    const rewardVisible = await page.locator(SELECTORS.quizRewardOption).first().isVisible().catch(() => false);
    const narrationVisible = await page.locator(SELECTORS.narrationBox).isVisible().catch(() => false);

    expect(rewardVisible || narrationVisible).toBe(true);
  });

  test('completing quiz continues run', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    await gameHelper.waitForPhase(['quiz'], 8000);

    // Dismiss intro narration if present
    await dismissNarration(page);

    // Answer question
    await page.locator(SELECTORS.quizAnswerOption).first().click();
    await page.waitForTimeout(1000);

    // Dismiss result narration if shown
    await dismissNarration(page);

    // Pick reward if shown
    const rewardOption = page.locator(SELECTORS.quizRewardOption).first();
    if (await rewardOption.isVisible().catch(() => false)) {
      await rewardOption.click();
      await page.waitForTimeout(500);
    }

    // Should have left quiz phase
    const phase = await gameHelper.getPhase();
    expect(phase).not.toBe('quiz');
  });

  test('correct quiz answer shows reward options', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();
    await gameHelper.waitForPhase(['quiz'], 8000);
    await dismissNarration(page);

    // Intercept quiz answer submission to get the response
    let answerResponse: any = null;
    await page.route('**/api/game/quiz-answer', async (route) => {
      const response = await route.fetch();
      answerResponse = await response.json();
      await route.fulfill({ response });
    });

    // Click first answer option
    const answerOption = page.locator(SELECTORS.quizAnswerOption).first();
    await expect(answerOption).toBeVisible({ timeout: 5000 });
    await answerOption.click();
    await page.waitForTimeout(1500);

    // Dismiss result narration if shown (correct answers show narration before rewards)
    await dismissNarration(page);

    // Check response - if correct, rewards should appear
    if (answerResponse?.correct) {
      const rewardOption = page.locator(SELECTORS.quizRewardOption).first();
      await expect(rewardOption).toBeVisible({ timeout: 3000 });
    } else {
      const rewardCount = await page.locator(SELECTORS.quizRewardOption).count();
      expect(rewardCount).toBe(0);
    }
  });

  test('selecting reward applies it to player state', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();
    await gameHelper.waitForPhase(['quiz'], 8000);
    await dismissNarration(page);

    const hpBefore = await gameHelper.getPlayerHp();
    const maxHpBefore = await gameHelper.getPlayerMaxHp();

    if (hpBefore === maxHpBefore) {
      await gameHelper.setPlayerHp(maxHpBefore - 10);
      await page.waitForTimeout(300);
    }
    const hpBeforeQuiz = await gameHelper.getPlayerHp();

    let wasCorrect = false;
    await page.route('**/api/game/quiz-answer', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      wasCorrect = data?.correct ?? false;
      await route.fulfill({ response });
    });

    await page.locator(SELECTORS.quizAnswerOption).first().click();
    await page.waitForTimeout(1500);
    await dismissNarration(page);

    if (wasCorrect) {
      const healReward = page.locator('[data-reward="heal"]');
      if (await healReward.isVisible().catch(() => false)) {
        await healReward.click();
        await page.waitForTimeout(1000);
        const hpAfter = await gameHelper.getPlayerHp();
        expect(hpAfter).toBeGreaterThan(hpBeforeQuiz);
      } else {
        const anyReward = page.locator(SELECTORS.quizRewardOption).first();
        if (await anyReward.isVisible().catch(() => false)) {
          await anyReward.click();
          await page.waitForTimeout(500);
        }
      }
    }

    const phase = await gameHelper.getPhase();
    expect(phase).not.toBe('quiz');
  });
});
