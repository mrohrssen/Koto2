import { test, expect, setupCombat, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Combat', () => {
  test('combat shows enemy and HP bars', async ({ gameHelper, page }) => {
    await setupCombat(gameHelper);
    await expect(page.locator(SELECTORS.enemySpriteContainer)).toBeVisible();
    const name = await page.locator(SELECTORS.enemyName).textContent();
    expect(name?.trim().length).toBeGreaterThan(0);
    await expect(page.locator(SELECTORS.playerHpContainer)).toBeVisible();
  });

  test('flash card appears during combat', async ({ gameHelper, page }) => {
    await setupCombat(gameHelper);
    await gameHelper.waitForFlashCard(10000);
    const frontText = await page.locator(SELECTORS.flashCardFront).textContent();
    expect(frontText?.trim().length).toBeGreaterThan(0);
  });

  test('swipe right deals damage to enemy', async ({ gameHelper }) => {
    await setupCombat(gameHelper);
    await gameHelper.waitForFlashCard(10000);
    const hpBefore = await gameHelper.getEnemyHp();
    await gameHelper.flipCard();
    await gameHelper.swipeCard('right');
    await gameHelper.page.waitForTimeout(2000);
    const hpAfter = await gameHelper.getEnemyHp();
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  test('swipe left continues combat without crashing', async ({ gameHelper }) => {
    await setupCombat(gameHelper);
    await gameHelper.waitForFlashCard(10000);
    await gameHelper.flipCard();
    await gameHelper.swipeCard('left');
    await gameHelper.page.waitForTimeout(2000);
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('combat');
  });

  test('defeating enemy ends combat phase', async ({ gameHelper }) => {
    await setupCombat(gameHelper);
    // Weaken enemy so winCombat finishes quickly
    await gameHelper.setEnemyHp(5);
    await gameHelper.winCombat(10);
    await gameHelper.page.waitForTimeout(3000);
    const phase = await gameHelper.getPhase();
    expect(phase).not.toBe('combat');
  });

  test('Fight button disappears when combat starts', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await gameHelper.setupRun();
    const found = await gameHelper.proceedToEncounter(20);
    expect(found).toBe(true);
    await expect(page.locator(SELECTORS.fightBtn)).toBeVisible({ timeout: 3000 });
    await page.locator(SELECTORS.fightBtn).click();
    await gameHelper.waitForPhase(['combat'], 5000);
    await page.waitForTimeout(500);
    await expect(page.locator(SELECTORS.fightBtn)).not.toBeVisible();
  });
});
