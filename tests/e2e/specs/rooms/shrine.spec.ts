// tests/e2e/specs/rooms/shrine.spec.ts
import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Shrine Room', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.enableDebugMode();
    // Queue shrine as first room
    await gameHelper.queueRooms(['shrine', 'encounter', 'boss']);
  });

  test('shrine room shows chip options', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    // Should be in shrine phase
    await gameHelper.waitForPhase(['shrine'], 8000);

    // Shrine options should be visible
    const shrineOptions = page.locator(SELECTORS.shrineChipOption);
    await expect(shrineOptions.first()).toBeVisible({ timeout: 5000 });

    // Should have at least one option
    const count = await shrineOptions.count();
    expect(count).toBeGreaterThan(0);
  });

  test('selecting shrine chip continues run', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();

    await gameHelper.waitForPhase(['shrine'], 8000);

    // Click first shrine option
    const shrineOption = page.locator(SELECTORS.shrineChipOption).first();
    await expect(shrineOption).toBeVisible({ timeout: 5000 });
    await shrineOption.click();
    await page.waitForTimeout(1000);

    // Should have left shrine phase
    const phase = await gameHelper.getPhase();
    expect(phase).not.toBe('shrine');
  });

  test('selecting shrine chip increases its level', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();
    await gameHelper.waitForPhase(['shrine'], 8000);

    // Get current chip levels from server state before shrine selection
    // Chip levels are stored in run.player._chipLevels as a map { chipId: level }
    const stateBefore = await page.evaluate(async () => {
      const res = await fetch('/api/game/state');
      return res.json();
    });
    const chipLevelsBefore = stateBefore?.run?.player?._chipLevels || {};

    // Shrine options show the chipId in data-chip-id attribute
    const shrineOption = page.locator(SELECTORS.shrineChipOption).first();
    await expect(shrineOption).toBeVisible({ timeout: 5000 });
    const chipId = await shrineOption.getAttribute('data-chip-id');

    // Find this chip's level before upgrade (default is 1 if not in map)
    const levelBefore = chipLevelsBefore[chipId as string] ?? 1;

    // Click to upgrade and capture the API response directly
    const [shrineResponse] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/game/shrine-upgrade') && res.status() === 200),
      shrineOption.click()
    ]);
    const shrineResult = await shrineResponse.json();

    // The shrine-upgrade response includes newLevel and state
    const levelAfter = shrineResult?.newLevel ?? 1;

    // Verify level increased
    expect(levelAfter).toBe(levelBefore + 1);
  });
});
