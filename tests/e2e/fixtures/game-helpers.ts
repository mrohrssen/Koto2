import { Page, expect, Locator } from '@playwright/test';
import { SELECTORS } from '../utils/selectors';
import { GamePhase } from './mock-data';

export interface Stats {
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;
}

/**
 * Helper class for common game actions in e2e tests
 */
export class GameHelper {
  constructor(public page: Page) {}

  private log(action: string, details?: string) {
    const msg = details ? `[GameHelper] ${action}: ${details}` : `[GameHelper] ${action}`;
    console.log(msg);
  }

  // ============ CHARACTER CREATION ============

  async createCharacter(name: string = 'TestHacker', stats?: Partial<Stats>): Promise<void> {
    this.log('createCharacter', 'clicking Start Game button');

    // Just click the Start Game button - no modal anymore
    const actionPanel = this.page.locator(SELECTORS.actionPanel);
    const startBtn = actionPanel.locator('button').first();

    if (await startBtn.isVisible()) {
      await startBtn.click();
    }

    // Wait for hub phase
    await this.page.waitForFunction(() => {
      const state = (window as any).gameState;
      return state?.phase === 'hub';
    }, { timeout: 5000 });

    this.log('createCharacter', 'done');
  }

  async getCreateStatValue(stat: keyof Stats): Promise<number> {
    const text = await this.page.locator(`#create-${stat}`).textContent();
    return parseInt(text || '1', 10);
  }

  async getCreateStatPoints(): Promise<number> {
    const text = await this.page.locator(SELECTORS.createStatPoints).textContent();
    return parseInt(text || '0', 10);
  }

  // ============ RUN MANAGEMENT ============

  async startRun(): Promise<void> {
    this.log('startRun', 'starting...');
    const phase = await this.getPhase();
    this.log('startRun', `current phase: ${phase}`);

    // Find the "Infiltrate Tokyo" or start run button
    const actionPanel = this.page.locator(SELECTORS.actionPanel);

    // Try different selectors for start button
    let startBtn = actionPanel.locator('button.primary').first();
    if (!(await startBtn.isVisible({ timeout: 1000 }).catch(() => false))) {
      this.log('startRun', 'no .primary button, trying first button');
      startBtn = actionPanel.locator('button').first();
    }

    if (await startBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const btnText = await startBtn.textContent();
      this.log('startRun', `clicking button: "${btnText}"`);
      await startBtn.click();
      this.log('startRun', 'waiting for ward_selection phase...');
      await this.waitForPhase(['ward_selection'], 15000);
      this.log('startRun', 'done');
    } else {
      this.log('startRun', 'ERROR: no visible button found');
    }
  }

  async selectWard(wardId: string = 'nerima'): Promise<void> {
    this.log('selectWard', `wardId=${wardId}`);

    // Wait for ward cards to be visible
    const wardCard = this.page.locator('.ward-card').first();
    await wardCard.waitFor({ state: 'visible', timeout: 5000 });

    // Call the selectWard function directly via evaluate - more reliable than clicking
    await this.page.evaluate((id) => {
      (window as any).selectWard(id, false);
    }, wardId);

    // Wait for phase to change from ward_selection
    await this.page.waitForFunction(
      () => {
        const phase = (window as any).gameState?.phase;
        return phase && phase !== 'ward_selection';
      },
      { timeout: 10000 }
    );

    this.log('selectWard', 'phase changed successfully');
  }

  // ============ EXPLORATION ============

  async proceedToNextRoom(): Promise<void> {
    const actionPanel = this.page.locator(SELECTORS.actionPanel);
    const proceedBtn = actionPanel.locator('button').first();
    if (await proceedBtn.isVisible()) {
      await proceedBtn.click();
      await this.page.waitForTimeout(500);
    }
  }

  async proceedToEncounter(maxAttempts: number = 10): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const phase = await this.getPhase();
      if (phase === 'combat' || phase === 'room_encounter') {
        return;
      }

      const actionPanel = this.page.locator(SELECTORS.actionPanel);
      const btn = actionPanel.locator('button').first();
      if (await btn.isVisible()) {
        await btn.click();
        await this.page.waitForTimeout(500);
      } else {
        break;
      }
    }
  }

  // ============ COMBAT ============

  async attack(): Promise<void> {
    const attackBtn = this.page.locator('.attack-btn');
    if (await attackBtn.isVisible()) {
      await attackBtn.click();
      await this.page.waitForTimeout(300);
    }
  }

  async defend(): Promise<void> {
    const defendBtn = this.page.locator('.defend-btn');
    if (await defendBtn.isVisible()) {
      await defendBtn.click();
      await this.page.waitForTimeout(300);
    }
  }

  async useMagic(): Promise<void> {
    const magicBtn = this.page.locator('.magic-btn');
    if (await magicBtn.isVisible()) {
      await magicBtn.click();
      await this.page.waitForTimeout(300);
    }
  }

  async flee(): Promise<void> {
    const fleeBtn = this.page.locator('.flee-btn');
    if (await fleeBtn.isVisible()) {
      await fleeBtn.click();
      await this.page.waitForTimeout(500);
    }
  }

  async waitForCombatEnd(timeout: number = 30000): Promise<void> {
    await expect(
      this.page.locator(SELECTORS.resultModal)
        .or(this.page.locator(SELECTORS.gameoverModal))
    ).toBeVisible({ timeout });
  }

  // ============ WORD PRACTICE ============

  async selectWordCard(index: number): Promise<void> {
    const card = this.page.locator(`${SELECTORS.wordCards} ${SELECTORS.wordCard}`).nth(index);
    await card.click();
  }

  async typeWordAnswer(answer: string): Promise<void> {
    await this.page.fill(SELECTORS.wordDefinitionInput, answer);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(500);
  }

  async submitSelfGrade(grade: 1 | 2 | 3 | 4 | 5): Promise<void> {
    await this.page.click(`[data-grade="${grade}"]`);
    await this.page.waitForTimeout(300);
  }

  // ============ STATE HELPERS ============

  async getPhase(): Promise<GamePhase | string> {
    return await this.page.evaluate(() => {
      return (window as any).gameState?.phase || 'unknown';
    });
  }

  async getPlayerHp(): Promise<number> {
    return await this.page.evaluate(() => {
      const state = (window as any).gameState;
      return state?.run?.player?.hp || state?.player?.hp || 0;
    });
  }

  async getPlayerMaxHp(): Promise<number> {
    return await this.page.evaluate(() => {
      const state = (window as any).gameState;
      return state?.run?.player?.maxHp || state?.player?.maxHp || 0;
    });
  }

  async getEnemyHp(): Promise<number> {
    return await this.page.evaluate(() => {
      return (window as any).gameState?.combat?.enemy?.hp || 0;
    });
  }

  async getEnemyMaxHp(): Promise<number> {
    return await this.page.evaluate(() => {
      return (window as any).gameState?.combat?.enemy?.maxHp || 0;
    });
  }

  async getCurrentFloor(): Promise<number> {
    return await this.page.evaluate(() => {
      return (window as any).gameState?.run?.floor || 0;
    });
  }

  async getCurrentRoom(): Promise<number> {
    return await this.page.evaluate(() => {
      return (window as any).gameState?.run?.currentRoom || 0;
    });
  }

  async getPlayerGold(): Promise<number> {
    return await this.page.evaluate(() => {
      const state = (window as any).gameState;
      return state?.run?.player?.gold || state?.player?.gold || 0;
    });
  }

  async getPlayerEssence(): Promise<number> {
    return await this.page.evaluate(() => {
      return (window as any).gameState?.meta?.essence || 0;
    });
  }

  async waitForPhase(phases: (GamePhase | string)[], timeout: number = 15000): Promise<void> {
    await this.page.waitForFunction(
      (expected: string[]) => expected.includes((window as any).gameState?.phase),
      phases,
      { timeout }
    );
  }

  async advanceNarration(): Promise<void> {
    await this.page.keyboard.press('Space');
    await this.page.waitForTimeout(200);
  }

  // ============ MODAL HELPERS ============

  async isModalVisible(modalSelector: string): Promise<boolean> {
    return await this.page.locator(modalSelector).isVisible();
  }

  async closeResultModal(): Promise<void> {
    const continueBtn = this.page.locator(SELECTORS.resultContinueBtn);
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
      await expect(this.page.locator(SELECTORS.resultModal)).toBeHidden();
    }
  }

  async openSettings(): Promise<void> {
    await this.page.click(SELECTORS.settingsBtn);
    await expect(this.page.locator(SELECTORS.settingsModal)).toBeVisible();
  }

  async openUpgrades(): Promise<void> {
    // Find upgrades button in action panel (has "解放" text or secondary class)
    const actionPanel = this.page.locator(SELECTORS.actionPanel);
    const upgradesBtn = actionPanel.locator('button.secondary').first();
    if (await upgradesBtn.isVisible()) {
      await upgradesBtn.click();
      await expect(this.page.locator(SELECTORS.upgradesModal)).toBeVisible({ timeout: 5000 });
    }
  }

  // ============ ACTION VISIBILITY ============

  async isActionVisible(action: string): Promise<boolean> {
    const selectors: Record<string, string> = {
      attack: '.attack-btn',
      defend: '.defend-btn',
      magic: '.magic-btn',
      item: '.item-btn',
      flee: '.flee-btn',
      proceed: `${SELECTORS.actionPanel} button`,
    };
    const selector = selectors[action] || `${SELECTORS.actionPanel} button`;
    return await this.page.locator(selector).first().isVisible();
  }

  async resetGame(): Promise<void> {
    await this.page.request.post('/api/game/full-reset');
    await this.page.reload();
  }
}
