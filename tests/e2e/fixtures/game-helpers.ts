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

  // ============ CHARACTER CREATION ============

  async createCharacter(name: string = 'TestHacker', stats?: Partial<Stats>): Promise<void> {
    const modal = this.page.locator(SELECTORS.createCharModal);

    // If modal not visible, click the first button in action panel
    if (!(await modal.isVisible())) {
      const actionPanel = this.page.locator(SELECTORS.actionPanel);
      const firstBtn = actionPanel.locator('button').first();
      if (await firstBtn.isVisible()) {
        await firstBtn.click();
      }
    }
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Set character name
    if (name) {
      await this.page.fill(SELECTORS.charName, name);
    }

    // Allocate stats if provided
    if (stats) {
      for (const [stat, targetValue] of Object.entries(stats)) {
        await this.allocateStat(stat as keyof Stats, targetValue);
      }
    }

    // Click create button
    await this.page.click(SELECTORS.createCharBtn);
    await expect(modal).toBeHidden({ timeout: 5000 });
  }

  async allocateStat(stat: keyof Stats, targetValue: number): Promise<void> {
    const currentValue = await this.getCreateStatValue(stat);
    const diff = targetValue - currentValue;

    if (diff > 0) {
      for (let i = 0; i < diff; i++) {
        await this.page.click(`${SELECTORS.statPlus}[data-stat="${stat}"]`);
      }
    } else if (diff < 0) {
      for (let i = 0; i < Math.abs(diff); i++) {
        await this.page.click(`${SELECTORS.statMinus}[data-stat="${stat}"]`);
      }
    }
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
    // Find the "Infiltrate Tokyo" or start run button
    const actionPanel = this.page.locator(SELECTORS.actionPanel);
    const startBtn = actionPanel.locator('button.primary').first();
    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await startBtn.click();
    await this.waitForPhase(['ward_selection'], 10000);
  }

  async selectWard(wardId: string): Promise<void> {
    // Try specific ward first
    const wardOption = this.page.locator(`[data-ward="${wardId}"]`);
    if (await wardOption.isVisible()) {
      await wardOption.click();
    } else {
      // Fall back to first ward option
      const wardOptions = this.page.locator('.ward-option');
      if (await wardOptions.first().isVisible()) {
        await wardOptions.first().click();
      } else {
        // Try any button in action panel
        const btn = this.page.locator(`${SELECTORS.actionPanel} button`).first();
        if (await btn.isVisible()) {
          await btn.click();
        }
      }
    }
    await this.waitForPhase(['exploring', 'room', 'room_encounter', 'combat'], 10000);
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
