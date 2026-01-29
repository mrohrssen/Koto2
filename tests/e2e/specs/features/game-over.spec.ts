import { test, expect, setupCombat, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Game Over', () => {
  test('player death opens gameover takeover', async ({ gameHelper, page }) => {
    await setupCombat(gameHelper);
    // Set player HP to 1 so next enemy hit kills them
    await gameHelper.setPlayerHp(1);
    // Swipe left (low grade = less player damage) to let enemy attack
    await gameHelper.waitForFlashCard(10000);
    await gameHelper.flipCard();
    await gameHelper.swipeCard('left');
    // Wait for combat to process — enemy should kill player
    await page.waitForTimeout(3000);
    // Click narration box to dismiss it (defeat narration requires click-to-continue)
    const narrationBox = page.locator(SELECTORS.narrationBox);
    if (await narrationBox.isVisible().catch(() => false)) {
      await narrationBox.click();
      await page.waitForTimeout(500);
    }
    // Gameover takeover should open
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.gameoverView);
    expect(isOpen).toBe(true);
  });

  test('Return to Hub button from gameover works', async ({ gameHelper, page }) => {
    await setupCombat(gameHelper);
    await gameHelper.setPlayerHp(1);
    await gameHelper.waitForFlashCard(10000);
    await gameHelper.flipCard();
    await gameHelper.swipeCard('left');
    await page.waitForTimeout(3000);
    // Click narration box to dismiss it (defeat narration requires click-to-continue)
    const narrationBox = page.locator(SELECTORS.narrationBox);
    if (await narrationBox.isVisible().catch(() => false)) {
      await narrationBox.click();
      await page.waitForTimeout(500);
    }
    // Click Return to Hub
    await page.locator(SELECTORS.gameoverHubBtn).waitFor({ state: 'visible', timeout: 5000 });
    await page.locator(SELECTORS.gameoverHubBtn).click();
    // Wait for forfeit API + state reload to complete
    await gameHelper.waitForPhase(['hub'], 10000);
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('hub');
  });

  test('reset run button forfeits and returns to hub', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await gameHelper.setupRun();
    // Set up dialog handler before clicking (window.confirm)
    page.on('dialog', dialog => dialog.accept());
    await page.locator(SELECTORS.resetRunBtn).click();
    await page.waitForTimeout(2000);
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('hub');
  });
});
