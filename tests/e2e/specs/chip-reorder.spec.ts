import { test, expect } from '@playwright/test';

test.describe('Chip Reorder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.chip-row');
  });

  test('swap button appears in chip popup', async ({ page }) => {
    // Click first non-empty chip slot
    const chipSlot = page.locator('.chip-slot').first();
    await chipSlot.click();

    // Wait for popup to appear
    await expect(page.locator('.chip-popup.visible')).toBeVisible();

    // Verify swap button exists
    await expect(page.locator('.chip-popup-swap')).toBeVisible();
  });

  test('clicking swap enters swap mode with glowing targets', async ({ page }) => {
    // Click first chip slot
    await page.locator('.chip-slot').first().click();
    await expect(page.locator('.chip-popup.visible')).toBeVisible();

    // Click swap button
    await page.locator('.chip-popup-swap').click();

    // Popup should close
    await expect(page.locator('.chip-popup.visible')).not.toBeVisible();

    // Other chips should have swap-target class
    const swapTargets = page.locator('.chip-slot.swap-target');
    await expect(swapTargets).toHaveCount(4);
  });

  test('clicking another chip completes swap', async ({ page }) => {
    // Get initial chip order via API
    const initialOrder = await page.evaluate(async () => {
      const res = await fetch('/api/game/chip-loadout');
      const data = await res.json();
      return data.equipment?.weapon?.equippedChips?.map(c => c?.id) || [];
    });

    if (initialOrder.filter(Boolean).length < 2) {
      test.skip();
      return;
    }

    // Click first chip, then swap, then second chip
    await page.locator('.chip-slot').first().click();
    await page.locator('.chip-popup-swap').click();
    await page.locator('.chip-slot').nth(1).click();

    // Swap mode should exit (no more swap-target classes)
    await expect(page.locator('.chip-slot.swap-target')).toHaveCount(0);

    // Verify order changed via API
    const newOrder = await page.evaluate(async () => {
      const res = await fetch('/api/game/chip-loadout');
      const data = await res.json();
      return data.equipment?.weapon?.equippedChips?.map(c => c?.id) || [];
    });

    // First two chips should be swapped
    expect(newOrder[0]).toBe(initialOrder[1]);
    expect(newOrder[1]).toBe(initialOrder[0]);
  });

  test('clicking outside cancels swap mode', async ({ page }) => {
    await page.locator('.chip-slot').first().click();
    await page.locator('.chip-popup-swap').click();

    // Should be in swap mode
    await expect(page.locator('.chip-slot.swap-target')).toHaveCount(4);

    // Click outside chip row
    await page.locator('.scene-area').click();

    // Swap mode should exit
    await expect(page.locator('.chip-slot.swap-target')).toHaveCount(0);
  });

  test('clicking same chip cancels swap mode', async ({ page }) => {
    await page.locator('.chip-slot').first().click();
    await page.locator('.chip-popup-swap').click();

    // Should be in swap mode
    await expect(page.locator('.chip-slot.swap-target')).toHaveCount(4);

    // Click the source chip again
    await page.locator('.chip-slot').first().click();

    // Swap mode should exit
    await expect(page.locator('.chip-slot.swap-target')).toHaveCount(0);
  });

  test('chip slots have correct data-index attributes', async ({ page }) => {
    const slots = await page.$$eval('.chip-slot', els =>
      els.map(el => el.dataset.index)
    );
    expect(slots).toEqual(['0', '1', '2', '3', '4']);
  });

  test('reorder endpoint accepts valid chip order', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const loadoutRes = await fetch('/api/game/chip-loadout');
      const loadout = await loadoutRes.json();

      if (!loadout.equipment?.weapon?.equippedChips?.length) {
        return { skipped: true, reason: 'No chips equipped' };
      }

      const chipIds = loadout.equipment.weapon.equippedChips.map(c => c?.id || null);
      const reversed = [...chipIds].reverse();

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

  test('reorder endpoint rejects invalid chip count', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const loadoutRes = await fetch('/api/game/chip-loadout');
      const loadout = await loadoutRes.json();

      if (!loadout.equipment?.weapon) {
        return { skipped: true, reason: 'No weapon equipped' };
      }

      const res = await fetch('/api/game/reorder-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chipIds: ['chip1', 'chip2'] })
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
