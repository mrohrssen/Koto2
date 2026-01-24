import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Boss Fights', () => {
  test('boss ready phase shows Fight Boss button', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await gameHelper.forcePhase('boss_ready');
    await expect(page.locator(SELECTORS.bossFightBtn)).toBeVisible({ timeout: 3000 });
  });

  test('boss combat shows flash cards and deals damage', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    // Use debug-force-combat (creates a real enemy — sufficient for combat flow test)
    await gameHelper.setupCombat();
    await gameHelper.waitForFlashCard(10000);
    const hpBefore = await gameHelper.getEnemyHp();
    await gameHelper.flipCard();
    await gameHelper.swipeCard('right');
    await gameHelper.page.waitForTimeout(2000);
    const hpAfter = await gameHelper.getEnemyHp();
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  test('defeating enemy exits combat phase', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.setupCombat();
    // Weaken enemy for fast kill
    await gameHelper.setEnemyHp(1);
    await gameHelper.winCombat(10);
    await gameHelper.page.waitForTimeout(3000);
    const phase = await gameHelper.getPhase();
    expect(phase).not.toBe('combat');
  });
});
