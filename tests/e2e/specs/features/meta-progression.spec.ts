import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Meta Progression', () => {
  test('essence starts at 0 for new character', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await expect(page.locator(SELECTORS.essenceDisplay)).toHaveText('0');
  });

  test('essence accumulates after completing an encounter', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    // Queue encounter rooms to ensure we get an encounter
    await gameHelper.queueRooms(['encounter', 'encounter', 'encounter', 'boss']);
    await gameHelper.setupRun();
    // Wait for encounter room
    await gameHelper.waitForPhase(['room_encounter'], 5000);
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
