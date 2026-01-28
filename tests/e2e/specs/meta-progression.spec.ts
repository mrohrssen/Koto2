import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Meta Progression', () => {
  test('essence starts at 0 for new character', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await expect(page.locator(SELECTORS.essenceDisplay)).toHaveText('0');
  });

  test('essence accumulates after completing an encounter', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await gameHelper.setupRun();
    // Win a fight to earn essence
    const found = await gameHelper.proceedToEncounter(50);
    expect(found).toBe(true);
    await page.locator(SELECTORS.fightBtn).click();
    await gameHelper.waitForPhase(['combat'], 5000);
    // Weaken enemy for fast kill
    await gameHelper.setEnemyHp(5);
    await gameHelper.winCombat(10);
    await gameHelper.page.waitForTimeout(3000);
    // Forfeit to end run and award essence
    await gameHelper.forfeitRun();
    const essence = await gameHelper.getPlayerEssence();
    expect(essence).toBeGreaterThan(0);
  });
});
