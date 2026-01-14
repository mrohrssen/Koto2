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

  test('should show enemy sprite element exists', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const enemySprite = page.locator(SELECTORS.enemySprite);
    await expect(enemySprite).toBeAttached();
  });

  test('should show enemy HP bar element exists', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const enemyHpBar = page.locator(SELECTORS.enemyHpBar);
    await expect(enemyHpBar).toBeAttached();
  });

  test('should have attack button element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const attackBtn = page.locator(ACTION_BTNS.attack);
    await expect(attackBtn).toBeAttached();
  });

  test('should have defend button element', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const defendBtn = page.locator(ACTION_BTNS.defend);
    await expect(defendBtn).toBeAttached();
  });

  test('should track player HP', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);

    const hp = await gameHelper.getPlayerHp();
    const maxHp = await gameHelper.getPlayerMaxHp();

    expect(maxHp).toBeGreaterThan(0);
    expect(hp).toBeLessThanOrEqual(maxHp);
  });

  test('should show VN stage during gameplay', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const vnStage = page.locator(SELECTORS.vnStage);
    await expect(vnStage).toBeVisible();
  });

  test('should show floor indicator during run', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.startRun();
    await gameHelper.selectWard('nerima');

    const floorIndicator = page.locator(SELECTORS.floorIndicator);
    await expect(floorIndicator).toBeVisible();
  });
});

test.describe('Combat Actions', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should have combat buttons when in combat', async ({ page, gameHelper }) => {
    const inCombat = await setupCombat(gameHelper);

    if (inCombat) {
      const attackBtn = page.locator(ACTION_BTNS.attack);
      const defendBtn = page.locator(ACTION_BTNS.defend);

      const attackVisible = await attackBtn.isVisible();
      const defendVisible = await defendBtn.isVisible();

      expect(attackVisible || defendVisible).toBeTruthy();
    }
  });

  test('should show enemy name when in combat', async ({ page, gameHelper }) => {
    const inCombat = await setupCombat(gameHelper);

    if (inCombat) {
      await page.waitForTimeout(500);
      const enemyName = await page.locator(SELECTORS.enemyNameDisplay).textContent();
      expect(enemyName).toBeTruthy();
    }
  });

  test('should have enemy HP when in combat', async ({ gameHelper }) => {
    const inCombat = await setupCombat(gameHelper);

    if (inCombat) {
      await gameHelper.page.waitForTimeout(500);
      const enemyMaxHp = await gameHelper.getEnemyMaxHp();
      expect(enemyMaxHp).toBeGreaterThan(0);
    }
  });
});

test.describe('Combat Victory', () => {
  test.afterEach(async ({ page }) => {
    await cleanupAfterTest(page);
  });

  test('should have result modal structure', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const resultModal = page.locator(SELECTORS.resultModal);
    await expect(resultModal).toBeAttached();
  });

  test('should have continue button in result modal', async ({ page, gameHelper }) => {
    await setupCharacter(gameHelper);

    const continueBtn = page.locator(SELECTORS.resultContinueBtn);
    await expect(continueBtn).toBeAttached();
  });
});
