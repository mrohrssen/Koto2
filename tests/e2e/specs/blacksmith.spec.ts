import { test, expect, setupCharacter, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Blacksmith/Chip Upgrade', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should open chip upgrade modal when clicking upgrade button in blacksmith room', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    // Wait for initial room
    const initialPhase = await gameHelper.getPhase();
    expect(['room', 'room_encounter', 'exploring']).toContain(initialPhase);

    // Use debug API to force blacksmith room
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/game/debug-force-blacksmith', { method: 'POST' });
      return res.json();
    });

    if (!response.success) {
      throw new Error(`Debug API failed: ${response.error || 'Unknown error'}`);
    }

    // Reload to see new room state
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify we're in a room phase
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('room');

    // Get room info from gameState
    const roomType = await page.evaluate(() => (window as any).gameState?.room?.type);
    expect(roomType).toBe('blacksmith');

    // Check for upgrade action button
    const actions = await page.evaluate(() => (window as any).gameState?.room?.actions);
    console.log('Room actions:', actions);
    expect(actions).toBeDefined();

    const upgradeAction = actions.find((a: any) => a.id === 'upgrade');
    expect(upgradeAction).toBeDefined();

    // Find and click the upgrade button
    const upgradeBtn = page.locator(`${SELECTORS.actionPanel} button`, { hasText: '強化' });
    await expect(upgradeBtn).toBeVisible({ timeout: 5000 });
    await upgradeBtn.click();

    // Chip upgrade modal should open
    await expect(page.locator(SELECTORS.chipUpgradeModal)).toBeVisible({ timeout: 5000 });
  });

  test('should have chip upgrade modal structure', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    // Chip upgrade modal exists but is hidden until opened
    const modal = page.locator(SELECTORS.chipUpgradeModal);
    await expect(modal).toBeAttached();
    await expect(modal).toHaveClass(/hidden/);
  });

  test('should show gold display in chip upgrade modal', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    // Force blacksmith room
    await page.evaluate(async () => {
      await fetch('/api/game/debug-force-blacksmith', { method: 'POST' });
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Click upgrade button
    const upgradeBtn = page.locator(`${SELECTORS.actionPanel} button`, { hasText: '強化' });
    await expect(upgradeBtn).toBeVisible({ timeout: 5000 });
    await upgradeBtn.click();

    // Check gold display
    const goldDisplay = page.locator(SELECTORS.chipUpgradeGold);
    await expect(goldDisplay).toBeVisible({ timeout: 5000 });
  });
});
