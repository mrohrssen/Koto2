import { Page } from '@playwright/test';
import { SELECTORS } from '../utils/selectors';

/**
 * Helper class for common game actions in e2e tests (mobile UI)
 */
export class GameHelper {
  constructor(public page: Page) {}

  private log(action: string, details?: string) {
    const msg = details ? `[GameHelper] ${action}: ${details}` : `[GameHelper] ${action}`;
    console.log(msg);
  }

  // ============ CHARACTER CREATION ============

  async createCharacter(): Promise<void> {
    this.log('createCharacter', 'clicking New Game button');
    await this.page.locator(SELECTORS.newGameBtn).waitFor({ state: 'visible', timeout: 5000 });
    await this.page.locator(SELECTORS.newGameBtn).click();
    await this.waitForPhase(['hub'], 5000);
    this.log('createCharacter', 'done - in hub');
  }

  // ============ RUN MANAGEMENT ============

  async startRun(): Promise<void> {
    this.log('startRun', 'clicking Infiltrate button');
    await this.page.locator(SELECTORS.contextActionBtn).waitFor({ state: 'visible', timeout: 5000 });
    await this.page.locator(SELECTORS.contextActionBtn).click();
    this.log('startRun', 'waiting for chip shop or ward_selection...');
  }

  async selectStartingChip(index = 0): Promise<void> {
    this.log('selectStartingChip', `index=${index}`);
    await this.page.waitForFunction(
      (sel: string) => document.querySelector(sel)?.classList.contains('active'),
      SELECTORS.chipShopView,
      { timeout: 5000 }
    );
    await this.page.locator(SELECTORS.shopChipOption).nth(index).waitFor({ state: 'visible', timeout: 3000 });
    await this.page.locator(SELECTORS.shopChipOption).nth(index).click();
    await this.page.waitForFunction(
      (sel: string) => !document.querySelector(sel)?.classList.contains('active'),
      SELECTORS.chipShopView,
      { timeout: 5000 }
    );
    this.log('selectStartingChip', 'done');
  }

  async selectWard(index = 0): Promise<void> {
    this.log('selectWard', `index=${index}`);
    await this.page.locator(SELECTORS.wardOption).nth(index).waitFor({ state: 'visible', timeout: 5000 });
    await this.page.locator(SELECTORS.wardOption).nth(index).click();
    await this.page.locator(SELECTORS.wardProceedBtn).waitFor({ state: 'visible', timeout: 3000 });
    await this.page.locator(SELECTORS.wardProceedBtn).click();
    await this.page.waitForFunction(
      () => (window as any).gameState?.phase !== 'ward_selection',
      { timeout: 10000 }
    );
    this.log('selectWard', 'phase changed');
  }

  /** Full run setup: hub → chip shop → ward → exploring */
  async setupRun(): Promise<void> {
    await this.startRun();
    await this.selectStartingChip(0);
    await this.waitForPhase(['ward_selection'], 5000);
    await this.selectWard(0);
    await this.waitForPhase(['exploring', 'room'], 8000);
  }

  // ============ EXPLORATION ============

  async proceedToNextRoom(): Promise<void> {
    await this.page.locator(SELECTORS.proceedBtn).waitFor({ state: 'visible', timeout: 5000 });
    await this.page.locator(SELECTORS.proceedBtn).click();
    await this.page.waitForTimeout(500);
  }

  async proceedToEncounter(maxAttempts = 20): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      const phase = await this.getPhase();
      if (phase === 'room_encounter' || phase === 'combat') return true;

      const fightBtn = this.page.locator(SELECTORS.fightBtn);
      if (await fightBtn.isVisible().catch(() => false)) return true;

      const proceedBtn = this.page.locator(SELECTORS.proceedBtn);
      if (await proceedBtn.isVisible().catch(() => false)) {
        await proceedBtn.click();
        await this.page.waitForTimeout(500);
      } else {
        await this.page.waitForTimeout(300);
      }
    }
    return false;
  }

  // ============ COMBAT (FLASH CARDS) ============

  async waitForFlashCard(timeout = 8000): Promise<void> {
    await this.page.locator(SELECTORS.flashCard).waitFor({ state: 'visible', timeout });
  }

  /** Flip the flash card (tap/click) */
  async flipCard(): Promise<void> {
    await this.page.locator(SELECTORS.flashCard).click();
    await this.page.waitForTimeout(200);
  }

  /** Swipe card via test-swipe custom event (fast, no gesture simulation) */
  async swipeCard(direction: 'left' | 'right'): Promise<void> {
    await this.page.evaluate((dir) => {
      document.dispatchEvent(new CustomEvent('test-swipe', { detail: dir }));
    }, direction);
    await this.page.waitForTimeout(300);
  }

  /** Swipe card via actual mouse gesture (for gesture verification test) */
  async swipeCardGesture(direction: 'left' | 'right'): Promise<void> {
    const card = this.page.locator(SELECTORS.flashCard);
    const box = await card.boundingBox();
    if (!box) throw new Error('Flash card not visible for gesture swipe');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const endX = direction === 'right' ? startX + 120 : startX - 120;
    // First flip the card
    await card.click();
    await this.page.waitForTimeout(200);
    // Then swipe
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, startY, { steps: 10 });
    await this.page.mouse.up();
    await this.page.waitForTimeout(400);
  }

  /** Complete one full combat round: wait for card, flip, swipe right */
  async completeCombatRound(): Promise<void> {
    await this.waitForFlashCard(8000);
    await this.flipCard();
    await this.swipeCard('right');
    await this.page.waitForTimeout(1000);
  }

  /** Win the current combat by looping swipe-right until enemy dies or combat ends */
  async winCombat(maxRounds = 30): Promise<void> {
    for (let i = 0; i < maxRounds; i++) {
      const phase = await this.getPhase();
      if (phase !== 'combat') return;
      const hp = await this.getEnemyHp();
      if (hp <= 0) return;
      try {
        await this.completeCombatRound();
      } catch { return; }
    }
  }

  // ============ STATE HELPERS ============

  async getPhase(): Promise<string> {
    return await this.page.evaluate(() => {
      return (window as any).gameState?.phase || 'unknown';
    });
  }

  async getPlayerHp(): Promise<number> {
    return await this.page.evaluate(() => {
      const state = (window as any).gameState;
      return state?.run?.player?.hp ?? state?.player?.hp ?? 0;
    });
  }

  async getPlayerMaxHp(): Promise<number> {
    return await this.page.evaluate(() => {
      const state = (window as any).gameState;
      return state?.run?.player?.maxHp ?? state?.player?.maxHp ?? 0;
    });
  }

  async getEnemyHp(): Promise<number> {
    return await this.page.evaluate(() => {
      return (window as any).gameState?.combat?.enemy?.hp ?? 0;
    });
  }

  async getEnemyMaxHp(): Promise<number> {
    return await this.page.evaluate(() => {
      return (window as any).gameState?.combat?.enemy?.maxHp ?? 0;
    });
  }

  async getCurrentFloor(): Promise<number> {
    return await this.page.evaluate(() => {
      return (window as any).gameState?.run?.floor ?? 0;
    });
  }

  async getCurrentRoom(): Promise<number> {
    return await this.page.evaluate(() => {
      return (window as any).gameState?.run?.currentRoom ?? 0;
    });
  }

  async getPlayerEssence(): Promise<number> {
    return await this.page.evaluate(() => {
      return (window as any).gameState?.meta?.essence ?? 0;
    });
  }

  async waitForPhase(phases: string[], timeout = 15000): Promise<void> {
    await this.page.waitForFunction(
      (expected: string[]) => expected.includes((window as any).gameState?.phase),
      phases,
      { timeout }
    );
  }

  // ============ TAKEOVER HELPERS ============

  async isTakeoverOpen(selector: string): Promise<boolean> {
    return this.page.evaluate(
      (sel: string) => document.querySelector(sel)?.classList.contains('active') ?? false,
      selector
    );
  }

  // ============ UTILITY ============

  async resetGame(): Promise<void> {
    await this.page.request.post('http://localhost:3000/api/game/full-reset');
    await this.page.waitForTimeout(100);
  }

  async enableDebugMode(): Promise<void> {
    await this.page.request.post('http://localhost:3000/api/game/debug-mode', {
      data: { enabled: true }
    });
  }

  /** Force combat via debug API, reload page, wait for combat phase */
  async setupCombat(): Promise<void> {
    await this.enableDebugMode();
    const response = await this.page.evaluate(async () => {
      const res = await fetch('/api/game/debug-force-combat', { method: 'POST' });
      return res.json();
    });
    if (!(response as any).success) {
      throw new Error(`debug-force-combat failed: ${(response as any).error}`);
    }
    await this.page.reload();
    await this.page.waitForLoadState('load');
    await this.waitForPhase(['combat'], 5000);
  }

  /** Force a specific phase via debug API, reload page */
  async forcePhase(phase: string): Promise<void> {
    await this.enableDebugMode();
    await this.page.evaluate(async (p: string) => {
      const res = await fetch('/api/game/debug-force-phase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: p })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    }, phase);
    await this.page.reload();
    await this.page.waitForLoadState('load');
    await this.waitForPhase([phase], 5000);
  }

  /** Add test chips via debug API */
  async addDebugChips(): Promise<void> {
    await this.enableDebugMode();
    await this.page.evaluate(async () => {
      await fetch('/api/game/debug-chips', { method: 'POST' });
    });
  }

  /** Set player HP to a specific value via heal API */
  async setPlayerHp(targetHp: number): Promise<void> {
    const currentHp = await this.getPlayerHp();
    const healAmount = targetHp - currentHp;
    await this.page.evaluate(async (amount: number) => {
      await fetch('/api/game/heal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
    }, healAmount);
  }

  /** Forfeit run and return to hub */
  async forfeitRun(): Promise<void> {
    await this.page.evaluate(async () => {
      await fetch('/api/game/forfeit-run', { method: 'POST' });
    });
    await this.page.reload();
    await this.page.waitForLoadState('load');
    await this.waitForPhase(['hub'], 5000);
  }
}
