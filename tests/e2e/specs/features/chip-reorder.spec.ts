import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Chip Reorder', () => {
  test.beforeEach(async ({ gameHelper, page }) => {
    // Set up character with debug chips equipped
    await setupCharacter(gameHelper);
    await gameHelper.addDebugChips();

    // Equip all available chips from inventory for swap testing
    await page.evaluate(async () => {
      // Get player's chips from inventory
      const loadoutRes = await fetch('/api/game/chip-loadout');
      const loadout = await loadoutRes.json();
      const inventoryChips = loadout.inventory || [];

      // Equip up to 5 chips
      for (const chip of inventoryChips.slice(0, 5)) {
        await fetch('/api/game/equip-chip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ equipmentSlot: 'weapon', chipId: chip.id })
        });
      }
    });

    await page.reload();
    await page.waitForLoadState('load');
    await gameHelper.waitForPhase(['hub'], 5000);

    // Wait for a chip slot with an actual chip (not empty)
    await page.waitForSelector('.chip-slot .chip-icon:not(.empty)');
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
    // Count equipped chips first
    const equippedCount = await page.evaluate(async () => {
      const res = await fetch('/api/game/chip-loadout');
      const data = await res.json();
      return (data.equipment?.weapon?.equippedChips || []).filter(Boolean).length;
    });

    if (equippedCount < 2) {
      test.skip();
      return;
    }

    // Click first chip slot
    await page.locator('.chip-slot').first().click();
    await expect(page.locator('.chip-popup.visible')).toBeVisible();

    // Click swap button
    await page.locator('.chip-popup-swap').click();

    // Popup should close
    await expect(page.locator('.chip-popup.visible')).not.toBeVisible();

    // Other chips should have swap-target class (equipped count - 1)
    const swapTargets = page.locator('.chip-slot.swap-target');
    await expect(swapTargets).toHaveCount(equippedCount - 1);
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

    // Wait for reorder API call to complete after clicking
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/game/reorder-chips') && resp.status() === 200),
      page.locator('.chip-slot').nth(1).click()
    ]);

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

    // Should be in swap mode (at least 1 swap target)
    await expect(page.locator('.chip-slot.swap-target').first()).toBeVisible();

    // Click outside chip row
    await page.locator('.scene-area').click();

    // Swap mode should exit
    await expect(page.locator('.chip-slot.swap-target')).toHaveCount(0);
  });

  test('clicking same chip cancels swap mode', async ({ page }) => {
    await page.locator('.chip-slot').first().click();
    await page.locator('.chip-popup-swap').click();

    // Should be in swap mode (at least 1 swap target)
    await expect(page.locator('.chip-slot.swap-target').first()).toBeVisible();

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
      // Pad to 5 elements with nulls for empty slots
      while (chipIds.length < 5) {
        chipIds.push(null);
      }
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
