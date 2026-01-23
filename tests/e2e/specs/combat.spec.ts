import { test, expect, setupCombat, setupCharacter, cleanupAfterTest } from '../fixtures/test-fixtures';
import { SELECTORS, ACTION_BTNS } from '../utils/selectors';

test.describe('Combat System', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should enter dungeon after ward selection', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const phase = await gameHelper.getPhase();
    expect(['exploring', 'room', 'room_encounter', 'combat']).toContain(phase);
  });

  test('should have enemy sprite element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    // Enemy sprite exists but is hidden in hub mode
    const enemySprite = page.locator(SELECTORS.enemySprite);
    await expect(enemySprite).toBeAttached();
  });

  test('should have enemy HP bar element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    // Enemy HP bar exists but is hidden in hub mode
    const enemyHpBar = page.locator(SELECTORS.enemyHpBar);
    await expect(enemyHpBar).toBeAttached();
  });

  test('should show word cards during combat', async ({ page, gameHelper }) => {
    const inCombat = await setupCombat(gameHelper);
    expect(inCombat).toBe(true);

    // Dismiss enemy dialogue if present (Enter key)
    const dialogueBubble = page.locator('.enemy-dialogue');
    if (await dialogueBubble.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }

    // Word cards should become visible (fallback words used when JPDB unavailable)
    await expect(page.locator(SELECTORS.wordCards)).toBeVisible({ timeout: 15000 });
  });

  test('should show enemy sprite during combat', async ({ page, gameHelper }) => {
    const inCombat = await setupCombat(gameHelper);
    expect(inCombat).toBe(true);

    // Enemy sprite should be visible during combat
    await expect(page.locator(SELECTORS.enemySprite)).toBeVisible({ timeout: 10000 });
  });

  test('should track player HP', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);

    const hp = await gameHelper.getPlayerHp();
    const maxHp = await gameHelper.getPlayerMaxHp();

    expect(maxHp).toBeGreaterThan(0);
    expect(hp).toBeLessThanOrEqual(maxHp);
  });

  test('should show VN stage during combat', async ({ page, gameHelper }) => {
    const inCombat = await setupCombat(gameHelper);
    expect(inCombat).toBe(true);

    // VN stage should be visible during combat
    const vnStage = page.locator(SELECTORS.vnStage);
    await expect(vnStage).toBeVisible({ timeout: 5000 });
  });

  test('should show floor indicator during combat', async ({ page, gameHelper }) => {
    const inCombat = await setupCombat(gameHelper);
    expect(inCombat).toBe(true);

    // Floor indicator should be visible during combat
    const floorIndicator = page.locator(SELECTORS.floorIndicator);
    await expect(floorIndicator).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Combat Actions', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should show combat indicator during combat', async ({ page, gameHelper }) => {
    const inCombat = await setupCombat(gameHelper);
    expect(inCombat).toBe(true);

    // Action panel should show combat indicator during combat
    const actionPanel = page.locator(SELECTORS.actionPanel);
    await expect(actionPanel).toBeVisible({ timeout: 10000 });

    // Wait for combat indicator text (戦闘中 or 戦闘開始)
    await expect(actionPanel).toContainText(/戦闘/, { timeout: 10000 });
  });

  test('should show enemy name when in combat', async ({ page, gameHelper }) => {
    const inCombat = await setupCombat(gameHelper);
    expect(inCombat).toBe(true);

    // Enemy name should be displayed (wait for non-empty text)
    const enemyNameEl = page.locator(SELECTORS.enemyNameDisplay);
    await expect(enemyNameEl).toBeVisible({ timeout: 10000 });
    await expect(enemyNameEl).not.toBeEmpty({ timeout: 5000 });
  });

  test('should have enemy HP when in combat', async ({ page, gameHelper }) => {
    const inCombat = await setupCombat(gameHelper);
    expect(inCombat).toBe(true);

    // Wait for enemy HP bar to be visible
    await expect(page.locator(SELECTORS.enemyHpBar)).toBeVisible({ timeout: 10000 });

    // Enemy should have HP in combat
    const enemyMaxHp = await gameHelper.getEnemyMaxHp();
    expect(enemyMaxHp).toBeGreaterThan(0);

    const enemyHp = await gameHelper.getEnemyHp();
    expect(enemyHp).toBeGreaterThan(0);
    expect(enemyHp).toBeLessThanOrEqual(enemyMaxHp);
  });

});

test.describe('Combat Victory', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should have result modal structure', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    // Result modal exists but is hidden until combat victory
    const resultModal = page.locator(SELECTORS.resultModal);
    await expect(resultModal).toBeAttached();
  });

  test('should have continue button in result modal', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    // Continue button exists but is hidden until result modal is shown
    const continueBtn = page.locator(SELECTORS.resultContinueBtn);
    await expect(continueBtn).toBeAttached();
  });
});
