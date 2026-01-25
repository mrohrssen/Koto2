import { test, expect } from '@playwright/test';

test.describe('Chip Reorder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for game to load
    await page.waitForSelector('.chip-row');
  });

  test('reorder endpoint accepts valid chip order', async ({ page }) => {
    // This tests the API directly since simulating long-press drag is complex
    const response = await page.evaluate(async () => {
      // Get current chip loadout
      const loadoutRes = await fetch('/api/game/chip-loadout');
      const loadout = await loadoutRes.json();

      if (!loadout.equipment?.weapon?.equippedChips?.length) {
        return { skipped: true, reason: 'No chips equipped' };
      }

      const chipIds = loadout.equipment.weapon.equippedChips.map(c => c?.id || null);

      // Reverse the order
      const reversed = [...chipIds].reverse();

      // Call reorder
      const reorderRes = await fetch('/api/game/reorder-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chipIds: reversed })
      });

      return await reorderRes.json();
    });

    if (response.skipped) {
      test.skip();
    } else {
      expect(response.success).toBe(true);
    }
  });

  test('chip slots have correct data-index attributes', async ({ page }) => {
    const slots = await page.$$eval('.chip-slot', els =>
      els.map(el => el.dataset.index)
    );

    expect(slots).toEqual(['0', '1', '2', '3', '4']);
  });

  test('reorder endpoint rejects invalid chip count', async ({ page }) => {
    const response = await page.evaluate(async () => {
      // First check if we have a weapon equipped
      const loadoutRes = await fetch('/api/game/chip-loadout');
      const loadout = await loadoutRes.json();

      if (!loadout.equipment?.weapon) {
        return { skipped: true, reason: 'No weapon equipped' };
      }

      const res = await fetch('/api/game/reorder-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chipIds: ['chip1', 'chip2'] }) // Only 2, need 5
      });
      return await res.json();
    });

    if (response.skipped) {
      test.skip();
    } else {
      expect(response.error).toContain('5 elements');
    }
  });
});
