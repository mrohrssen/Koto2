import { test, expect, resetGameState, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Character Creation', () => {
  test.beforeEach(async ({ page }) => {
    await resetGameState(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should show create character modal for new game', async ({ page }) => {
    // On a fresh game, the create character modal or button should be visible
    const modal = page.locator(SELECTORS.createCharModal);
    const actionPanel = page.locator(SELECTORS.actionPanel);

    // Either modal is shown or there's a button to create character
    const modalVisible = await modal.isVisible();
    const hasCreateBtn = await actionPanel.locator('button').first().isVisible();

    expect(modalVisible || hasCreateBtn).toBeTruthy();
  });

  test('should create character with default name', async ({ gameHelper }) => {
    await gameHelper.createCharacter('');
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('hub');
  });

  test('should create character with custom name', async ({ page, gameHelper }) => {
    await gameHelper.createCharacter('CyberNinja');

    const playerName = await page.locator(SELECTORS.playerNameDisplay).textContent();
    expect(playerName).toContain('CyberNinja');
  });

  test('should have stat points to allocate', async ({ page, gameHelper }) => {
    // Open character creation
    const modal = page.locator(SELECTORS.createCharModal);
    if (!(await modal.isVisible())) {
      const createBtn = page.locator(`${SELECTORS.actionPanel} button`).first();
      if (await createBtn.isVisible()) {
        await createBtn.click();
      }
    }
    await expect(modal).toBeVisible();

    // Stat points display should exist and have a number
    const pointsText = await page.locator(SELECTORS.createStatPoints).textContent();
    expect(pointsText).toBeTruthy();
    expect(parseInt(pointsText || '0')).toBeGreaterThanOrEqual(0);
  });

  test('should allocate stat points during creation', async ({ page, gameHelper }) => {
    const modal = page.locator(SELECTORS.createCharModal);
    if (!(await modal.isVisible())) {
      const createBtn = page.locator(`${SELECTORS.actionPanel} button`).first();
      if (await createBtn.isVisible()) {
        await createBtn.click();
      }
    }
    await expect(modal).toBeVisible();

    // Default STR starts at 5
    const initialStr = await gameHelper.getCreateStatValue('str');
    expect(initialStr).toBe(5);

    // Click plus button to increase
    await page.click(`${SELECTORS.statPlus}[data-stat="str"]`);
    await page.click(`${SELECTORS.statPlus}[data-stat="str"]`);

    const newStr = await gameHelper.getCreateStatValue('str');
    expect(newStr).toBeGreaterThan(initialStr);
  });

  test('should update derived stats preview when allocating', async ({ page }) => {
    const modal = page.locator(SELECTORS.createCharModal);
    if (!(await modal.isVisible())) {
      const createBtn = page.locator(`${SELECTORS.actionPanel} button`).first();
      if (await createBtn.isVisible()) {
        await createBtn.click();
      }
    }
    await expect(modal).toBeVisible();

    const initialAtk = await page.locator(SELECTORS.previewAtk).textContent();
    await page.click(`${SELECTORS.statPlus}[data-stat="str"]`);
    await page.click(`${SELECTORS.statPlus}[data-stat="str"]`);
    await page.click(`${SELECTORS.statPlus}[data-stat="str"]`);

    const newAtk = await page.locator(SELECTORS.previewAtk).textContent();
    expect(parseInt(newAtk || '0')).toBeGreaterThan(parseInt(initialAtk || '0'));
  });

  test('should reset stats to default values', async ({ page, gameHelper }) => {
    const modal = page.locator(SELECTORS.createCharModal);
    if (!(await modal.isVisible())) {
      const createBtn = page.locator(`${SELECTORS.actionPanel} button`).first();
      if (await createBtn.isVisible()) {
        await createBtn.click();
      }
    }
    await expect(modal).toBeVisible();

    // Note initial stat points
    const initialPoints = await gameHelper.getCreateStatPoints();

    // Allocate some stats
    await page.click(`${SELECTORS.statPlus}[data-stat="str"]`);
    await page.click(`${SELECTORS.statPlus}[data-stat="str"]`);

    // Points should have decreased
    const midPoints = await gameHelper.getCreateStatPoints();
    expect(midPoints).toBeLessThan(initialPoints);

    // Reset
    await page.click(SELECTORS.resetStatsBtn);

    // Check stats are back to default (5 is the default)
    const strValue = await gameHelper.getCreateStatValue('str');
    expect(strValue).toBe(5);

    // Points should be restored
    const finalPoints = await gameHelper.getCreateStatPoints();
    expect(finalPoints).toBe(initialPoints);
  });
});
