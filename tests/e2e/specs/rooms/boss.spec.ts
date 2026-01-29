// tests/e2e/specs/rooms/boss.spec.ts
import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Boss Room', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.enableDebugMode();
  });

  test('boss room shows boss fight button', async ({ gameHelper, page }) => {
    // Use debug force phase to get to boss directly
    await gameHelper.setupRun();
    await gameHelper.forcePhase('boss_ready');

    // Boss fight button should be visible
    const bossFightBtn = page.locator(SELECTORS.bossFightBtn);
    await expect(bossFightBtn).toBeVisible({ timeout: 5000 });
  });

  test('boss fight starts combat', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();
    await gameHelper.forcePhase('boss_ready');

    // Click boss fight
    await page.locator(SELECTORS.bossFightBtn).click();
    await page.waitForTimeout(1000);

    // Should be in combat
    const phase = await gameHelper.getPhase();
    expect(['combat', 'boss_combat']).toContain(phase);

    // Enemy should be visible
    await expect(page.locator(SELECTORS.enemySpriteContainer)).toBeVisible();
  });

  test('defeating boss completes floor', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();
    await gameHelper.forcePhase('boss_ready');

    // Start boss fight
    await page.locator(SELECTORS.bossFightBtn).click();

    // Wait for combat phase
    await gameHelper.waitForPhase(['combat', 'boss_combat'], 8000);

    // Boss dialogue may appear - dismiss it by clicking on narration box
    const narrationBox = page.locator(SELECTORS.narrationBox);
    const narrationIndicator = page.locator(SELECTORS.narrationIndicator);

    // Wait for either narration or flash card
    await Promise.race([
      narrationBox.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
      page.locator(SELECTORS.flashCard).waitFor({ state: 'visible', timeout: 5000 }).catch(() => null)
    ]);

    // Dismiss narration if visible (boss dialogue) - use force to bypass sprite overlay
    for (let i = 0; i < 3; i++) {
      if (await narrationBox.isVisible().catch(() => false) &&
          await narrationIndicator.isVisible().catch(() => false)) {
        await narrationBox.click({ force: true });
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }

    // Wait for flash card UI to appear (combat loop takes time to start)
    await page.locator(SELECTORS.flashCard).waitFor({ state: 'visible', timeout: 10000 });

    // Weaken boss and win - set HP very low so one attack kills it
    await gameHelper.setEnemyHp(1);

    // Complete combat rounds to kill the boss
    await gameHelper.winCombat(10);

    // Wait for combat to end and transition to next phase
    await page.waitForFunction(
      async () => {
        const res = await fetch('/api/game/state');
        const state = await res.json();
        return state?.phase !== 'combat' && state?.phase !== 'boss_combat';
      },
      { timeout: 15000, polling: 500 }
    );

    // Should be in floor complete or similar state
    const phase = await gameHelper.getPhase();
    expect(['floor_complete', 'hub', 'ward_selection', 'victory', 'exploring']).toContain(phase);
  });
});
