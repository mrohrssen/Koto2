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
});
