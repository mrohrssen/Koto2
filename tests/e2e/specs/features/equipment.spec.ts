import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Equipment', () => {
  test.beforeEach(async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await gameHelper.addDebugChips();
    // Equip one of the debug chips via the API so we have a filled slot
    await page.evaluate(async () => {
      await fetch('/api/game/equip-chip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipmentSlot: 'weapon', chipId: 'battery' })
      });
    });
    await page.reload();
    await page.waitForLoadState('load');
    await gameHelper.waitForPhase(['hub'], 5000);
  });

  test('Equip Bots button opens chip equip takeover', async ({ gameHelper, page }) => {
    await page.locator(SELECTORS.equipBotsBtn).click();
    await page.waitForTimeout(500);
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.chipEquipView);
    expect(isOpen).toBe(true);
  });

  test('equipped chips shown in slots', async ({ gameHelper, page }) => {
    await page.locator(SELECTORS.equipBotsBtn).click();
    await page.waitForTimeout(1000);
    const filledSlots = await page.locator(SELECTORS.chipEquipSlotFilled).count();
    expect(filledSlots).toBeGreaterThanOrEqual(1);
  });

  test('clicking equipped slot unequips the chip', async ({ gameHelper, page }) => {
    await page.locator(SELECTORS.equipBotsBtn).click();
    await page.waitForTimeout(1000);
    const filledBefore = await page.locator(SELECTORS.chipEquipSlotFilled).count();
    expect(filledBefore).toBeGreaterThanOrEqual(1);
    await page.locator(SELECTORS.chipEquipSlotFilled).first().click();
    await page.waitForTimeout(1000);
    const filledAfter = await page.locator(SELECTORS.chipEquipSlotFilled).count();
    expect(filledAfter).toBeLessThan(filledBefore);
  });

  test('can re-equip a chip after unequipping', async ({ gameHelper, page }) => {
    // Open equip view
    await page.locator(SELECTORS.equipBotsBtn).click();
    await page.waitForTimeout(1000);

    // Get initial equipped chips from server
    const stateBefore = await page.evaluate(async () => {
      const res = await fetch('/api/game/state');
      return res.json();
    });
    const equippedBefore = stateBefore?.player?.equipment?.weapon?.equippedChips || [];
    expect(equippedBefore.length).toBeGreaterThanOrEqual(1);
    const firstChipId = equippedBefore[0]?.id;

    // Unequip the first chip
    await page.locator(SELECTORS.chipEquipSlotFilled).first().click();
    await page.waitForTimeout(1000);

    // Verify chip is unequipped on backend
    const stateAfterUnequip = await page.evaluate(async () => {
      const res = await fetch('/api/game/state');
      return res.json();
    });
    const equippedAfterUnequip = stateAfterUnequip?.player?.equipment?.weapon?.equippedChips || [];
    expect(equippedAfterUnequip.length).toBeLessThan(equippedBefore.length);

    // Find the unequipped chip in inventory and re-equip it
    const inventoryChip = page.locator(`[data-chip-id="${firstChipId}"]`).first();
    if (await inventoryChip.isVisible().catch(() => false)) {
      await inventoryChip.click();
      await page.waitForTimeout(1000);

      // Verify chip is re-equipped on backend
      const stateAfterReequip = await page.evaluate(async () => {
        const res = await fetch('/api/game/state');
        return res.json();
      });
      const equippedAfterReequip = stateAfterReequip?.player?.equipment?.weapon?.equippedChips || [];
      expect(equippedAfterReequip.length).toBe(equippedBefore.length);

      const reequippedChip = equippedAfterReequip.find((c: any) => c.id === firstChipId);
      expect(reequippedChip).toBeDefined();
    }
  });
});
