// tests/e2e/specs/integration/full-playthrough.spec.ts
import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';
import { Page } from '@playwright/test';

/**
 * Integration tests for full game playthrough scenarios.
 * These tests verify that players can complete runs from start to finish.
 */

// Helper to dismiss any visible narration
async function dismissNarration(page: Page, maxAttempts = 10): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await page.evaluate(() => {
      const box = document.getElementById('narration-box');
      const indicator = box?.querySelector('.narration-indicator') as HTMLElement;
      const visible = box?.classList.contains('visible');
      const dismissible = indicator && indicator.style.display !== 'none';
      return { visible, dismissible };
    });

    if (result.visible && result.dismissible) {
      await page.click('body', { force: true });
      await page.waitForTimeout(600);
      continue;
    }
    return i > 0; // Return true if we dismissed at least once
  }
  return false;
}

test.describe('Full Playthrough Integration', () => {
  // Integration tests need longer timeouts
  test.setTimeout(90000);

  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.enableDebugMode();
  });

  test('can start a run and enter first room', async ({ gameHelper, page }) => {
    // Queue a simple room layout
    await gameHelper.queueRooms(['encounter', 'boss']);
    await gameHelper.setupRun();

    // Should be in a room now
    const phase = await gameHelper.getPhase();
    console.log('After setup phase:', phase);

    // Phase should be some kind of room state
    expect(['room_encounter', 'exploring', 'combat', 'boss_ready']).toContain(phase);

    // Enemy sprite or room UI should be visible
    const hasEnemy = await page.locator(SELECTORS.enemySpriteContainer).isVisible().catch(() => false);
    const hasFightBtn = await page.locator(SELECTORS.fightBtn).isVisible().catch(() => false);
    const hasBossBtn = await page.locator(SELECTORS.bossFightBtn).isVisible().catch(() => false);

    expect(hasEnemy || hasFightBtn || hasBossBtn).toBe(true);
  });

  test('can complete an encounter and defeat enemy', async ({ gameHelper, page }) => {
    // Queue encounter followed by boss (minimum run)
    await gameHelper.queueRooms(['encounter', 'boss']);
    await gameHelper.setupRun();

    // Navigate to combat
    await gameHelper.proceedToEncounter(10);

    // Click fight button if visible
    const fightBtn = page.locator(SELECTORS.fightBtn);
    if (await fightBtn.isVisible().catch(() => false)) {
      await fightBtn.click();
      await gameHelper.waitForPhase(['combat'], 5000);
    }

    // Dismiss enemy intro narration
    await dismissNarration(page, 5);

    // Get initial enemy HP
    const initialHp = await gameHelper.getEnemyHp();
    console.log('Initial enemy HP:', initialHp);
    expect(initialHp).toBeGreaterThan(0);

    // Set enemy HP low and win combat
    await gameHelper.setEnemyHp(1);
    await gameHelper.winCombat(10);

    // Wait for combat to end
    await page.waitForTimeout(2000);

    // Should no longer be in combat (or enemy dead)
    const finalHp = await gameHelper.getEnemyHp();
    const phase = await gameHelper.getPhase();
    console.log('After combat - HP:', finalHp, 'Phase:', phase);

    expect(phase !== 'combat' || finalHp <= 0).toBe(true);
  });

  test('can defeat boss and complete floor', async ({ gameHelper, page }) => {
    // Force directly to boss_ready phase for quick test
    await gameHelper.setupRun();
    await gameHelper.forcePhase('boss_ready');

    // Click boss fight button
    const bossFightBtn = page.locator(SELECTORS.bossFightBtn);
    await bossFightBtn.waitFor({ state: 'visible', timeout: 5000 });
    await bossFightBtn.click();

    // Wait for combat phase
    await gameHelper.waitForPhase(['combat', 'boss_combat'], 5000);

    // Dismiss boss intro narration
    await dismissNarration(page, 5);

    // Set boss HP very low and win
    await gameHelper.setEnemyHp(1);
    await gameHelper.winCombat(10);

    // Wait for transition
    await page.waitForTimeout(3000);

    // Should complete floor and return to hub or ward selection
    const phase = await gameHelper.getPhase();
    console.log('After boss phase:', phase);

    expect(['hub', 'floor_complete', 'ward_selection', 'victory']).toContain(phase);
  });

  test('player HP persists across encounters', async ({ gameHelper, page }) => {
    // Queue two encounters
    await gameHelper.queueRooms(['encounter', 'encounter', 'boss']);
    await gameHelper.setupRun();

    // Get starting HP
    const startHp = await gameHelper.getPlayerHp();
    console.log('Starting HP:', startHp);
    expect(startHp).toBeGreaterThan(0);

    // Complete first encounter quickly
    await gameHelper.proceedToEncounter(10);
    const fightBtn = page.locator(SELECTORS.fightBtn);
    if (await fightBtn.isVisible().catch(() => false)) {
      await fightBtn.click();
      await gameHelper.waitForPhase(['combat'], 5000);
    }
    await dismissNarration(page, 5);
    await gameHelper.setEnemyHp(1);
    await gameHelper.winCombat(10);
    await page.waitForTimeout(1000);

    // Check HP after first encounter (should be same or less due to no damage taken)
    const midHp = await gameHelper.getPlayerHp();
    console.log('HP after first encounter:', midHp);

    // HP should persist (not reset)
    expect(midHp).toBeLessThanOrEqual(startHp);
    expect(midHp).toBeGreaterThan(0);
  });
});
