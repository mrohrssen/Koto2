# Mobile UI E2E Testing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite all Playwright E2E tests to work with the mobile-first UI DOM structure, fixing runtime bugs along the way.

**Architecture:** Tests target the mobile UI in `/Users/michia/Documents/jrpg-wt-mobile-ui` (branch `feature/mobile-first-ui`). The mobile UI uses takeover views (`.active` class), an action-area with dynamic buttons, and swipeable flash cards instead of the old desktop modals. Tests run sequentially with Playwright (Chromium, single worker). We adapt the existing test framework (helpers, fixtures, config) rather than rewriting from scratch.

**Tech Stack:** Playwright, TypeScript, Express.js backend with debug APIs

**Worktree:** `/Users/michia/Documents/jrpg-wt-mobile-ui` (branch: `feature/mobile-first-ui`)

---

## Critical Context

**E2E test command (from worktree):**
```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test --workers=1 -x; pkill -f "node server.js"
```

**Run single spec:**
```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test specs/character-creation --workers=1 -x; pkill -f "node server.js"
```

**Syntax check before running tests:**
```bash
node --check /Users/michia/Documents/jrpg-wt-mobile-ui/public/js/ui/actions.js && echo "OK"
```

**Key DOM differences from old tests:**
- No modals — uses takeover views with `.active` class (not `.hidden`/`display:none`)
- No stat allocation modal — `createCharacter()` auto-assigns stats
- No attack/defend/magic/flee buttons — combat uses flash card swipe
- Action buttons rendered dynamically into `#action-area` with specific IDs
- Takeover open check: `el.classList.contains('active')` (not visibility)

**Phase derivation (server-side, in `src/game/phase-machine.js`):**
- `no_save` → no player
- `hub` → player exists, no run
- `run_ended` → `run.active === false`
- `ward_selection` → `run.wardSelectionRequired === true`
- `combat` → `combat?.active === true`
- `post_combat_shop` → `run.postCombatShop?.active === true`
- `floor_complete` → `run.bossDefeated === true`
- `boss_ready` → `currentRoom.isBossRoom` OR `encountersCompleted >= encountersNeeded`
- `room_encounter` → room type=encounter, not interacted
- `exploring` → default with active run

**Debug APIs available:**
- `POST /api/game/debug-mode` → `{ enabled: true }`
- `POST /api/game/debug-force-combat` → Forces combat state with real enemy
- `POST /api/game/full-reset` → Clears all save data
- `POST /api/game/heal` → `{ amount: number }` (negative reduces HP, no floor clamp)
- `POST /api/game/debug-chips` → Adds test chips to inventory
- `POST /api/game/debug-force-phase` → **(NEW, Task 2)** Forces server state to produce target phase

---

## Task 1: Rewrite selectors.ts

**Files:**
- Rewrite: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/utils/selectors.ts`

**Step 1: Replace selectors.ts with mobile DOM targets**

```typescript
/**
 * Mobile UI DOM selectors for E2E tests
 * Targets the mobile-first UI structure (takeover views, action-area, flash cards)
 */
export const SELECTORS = {
  // Status bar
  floorIndicator: '#floor-indicator',
  essenceDisplay: '#essence-display',

  // Scene area
  sceneArea: '#scene-area',
  enemySprite: '#enemy-sprite',
  enemySpriteContainer: '#enemy-sprite-container',
  enemyName: '#enemy-name',
  enemyHpFill: '#enemy-hp-fill',
  sceneToast: '#scene-toast',

  // Chip row
  chipRow: '#chip-row',
  chipSlot: '.chip-slot',
  chipPopup: '#chip-popup',
  chipPopupName: '#chip-popup-name',
  chipPopupDesc: '#chip-popup-desc',
  chipPopupCharge: '#chip-popup-charge',
  chipPopupUse: '#chip-popup-use',

  // Player HP
  playerHpContainer: '#player-hp-container',
  playerHpFill: '#player-hp-fill',
  playerHpText: '#player-hp-text',

  // Action area
  actionArea: '#action-area',
  actionBtn: '.action-btn',
  actionBtnPrimary: '.action-btn-primary',

  // Flash card
  flashCardContainer: '#flash-card-container',
  flashCard: '#flash-card',
  flashCardFront: '.flash-card-front',
  flashCardBack: '.flash-card-back',
  flashCardReading: '.flash-card-reading',
  flashCardMeaning: '.flash-card-meaning',

  // Dynamic action buttons (rendered into action-area by phase)
  newGameBtn: '#new-game-btn',
  proceedBtn: '#proceed-btn',
  fightBtn: '#fight-btn',
  bossFightBtn: '#boss-fight-btn',
  nextFloorBtn: '#next-floor-btn',
  returnHubBtn: '#return-hub-btn',
  equipBotsBtn: '#equip-bots-btn',
  contextActionBtn: '#context-action-btn',
  wardProceedBtn: '#ward-proceed-btn',
  wardOption: '.ward-option',

  // Takeover views (opened via .active class)
  chipEquipView: '#chip-equip-view',
  chipEquipContent: '#chip-equip-content',
  chipEquipClose: '#chip-equip-close',
  chipShopView: '#chip-shop-view',
  chipShopContent: '#chip-shop-content',
  chipShopClose: '#chip-shop-close',
  settingsView: '#settings-view',
  settingsContent: '#settings-content',
  settingsClose: '#settings-close',
  gameoverView: '#gameover-view',
  gameoverContent: '#gameover-content',
  takeoverClose: '.takeover-close',

  // Shop elements (rendered into chip-shop takeover)
  shopChipOption: '.shop-chip-option',
  shopSkipBtn: '#shop-skip-btn',

  // Chip equip elements (rendered into chip-equip takeover)
  chipEquipSlot: '.chip-equip-slot',
  chipEquipSlotFilled: '.chip-equip-slot.filled',
  chipEquipSlotEmpty: '.chip-equip-slot.empty',
  chipInventoryItem: '.chip-inventory-item',

  // Settings elements (rendered into settings takeover)
  settingsJpdbKey: '#settings-jpdb-key',
  settingsTtsEnabled: '#settings-tts-enabled',
  settingsSaveBtn: '#settings-save-btn',

  // Utility row
  settingsBtn: '#settings-btn',
  resetRunBtn: '#reset-run-btn',

  // Game over
  gameoverHubBtn: '#gameover-hub-btn',
};
```

**Step 2: Commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
/usr/bin/git add tests/e2e/utils/selectors.ts
/usr/bin/git commit -m "test: rewrite selectors.ts for mobile UI DOM"
```

---

## Task 2: Add debug-force-phase endpoint + test-swipe hook

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-mobile-ui/src/routes/game/misc.js` (add debug-force-phase)
- Modify: `/Users/michia/Documents/jrpg-wt-mobile-ui/public/js/ui/actions.js` (add test-swipe listener)

**Step 1: Add debug-force-phase endpoint**

In `/Users/michia/Documents/jrpg-wt-mobile-ui/src/routes/game/misc.js`, after the `debug-chips` route (around line 173), add:

```javascript
  // Debug: Force a specific game phase by manipulating server state
  // This sets the minimal server state needed for derivePhase() to return the target phase
  router.post('/debug-force-phase', (req, res) => {
    if (!getDebugMode()) {
      return res.status(403).json({ error: 'Debug mode not enabled' });
    }
    const { phase } = req.body;
    try {
      // Ensure player exists
      if (!gameManager.player) {
        gameManager.createPlayer('TestPlayer');
      }
      switch (phase) {
        case 'boss_ready': {
          // Need active run with encountersCompleted >= encountersNeeded
          if (!gameManager.run || !gameManager.run.active) {
            gameManager.startRun();
            if (gameManager.run.wardSelectionRequired) {
              gameManager.selectStartingWard('nerima');
            }
          }
          gameManager.run.wardSelectionRequired = false;
          gameManager.run.encountersCompleted = gameManager.run.encountersNeeded;
          gameManager.combat = null;
          gameManager.run.postCombatShop = null;
          gameManager.run.bossDefeated = false;
          break;
        }
        case 'floor_complete': {
          if (!gameManager.run || !gameManager.run.active) {
            gameManager.startRun();
            if (gameManager.run.wardSelectionRequired) {
              gameManager.selectStartingWard('nerima');
            }
          }
          gameManager.run.wardSelectionRequired = false;
          gameManager.run.bossDefeated = true;
          gameManager.combat = null;
          gameManager.run.postCombatShop = null;
          break;
        }
        case 'post_combat_shop': {
          if (!gameManager.run || !gameManager.run.active) {
            gameManager.startRun();
            if (gameManager.run.wardSelectionRequired) {
              gameManager.selectStartingWard('nerima');
            }
          }
          gameManager.run.wardSelectionRequired = false;
          gameManager.combat = null;
          gameManager.run.bossDefeated = false;
          const ownedIds = (gameManager.run.player.chips || []).map(c => c.id);
          const { generatePostCombatShop } = await import('../../game/items/chips.js');
          gameManager.run.postCombatShop = {
            active: true,
            items: generatePostCombatShop(gameManager.run.floor, ownedIds)
          };
          break;
        }
        default:
          return res.status(400).json({ error: `Unsupported phase: ${phase}` });
      }
      saveGameData();
      res.json({ success: true, state: getEnrichedGameState() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
```

**Note:** The `post_combat_shop` case uses a dynamic import. If the route file is CommonJS, use `require()` instead. If it's ESM (which it is based on the project), the dynamic import works. Alternatively, import `generatePostCombatShop` at the top of the file.

**Step 2: Add test-swipe event listener in actions.js**

In `/Users/michia/Documents/jrpg-wt-mobile-ui/public/js/ui/actions.js`, add at the end of the `init()` function body (line 29, before the closing `}`):

```javascript
  // Test hook: allows E2E tests to trigger swipe without mouse/touch gestures
  document.addEventListener('test-swipe', (e) => {
    if (cardSwipe) cardSwipe(e.detail);
  });
```

**Step 3: Syntax check**

```bash
node --check /Users/michia/Documents/jrpg-wt-mobile-ui/public/js/ui/actions.js && echo "OK"
node --check /Users/michia/Documents/jrpg-wt-mobile-ui/src/routes/game/misc.js && echo "OK"
```

**Step 4: Commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
/usr/bin/git add src/routes/game/misc.js public/js/ui/actions.js
/usr/bin/git commit -m "feat: add debug-force-phase endpoint and test-swipe hook for E2E"
```

---

## Task 3: Adapt game-helpers.ts for mobile UI

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/fixtures/game-helpers.ts`

**Approach:** Keep the class structure, `log()` method, and all `page.evaluate()` state-query methods unchanged. Remove desktop-specific methods (attack/defend/magic/flee, word modals, stat creation). Add mobile-specific methods (chip shop, flash card, takeover checks). Adapt interaction methods to new selectors.

**Step 1: Adapt game-helpers.ts**

```typescript
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
    // Start-run opens chip shop takeover, then ward selection after chip chosen
  }

  async selectStartingChip(index = 0): Promise<void> {
    this.log('selectStartingChip', `index=${index}`);
    // Wait for chip shop takeover to have .active class
    await this.page.waitForFunction(
      (sel: string) => document.querySelector(sel)?.classList.contains('active'),
      SELECTORS.chipShopView,
      { timeout: 5000 }
    );
    await this.page.locator(SELECTORS.shopChipOption).nth(index).waitFor({ state: 'visible', timeout: 3000 });
    await this.page.locator(SELECTORS.shopChipOption).nth(index).click();
    // Wait for takeover to close
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
    // Wait for phase to leave ward_selection
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

  // ============ STATE HELPERS (preserved from existing) ============

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
```

**Step 2: Commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
/usr/bin/git add tests/e2e/fixtures/game-helpers.ts
/usr/bin/git commit -m "test: adapt game-helpers.ts for mobile UI interactions"
```

---

## Task 4: Update test-fixtures.ts

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/fixtures/test-fixtures.ts`

**Step 1: Simplify test-fixtures.ts**

```typescript
import { test as base, expect } from '@playwright/test';
import { GameHelper } from './game-helpers';

/**
 * Custom test fixtures for JRPG e2e tests (mobile UI)
 */
export const test = base.extend<{
  gameHelper: GameHelper;
}>({
  gameHelper: async ({ page }, use) => {
    const helper = new GameHelper(page);
    await use(helper);
  },
});

export { expect };

/**
 * Reset game state before a test
 */
export async function resetGameState(page: any): Promise<void> {
  try {
    await page.request.post('http://localhost:3000/api/game/full-reset');
  } catch (e) {
    // Best effort
  }
  await page.waitForTimeout(100);
}

/**
 * Setup: reset + navigate + create character → hub phase
 */
export async function setupCharacter(gameHelper: GameHelper): Promise<void> {
  await resetGameState(gameHelper.page);
  await gameHelper.page.goto('http://localhost:3000');
  await gameHelper.page.waitForLoadState('load');
  await gameHelper.createCharacter();
}

/**
 * Setup: character + debug force combat → combat phase
 */
export async function setupCombat(gameHelper: GameHelper): Promise<void> {
  await setupCharacter(gameHelper);
  await gameHelper.setupCombat();
}
```

**Step 2: Remove mock-data.ts GamePhase import dependency**

The old `game-helpers.ts` imported `GamePhase` from `mock-data.ts`. Since we now use plain `string` for phases, verify `mock-data.ts` still exports what's needed (it does — `GAME_PHASES` array is still useful for reference, but no longer imported by helpers).

**Step 3: Commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
/usr/bin/git add tests/e2e/fixtures/test-fixtures.ts
/usr/bin/git commit -m "test: simplify test-fixtures.ts for mobile UI"
```

---

## Task 5: Rewrite character-creation.spec.ts

**Files:**
- Rewrite: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/specs/character-creation.spec.ts`

**Step 1: Write spec**

```typescript
import { test, expect, resetGameState } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Character Creation', () => {
  test.beforeEach(async ({ page }) => {
    await resetGameState(page);
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('load');
  });

  test('fresh load shows New Game button', async ({ page }) => {
    await page.locator(SELECTORS.newGameBtn).waitFor({ state: 'visible', timeout: 5000 });
    await expect(page.locator(SELECTORS.newGameBtn)).toBeVisible();
  });

  test('create character transitions to hub', async ({ gameHelper, page }) => {
    await gameHelper.createCharacter();
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('hub');
    await expect(page.locator(SELECTORS.contextActionBtn)).toBeVisible();
    await expect(page.locator(SELECTORS.contextActionBtn)).toHaveText('Infiltrate');
  });

  test('hub shows correct initial state', async ({ gameHelper, page }) => {
    await gameHelper.createCharacter();
    await expect(page.locator(SELECTORS.floorIndicator)).toHaveText('Hub');
    await expect(page.locator(SELECTORS.essenceDisplay)).toHaveText('0');
  });
});
```

**Step 2: Run the test**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test specs/character-creation --workers=1 -x; pkill -f "node server.js"
```

**Step 3: Fix any runtime bugs, then commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
/usr/bin/git add tests/e2e/specs/character-creation.spec.ts
/usr/bin/git add -u
/usr/bin/git commit -m "test: rewrite character-creation.spec.ts for mobile UI"
```

---

## Task 6: Rewrite run-and-exploration.spec.ts

**Files:**
- Rewrite: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/specs/run-and-exploration.spec.ts`

**Step 1: Write spec**

```typescript
import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Run and Exploration', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test('Infiltrate opens starting chip shop', async ({ gameHelper, page }) => {
    await gameHelper.startRun();
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.chipShopView);
    expect(isOpen).toBe(true);
    const chipCount = await page.locator(SELECTORS.shopChipOption).count();
    expect(chipCount).toBe(3);
  });

  test('select starting chip transitions to ward selection', async ({ gameHelper, page }) => {
    await gameHelper.startRun();
    await gameHelper.selectStartingChip(0);
    await gameHelper.waitForPhase(['ward_selection'], 5000);
    const wardCount = await page.locator(SELECTORS.wardOption).count();
    expect(wardCount).toBeGreaterThanOrEqual(1);
  });

  test('select ward transitions to exploring', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();
    await expect(page.locator(SELECTORS.proceedBtn)).toBeVisible({ timeout: 3000 });
    const floorText = await page.locator(SELECTORS.floorIndicator).textContent();
    expect(floorText).toMatch(/F\d+/);
  });

  test('proceed advances room counter', async ({ gameHelper }) => {
    await gameHelper.setupRun();
    const roomBefore = await gameHelper.getCurrentRoom();
    await gameHelper.proceedToNextRoom();
    const roomAfter = await gameHelper.getCurrentRoom();
    expect(roomAfter).toBeGreaterThan(roomBefore);
  });

  test('room encounter shows Fight button', async ({ gameHelper, page }) => {
    await gameHelper.setupRun();
    const found = await gameHelper.proceedToEncounter(20);
    expect(found).toBe(true);
    await expect(page.locator(SELECTORS.fightBtn)).toBeVisible({ timeout: 3000 });
  });

  test('floor complete shows Continue button', async ({ gameHelper, page }) => {
    await gameHelper.forcePhase('floor_complete');
    await expect(page.locator(SELECTORS.nextFloorBtn)).toBeVisible({ timeout: 3000 });
  });
});
```

**Step 2: Run, fix, commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test specs/run-and-exploration --workers=1 -x; pkill -f "node server.js"
```

```bash
/usr/bin/git add tests/e2e/specs/run-and-exploration.spec.ts && /usr/bin/git add -u
/usr/bin/git commit -m "test: rewrite run-and-exploration.spec.ts for mobile UI"
```

---

## Task 7: Rewrite combat.spec.ts

**Files:**
- Rewrite: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/specs/combat.spec.ts`

**Step 1: Write spec**

```typescript
import { test, expect, setupCombat, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Combat', () => {
  test('combat shows enemy and HP bars', async ({ gameHelper, page }) => {
    await setupCombat(gameHelper);
    await expect(page.locator(SELECTORS.enemySpriteContainer)).toBeVisible();
    const name = await page.locator(SELECTORS.enemyName).textContent();
    expect(name?.trim().length).toBeGreaterThan(0);
    await expect(page.locator(SELECTORS.playerHpContainer)).toBeVisible();
  });

  test('flash card appears during combat', async ({ gameHelper, page }) => {
    await setupCombat(gameHelper);
    await gameHelper.waitForFlashCard(10000);
    const frontText = await page.locator(SELECTORS.flashCardFront).textContent();
    expect(frontText?.trim().length).toBeGreaterThan(0);
  });

  test('swipe right deals damage to enemy', async ({ gameHelper }) => {
    await setupCombat(gameHelper);
    await gameHelper.waitForFlashCard(10000);
    const hpBefore = await gameHelper.getEnemyHp();
    await gameHelper.flipCard();
    await gameHelper.swipeCard('right');
    await gameHelper.page.waitForTimeout(2000);
    const hpAfter = await gameHelper.getEnemyHp();
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  test('swipe left continues combat without crashing', async ({ gameHelper }) => {
    await setupCombat(gameHelper);
    await gameHelper.waitForFlashCard(10000);
    await gameHelper.flipCard();
    await gameHelper.swipeCard('left');
    await gameHelper.page.waitForTimeout(2000);
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('combat');
  });

  test('defeating enemy ends combat phase', async ({ gameHelper }) => {
    await setupCombat(gameHelper);
    await gameHelper.winCombat();
    await gameHelper.page.waitForTimeout(2000);
    const phase = await gameHelper.getPhase();
    expect(phase).not.toBe('combat');
  });

  test('Fight button disappears when combat starts', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await gameHelper.setupRun();
    const found = await gameHelper.proceedToEncounter(20);
    expect(found).toBe(true);
    await expect(page.locator(SELECTORS.fightBtn)).toBeVisible({ timeout: 3000 });
    await page.locator(SELECTORS.fightBtn).click();
    await gameHelper.waitForPhase(['combat'], 5000);
    await page.waitForTimeout(500);
    await expect(page.locator(SELECTORS.fightBtn)).not.toBeVisible();
  });
});
```

**Step 2: Run, fix, commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test specs/combat --workers=1 -x; pkill -f "node server.js"
```

```bash
/usr/bin/git add tests/e2e/specs/combat.spec.ts && /usr/bin/git add -u
/usr/bin/git commit -m "test: rewrite combat.spec.ts for mobile UI"
```

---

## Task 8: Rewrite word-practice.spec.ts

**Files:**
- Rewrite: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/specs/word-practice.spec.ts`

**Step 1: Write spec**

```typescript
import { test, expect, setupCombat } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Word Practice', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCombat(gameHelper);
  });

  test('flash card front shows Japanese word', async ({ gameHelper, page }) => {
    await gameHelper.waitForFlashCard(10000);
    const frontText = await page.locator(SELECTORS.flashCardFront).textContent();
    expect(frontText?.trim().length).toBeGreaterThan(0);
  });

  test('card flip reveals reading and meaning', async ({ gameHelper, page }) => {
    await gameHelper.waitForFlashCard(10000);
    await gameHelper.flipCard();
    const isFlipped = await page.locator(SELECTORS.flashCard).evaluate(
      el => el.classList.contains('flipped')
    );
    expect(isFlipped).toBe(true);
    const reading = await page.locator(SELECTORS.flashCardReading).textContent();
    expect(reading?.trim().length).toBeGreaterThan(0);
    const meaning = await page.locator(SELECTORS.flashCardMeaning).textContent();
    expect(meaning?.trim().length).toBeGreaterThan(0);
  });

  test('mouse gesture swipe triggers combat resume', async ({ gameHelper }) => {
    await gameHelper.waitForFlashCard(10000);
    const hpBefore = await gameHelper.getEnemyHp();
    await gameHelper.swipeCardGesture('right');
    await gameHelper.page.waitForTimeout(2000);
    const hpAfter = await gameHelper.getEnemyHp();
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  test('new card appears after swipe', async ({ gameHelper, page }) => {
    await gameHelper.waitForFlashCard(10000);
    await gameHelper.flipCard();
    await gameHelper.swipeCard('right');
    await gameHelper.page.waitForTimeout(2000);
    // Either next card appears (still in combat) or combat ended
    const phase = await gameHelper.getPhase();
    if (phase === 'combat') {
      await gameHelper.waitForFlashCard(8000);
      const frontText = await page.locator(SELECTORS.flashCardFront).textContent();
      expect(frontText?.trim().length).toBeGreaterThan(0);
    }
    // If combat ended (enemy died in one hit), that's valid — card cycle happened
  });
});
```

**Step 2: Run, fix, commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test specs/word-practice --workers=1 -x; pkill -f "node server.js"
```

```bash
/usr/bin/git add tests/e2e/specs/word-practice.spec.ts && /usr/bin/git add -u
/usr/bin/git commit -m "test: rewrite word-practice.spec.ts for mobile UI"
```

---

## Task 9: Rewrite shop.spec.ts

**Files:**
- Rewrite: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/specs/shop.spec.ts`

**Step 1: Write spec**

```typescript
import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Shop', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test('starting chip shop shows 3 options', async ({ gameHelper, page }) => {
    await gameHelper.startRun();
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.chipShopView);
    expect(isOpen).toBe(true);
    const chipCount = await page.locator(SELECTORS.shopChipOption).count();
    expect(chipCount).toBe(3);
  });

  test('selecting a chip closes shop and equips it', async ({ gameHelper, page }) => {
    await gameHelper.startRun();
    await gameHelper.selectStartingChip(0);
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.chipShopView);
    expect(isOpen).toBe(false);
    // Chip row should show the newly equipped chip
    await page.waitForTimeout(500);
    const filledChips = page.locator(`${SELECTORS.chipSlot} .chip-icon:not(.empty)`);
    const count = await filledChips.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('post-combat shop opens after victory', async ({ gameHelper, page }) => {
    // Use debug API to force post_combat_shop phase deterministically
    await gameHelper.forcePhase('post_combat_shop');
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.chipShopView);
    expect(isOpen).toBe(true);
    const chipCount = await page.locator(SELECTORS.shopChipOption).count();
    expect(chipCount).toBeGreaterThanOrEqual(1);
  });

  test('skip button closes post-combat shop', async ({ gameHelper, page }) => {
    await gameHelper.forcePhase('post_combat_shop');
    await expect(page.locator(SELECTORS.shopSkipBtn)).toBeVisible({ timeout: 3000 });
    await page.locator(SELECTORS.shopSkipBtn).click();
    await page.waitForTimeout(1000);
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.chipShopView);
    expect(isOpen).toBe(false);
  });
});
```

**Step 2: Run, fix, commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test specs/shop --workers=1 -x; pkill -f "node server.js"
```

```bash
/usr/bin/git add tests/e2e/specs/shop.spec.ts && /usr/bin/git add -u
/usr/bin/git commit -m "test: rewrite shop.spec.ts for mobile UI"
```

---

## Task 10: Rewrite equipment.spec.ts

**Files:**
- Rewrite: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/specs/equipment.spec.ts`

**Step 1: Write spec**

```typescript
import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Equipment', () => {
  test.beforeEach(async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await gameHelper.addDebugChips();
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
```

**Step 2: Run, fix, commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test specs/equipment --workers=1 -x; pkill -f "node server.js"
```

```bash
/usr/bin/git add tests/e2e/specs/equipment.spec.ts && /usr/bin/git add -u
/usr/bin/git commit -m "test: rewrite equipment.spec.ts for mobile UI"
```

---

## Task 11: Rewrite game-over.spec.ts

**Files:**
- Rewrite: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/specs/game-over.spec.ts`

**Step 1: Write spec**

The game-over is triggered by the combat-loop UI when player HP reaches 0 during combat. To test deterministically: enter combat, reduce player HP to 1, then let the enemy attack.

```typescript
import { test, expect, setupCombat, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Game Over', () => {
  test('player death opens gameover takeover', async ({ gameHelper, page }) => {
    await setupCombat(gameHelper);
    // Set player HP to 1 so next enemy hit kills them
    await gameHelper.setPlayerHp(1);
    // Swipe left (low grade = less player damage) to let enemy attack
    await gameHelper.waitForFlashCard(10000);
    await gameHelper.flipCard();
    await gameHelper.swipeCard('left');
    // Wait for combat to process — enemy should kill player
    await page.waitForTimeout(3000);
    // Gameover takeover should open
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.gameoverView);
    expect(isOpen).toBe(true);
  });

  test('Return to Hub button from gameover works', async ({ gameHelper, page }) => {
    await setupCombat(gameHelper);
    await gameHelper.setPlayerHp(1);
    await gameHelper.waitForFlashCard(10000);
    await gameHelper.flipCard();
    await gameHelper.swipeCard('left');
    await page.waitForTimeout(3000);
    // Click Return to Hub
    await page.locator(SELECTORS.gameoverHubBtn).waitFor({ state: 'visible', timeout: 5000 });
    await page.locator(SELECTORS.gameoverHubBtn).click();
    await page.waitForTimeout(1000);
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('hub');
  });

  test('reset run button forfeits and returns to hub', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await gameHelper.setupRun();
    // Set up dialog handler before clicking (window.confirm)
    page.on('dialog', dialog => dialog.accept());
    await page.locator(SELECTORS.resetRunBtn).click();
    await page.waitForTimeout(2000);
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('hub');
  });
});
```

**Step 2: Run, fix, commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test specs/game-over --workers=1 -x; pkill -f "node server.js"
```

**Likely bugs:**
- The heal API sets `player.hp` on the server, but combat-loop reads from `gameState.combat.enemy` and the run player. Verify the heal API modifies `gameManager.run.player.hp` (it does — `const player = gameManager.run?.player || gameManager.player`).
- If the player kills the enemy before the enemy attacks (player has higher AGI), the test fails. If this happens, use `debug-force-combat` with a specific strong enemy, or just increase the swipe count / accept the flakiness note.

```bash
/usr/bin/git add tests/e2e/specs/game-over.spec.ts && /usr/bin/git add -u
/usr/bin/git commit -m "test: rewrite game-over.spec.ts for mobile UI"
```

---

## Task 12: Rewrite settings.spec.ts

**Files:**
- Rewrite: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/specs/settings.spec.ts`

**Step 1: Write spec**

```typescript
import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Settings', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test('settings button opens takeover with inputs', async ({ gameHelper, page }) => {
    await page.locator(SELECTORS.settingsBtn).click();
    await page.waitForTimeout(500);
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.settingsView);
    expect(isOpen).toBe(true);
    await expect(page.locator(SELECTORS.settingsJpdbKey)).toBeVisible();
    await expect(page.locator(SELECTORS.settingsTtsEnabled)).toBeVisible();
    await expect(page.locator(SELECTORS.settingsSaveBtn)).toBeVisible();
  });

  test('save settings shows toast and closes takeover', async ({ gameHelper, page }) => {
    await page.locator(SELECTORS.settingsBtn).click();
    await page.waitForTimeout(500);
    await page.locator(SELECTORS.settingsJpdbKey).fill('test-key-123');
    await page.locator(SELECTORS.settingsSaveBtn).click();
    await page.waitForTimeout(500);
    // Toast should show
    const toastText = await page.locator(SELECTORS.sceneToast).textContent();
    expect(toastText).toContain('Settings saved');
    // Takeover closes after toast
    await page.waitForTimeout(2500);
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.settingsView);
    expect(isOpen).toBe(false);
  });

  test('close button dismisses without saving', async ({ gameHelper, page }) => {
    await page.locator(SELECTORS.settingsBtn).click();
    await page.waitForTimeout(500);
    await page.locator(SELECTORS.settingsJpdbKey).fill('should-not-persist');
    await page.locator(SELECTORS.settingsClose).click();
    await page.waitForTimeout(500);
    const isOpen = await gameHelper.isTakeoverOpen(SELECTORS.settingsView);
    expect(isOpen).toBe(false);
    // Re-open and verify value was not saved
    await page.locator(SELECTORS.settingsBtn).click();
    await page.waitForTimeout(500);
    const value = await page.locator(SELECTORS.settingsJpdbKey).inputValue();
    expect(value).not.toBe('should-not-persist');
  });
});
```

**Step 2: Run, fix, commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test specs/settings --workers=1 -x; pkill -f "node server.js"
```

```bash
/usr/bin/git add tests/e2e/specs/settings.spec.ts && /usr/bin/git add -u
/usr/bin/git commit -m "test: rewrite settings.spec.ts for mobile UI"
```

---

## Task 13: Rewrite boss-fights.spec.ts

**Files:**
- Rewrite: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/specs/boss-fights.spec.ts`

**Step 1: Write spec**

```typescript
import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Boss Fights', () => {
  test('boss ready phase shows Fight Boss button', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await gameHelper.forcePhase('boss_ready');
    await expect(page.locator(SELECTORS.bossFightBtn)).toBeVisible({ timeout: 3000 });
  });

  test('boss combat shows flash cards and deals damage', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    // Use debug-force-combat (creates a real enemy — sufficient for combat flow test)
    await gameHelper.setupCombat();
    await gameHelper.waitForFlashCard(10000);
    const hpBefore = await gameHelper.getEnemyHp();
    await gameHelper.flipCard();
    await gameHelper.swipeCard('right');
    await gameHelper.page.waitForTimeout(2000);
    const hpAfter = await gameHelper.getEnemyHp();
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  test('defeating enemy exits combat phase', async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.setupCombat();
    await gameHelper.winCombat();
    await gameHelper.page.waitForTimeout(2000);
    const phase = await gameHelper.getPhase();
    expect(phase).not.toBe('combat');
  });
});
```

**Step 2: Run, fix, commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test specs/boss-fights --workers=1 -x; pkill -f "node server.js"
```

```bash
/usr/bin/git add tests/e2e/specs/boss-fights.spec.ts && /usr/bin/git add -u
/usr/bin/git commit -m "test: rewrite boss-fights.spec.ts for mobile UI"
```

---

## Task 14: Rewrite progression.spec.ts and meta-progression.spec.ts

**Files:**
- Rewrite: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/specs/progression.spec.ts`
- Rewrite: `/Users/michia/Documents/jrpg-wt-mobile-ui/tests/e2e/specs/meta-progression.spec.ts`

**Step 1: Write progression.spec.ts**

```typescript
import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Progression', () => {
  test('floor indicator shows Hub before run', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await expect(page.locator(SELECTORS.floorIndicator)).toHaveText('Hub');
  });

  test('floor indicator shows F1 during run', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await gameHelper.setupRun();
    const floorText = await page.locator(SELECTORS.floorIndicator).textContent();
    expect(floorText).toBe('F1');
  });
});
```

**Step 2: Write meta-progression.spec.ts**

```typescript
import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Meta Progression', () => {
  test('essence starts at 0 for new character', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await expect(page.locator(SELECTORS.essenceDisplay)).toHaveText('0');
  });

  test('essence accumulates after completing an encounter', async ({ gameHelper, page }) => {
    await setupCharacter(gameHelper);
    await gameHelper.setupRun();
    // Win a fight to earn essence
    const found = await gameHelper.proceedToEncounter(20);
    expect(found).toBe(true);
    await page.locator(SELECTORS.fightBtn).click();
    await gameHelper.waitForPhase(['combat'], 5000);
    await gameHelper.winCombat();
    await gameHelper.page.waitForTimeout(2000);
    // Forfeit to end run and award essence
    await gameHelper.forfeitRun();
    const essence = await gameHelper.getPlayerEssence();
    expect(essence).toBeGreaterThan(0);
  });
});
```

**Step 3: Run, fix, commit**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test specs/progression specs/meta-progression --workers=1 -x; pkill -f "node server.js"
```

```bash
/usr/bin/git add tests/e2e/specs/progression.spec.ts tests/e2e/specs/meta-progression.spec.ts && /usr/bin/git add -u
/usr/bin/git commit -m "test: rewrite progression and meta-progression specs for mobile UI"
```

---

## Task 15: Run full test suite and fix remaining issues

**Step 1: Run all tests**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
pkill -f "node server.js" 2>/dev/null; npm start & sleep 3; cd tests/e2e && npx playwright test --workers=1 -x; pkill -f "node server.js"
```

**Step 2: Fix any failing tests**

Common cross-cutting bugs to watch for:
- `window.gameState` not available immediately after page load → ensure `loadGameState()` runs before UI init
- Takeover CSS transitions causing timing issues → increase wait times or use `waitForFunction` on `.active` class
- Debug mode getting disabled between tests → `global-setup.ts` re-enables it, but verify
- Flash card word pool empty → combat-loop must call the JPDB mock or fallback word provider
- `forfeit-run` endpoint not existing → check actual endpoint name (may be `POST /api/game/forfeit-run` or different)

**Step 3: Re-run until all pass**

Target: all 38 tests pass.

**Step 4: Final commit if needed**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
/usr/bin/git add -u
/usr/bin/git commit -m "fix: resolve remaining test failures in mobile E2E suite"
```

---

## Expected Final Test Count

| Spec | Tests |
|------|-------|
| character-creation | 3 |
| run-and-exploration | 6 |
| combat | 6 |
| word-practice | 4 |
| shop | 4 |
| equipment | 3 |
| game-over | 3 |
| settings | 3 |
| boss-fights | 3 |
| progression | 2 |
| meta-progression | 2 |
| **Total** | **39** |

---

## What's preserved from existing framework

- **Playwright config** — unchanged (workers=1, sequential, Chromium, base URL, global setup/teardown)
- **Global setup/teardown** — unchanged (debug mode enable, full-reset)
- **Test fixture pattern** — same `test.extend` with `gameHelper` fixture
- **State query helpers** — same `page.evaluate(() => window.gameState.*)` pattern
- **`resetGameState`** — same POST to full-reset
- **`setupCharacter`** — same pattern (reset → navigate → create)
- **`setupCombat`** — same pattern (character → debug-force-combat → reload)
- **`proceedToEncounter` loop** — same retry pattern with adapted selectors
- **`waitForPhase` with array** — preserved multi-phase support

## What's changed

- **Selectors** — all new for mobile DOM (takeovers, action-area, flash cards)
- **`createCharacter`** — clicks `#new-game-btn` instead of stat modal flow
- **`startRun`** — clicks `#context-action-btn` instead of finding first button in action panel
- **`selectWard`** — clicks `.ward-option` + `#ward-proceed-btn` instead of `window.selectWard()`
- **Combat methods** — flash card flip+swipe replaces attack/defend/magic/flee buttons
- **Takeover checks** — `.classList.contains('active')` replaces modal visibility checks
- **New `forcePhase`** — deterministic phase setup via debug API (replaces fragile client-side state hacks)
- **New `winCombat`** — loops swipe-right until combat ends
- **Desktop-only methods removed** — attack/defend/magic/flee, word input modal, stat allocation, upgrades modal

## Out of Scope

- Performance testing
- Visual regression testing
- Multi-browser testing (Chromium only)
- Mobile viewport simulation (tests run in desktop Chromium, DOM is mobile-first)
- Tests for features not in mobile v1 (upgrades modal, liberation tracker, stat allocation)
