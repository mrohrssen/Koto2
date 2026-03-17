# Meta Progression Shop Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a meta progression shop to the hub where players spend Progression Tokens (earned from bosses) on permanent HP/XP/ATK upgrades with 5 levels each.

**Architecture:** Data-driven upgrades defined in JSON, purchased via new API routes, applied as multipliers at run start and creature creation. Frontend renders a full-screen panel from the hub.

**Tech Stack:** Node.js (ES modules), Express routes, vanilla JS frontend, node:test for testing.

**Spec:** `docs/superpowers/specs/2026-03-17-meta-progression-shop-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `data/meta-upgrades.json` | Upgrade definitions (3 upgrades, costs, values) |
| Create | `src/game/services/meta-shop-service.js` | Buy logic, upgrade state queries, bonus calculation |
| Create | `src/routes/game/meta-shop.js` | GET/POST API routes for meta shop |
| Create | `public/js/ui/meta-shop.js` | Frontend upgrade panel UI |
| Create | `tests/unit/game/meta-shop-service.test.js` | Unit tests for meta shop service |
| Modify | `src/game/state.js` | Add `progressionTokens` to `createMetaProgression()` |
| Modify | `src/game/loop.js` | Expose `progressionTokens`/`upgrades` in `getState()`, apply bonuses in `startRun()` |
| Modify | `src/game/manager-registry.js` | Migration for existing saves |
| Modify | `src/routes/game/index.js` | Mount meta-shop routes |
| Modify | `public/js/ui/exploration.js` | Add "Upgrades" button to `renderHub()` |
| Modify | `public/game.js` | Import and init meta-shop module |
| Modify | `docs/ARCHITECTURE.md` | Remove "No meta-upgrade system" line, document new system |

---

### Task 1: Upgrade Data + State Foundation

**Files:**
- Create: `data/meta-upgrades.json`
- Modify: `src/game/state.js:39-76` (createMetaProgression)
- Modify: `src/game/manager-registry.js:31-58` (migration block)
- Modify: `src/game/loop.js:252-257` (getState meta serialization)

- [ ] **Step 1: Create `data/meta-upgrades.json`**

```json
[
  {
    "id": "hp_boost",
    "nameEn": "HP Boost",
    "description": "Increases base HP of all creatures",
    "effectType": "percentHp",
    "valuesPerLevel": [5, 10, 15, 20, 25],
    "costsPerLevel": [1, 2, 3, 4, 5],
    "maxLevel": 5
  },
  {
    "id": "xp_boost",
    "nameEn": "XP Boost",
    "description": "Increases XP earned from combat",
    "effectType": "percentXp",
    "valuesPerLevel": [10, 20, 30, 40, 50],
    "costsPerLevel": [1, 2, 3, 4, 5],
    "maxLevel": 5
  },
  {
    "id": "atk_boost",
    "nameEn": "ATK Boost",
    "description": "Increases base ATK of all creatures",
    "effectType": "percentAtk",
    "valuesPerLevel": [5, 10, 15, 20, 25],
    "costsPerLevel": [1, 2, 3, 4, 5],
    "maxLevel": 5
  }
]
```

- [ ] **Step 2: Add `progressionTokens: 0` to `createMetaProgression()` in `src/game/state.js`**

Add after the existing `upgrades: {}` line (around line 42):

```javascript
progressionTokens: 0,
```

- [ ] **Step 3: Add save migration in `src/game/manager-registry.js`**

Inside the `if (data.meta)` block (after the creatureCollection migration around line 58), add:

```javascript
// Migrate: add progressionTokens and upgrades if missing from old saves
if (data.meta.progressionTokens === undefined) {
  data.meta.progressionTokens = 0;
}
if (!data.meta.upgrades) {
  data.meta.upgrades = {};
}
```

- [ ] **Step 4: Expose `progressionTokens` and `upgrades` in `getState()` in `src/game/loop.js`**

In `getState()` (line 252-257), the meta block currently serializes only `lifetimeStats`, `achievements`, `levels`, `prologueComplete`. Add two fields:

```javascript
meta: this.meta ? {
  lifetimeStats: this.meta.lifetimeStats,
  achievements: this.meta.achievements,
  levels: this.meta.levels || { highestUnlocked: 1, completed: [], current: null },
  prologueComplete: this.meta.prologueComplete || false,
  progressionTokens: this.meta.progressionTokens || 0,
  upgrades: this.meta.upgrades || {}
} : null,
```

- [ ] **Step 5: Verify with syntax check**

Run: `node --check src/game/state.js && node --check src/game/loop.js && node --check src/game/manager-registry.js && echo "OK"`

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add data/meta-upgrades.json src/game/state.js src/game/loop.js src/game/manager-registry.js
git commit -m "feat(meta-shop): add upgrade data, state field, migration, and state serialization"
```

---

### Task 2: Meta Shop Service (with tests)

**Files:**
- Create: `src/game/services/meta-shop-service.js`
- Create: `tests/unit/game/meta-shop-service.test.js`

- [ ] **Step 1: Write failing tests for meta shop service**

Create `tests/unit/game/meta-shop-service.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMetaShopState, buyUpgrade, getMetaMultipliers } from '../../../src/game/services/meta-shop-service.js';

describe('meta-shop-service', () => {
  function makeMeta(tokens = 0, upgrades = {}) {
    return { progressionTokens: tokens, upgrades };
  }

  describe('getMetaShopState', () => {
    it('returns all upgrades with current levels and costs', () => {
      const meta = makeMeta(5, { hp_boost: 2 });
      const result = getMetaShopState(meta);

      assert.equal(result.progressionTokens, 5);
      assert.equal(result.upgrades.length, 3);

      const hp = result.upgrades.find(u => u.id === 'hp_boost');
      assert.equal(hp.currentLevel, 2);
      assert.equal(hp.currentValue, 10);
      assert.equal(hp.nextCost, 3);
      assert.equal(hp.nextValue, 15);

      const xp = result.upgrades.find(u => u.id === 'xp_boost');
      assert.equal(xp.currentLevel, 0);
      assert.equal(xp.nextCost, 1);
    });

    it('shows null for next cost/value when maxed', () => {
      const meta = makeMeta(0, { atk_boost: 5 });
      const result = getMetaShopState(meta);
      const atk = result.upgrades.find(u => u.id === 'atk_boost');
      assert.equal(atk.currentLevel, 5);
      assert.equal(atk.nextCost, null);
      assert.equal(atk.nextValue, null);
    });
  });

  describe('buyUpgrade', () => {
    it('purchases an upgrade and deducts tokens', () => {
      const meta = makeMeta(3, {});
      const result = buyUpgrade(meta, 'hp_boost');

      assert.equal(result.success, true);
      assert.equal(meta.upgrades.hp_boost, 1);
      assert.equal(meta.progressionTokens, 2);
    });

    it('purchases next level of existing upgrade', () => {
      const meta = makeMeta(5, { hp_boost: 2 });
      const result = buyUpgrade(meta, 'hp_boost');

      assert.equal(result.success, true);
      assert.equal(meta.upgrades.hp_boost, 3);
      assert.equal(meta.progressionTokens, 2); // cost 3 for level 3
    });

    it('rejects purchase when not enough tokens', () => {
      const meta = makeMeta(1, { hp_boost: 2 }); // needs 3 for level 3
      const result = buyUpgrade(meta, 'hp_boost');

      assert.equal(result.success, false);
      assert.match(result.error, /enough tokens/i);
      assert.equal(meta.upgrades.hp_boost, 2); // unchanged
    });

    it('rejects purchase when already maxed', () => {
      const meta = makeMeta(99, { xp_boost: 5 });
      const result = buyUpgrade(meta, 'xp_boost');

      assert.equal(result.success, false);
      assert.match(result.error, /max/i);
    });

    it('rejects purchase for unknown upgrade', () => {
      const meta = makeMeta(10, {});
      const result = buyUpgrade(meta, 'fake_upgrade');

      assert.equal(result.success, false);
      assert.match(result.error, /not found/i);
    });
  });

  describe('getMetaMultipliers', () => {
    it('returns 1.0 multipliers when no upgrades', () => {
      const meta = makeMeta(0, {});
      const mults = getMetaMultipliers(meta);

      assert.equal(mults.hpMult, 1.0);
      assert.equal(mults.atkMult, 1.0);
      assert.equal(mults.xpMult, 1.0);
    });

    it('calculates correct multipliers from upgrade levels', () => {
      const meta = makeMeta(0, { hp_boost: 3, atk_boost: 2, xp_boost: 4 });
      const mults = getMetaMultipliers(meta);

      assert.equal(mults.hpMult, 1.15);  // 15%
      assert.equal(mults.atkMult, 1.10);  // 10%
      assert.equal(mults.xpMult, 1.40);  // 40%
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/game/meta-shop-service.test.js`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement meta shop service**

Create `src/game/services/meta-shop-service.js`:

```javascript
/**
 * @fileoverview Meta progression shop service
 *
 * Handles upgrade queries, purchases, and bonus multiplier calculation.
 * Pure functions that operate on meta state — no side effects.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPGRADES = JSON.parse(readFileSync(join(__dirname, '../../../data/meta-upgrades.json'), 'utf-8'));
const UPGRADES_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

/**
 * Get current meta shop state for display
 * @param {object} meta - Player's meta-progression object
 * @returns {{ progressionTokens: number, upgrades: Array }}
 */
export function getMetaShopState(meta) {
  const upgrades = UPGRADES.map(def => {
    const currentLevel = meta.upgrades?.[def.id] || 0;
    const isMaxed = currentLevel >= def.maxLevel;
    return {
      id: def.id,
      nameEn: def.nameEn,
      description: def.description,
      currentLevel,
      maxLevel: def.maxLevel,
      currentValue: currentLevel > 0 ? def.valuesPerLevel[currentLevel - 1] : 0,
      nextCost: isMaxed ? null : def.costsPerLevel[currentLevel],
      nextValue: isMaxed ? null : def.valuesPerLevel[currentLevel]
    };
  });

  return {
    progressionTokens: meta.progressionTokens || 0,
    upgrades
  };
}

/**
 * Purchase an upgrade level. Mutates meta state.
 * @param {object} meta - Player's meta-progression object
 * @param {string} upgradeId - Upgrade to purchase
 * @returns {{ success: boolean, error?: string }}
 */
export function buyUpgrade(meta, upgradeId) {
  const def = UPGRADES_BY_ID[upgradeId];
  if (!def) return { success: false, error: 'Upgrade not found' };

  const currentLevel = meta.upgrades?.[upgradeId] || 0;
  if (currentLevel >= def.maxLevel) return { success: false, error: 'Already at max level' };

  const cost = def.costsPerLevel[currentLevel];
  if ((meta.progressionTokens || 0) < cost) return { success: false, error: 'Not enough tokens' };

  meta.progressionTokens -= cost;
  meta.upgrades[upgradeId] = currentLevel + 1;
  return { success: true };
}

/**
 * Calculate meta bonus multipliers from current upgrade levels
 * @param {object} meta - Player's meta-progression object
 * @returns {{ hpMult: number, atkMult: number, xpMult: number }}
 */
export function getMetaMultipliers(meta) {
  const upgrades = meta.upgrades || {};
  const hpLevel = upgrades.hp_boost || 0;
  const atkLevel = upgrades.atk_boost || 0;
  const xpLevel = upgrades.xp_boost || 0;

  const hpDef = UPGRADES_BY_ID['hp_boost'];
  const atkDef = UPGRADES_BY_ID['atk_boost'];
  const xpDef = UPGRADES_BY_ID['xp_boost'];

  return {
    hpMult: hpLevel > 0 ? 1 + hpDef.valuesPerLevel[hpLevel - 1] / 100 : 1.0,
    atkMult: atkLevel > 0 ? 1 + atkDef.valuesPerLevel[atkLevel - 1] / 100 : 1.0,
    xpMult: xpLevel > 0 ? 1 + xpDef.valuesPerLevel[xpLevel - 1] / 100 : 1.0
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/game/meta-shop-service.test.js`

Expected: All 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/services/meta-shop-service.js tests/unit/game/meta-shop-service.test.js
git commit -m "feat(meta-shop): add meta shop service with buy logic and multiplier calc"
```

---

### Task 3: Apply Meta Bonuses at Run Start + Creature Creation

**Files:**
- Modify: `src/game/loop.js:304-335` (startRun), `src/game/loop.js:545-569` (_flushPendingCaptures)
- Modify: `src/game/services/exploration-service.js:543-603` (dealerBuy)
- Modify: `src/game/creatures.js:129-176` (addXpToCreature)

**Key design note:** Meta bonuses are baked into creature stats, but `addXpToCreature()` recalculates stats from base templates on level-up (line 139-143), which would erase the bonuses. To handle this, we store `metaHpMult`/`metaAtkMult` on the run and re-apply after every level-up.

- [ ] **Step 1: Import `getMetaMultipliers` in `src/game/loop.js`**

Add to imports (around line 59-60):

```javascript
import { getMetaMultipliers } from './services/meta-shop-service.js';
```

- [ ] **Step 2: Add `applyMetaBonuses` helper to `src/game/loop.js`**

Add a module-level helper function (before the GameManager class):

```javascript
/** Apply meta progression HP/ATK bonuses to a creature using run multipliers */
function applyMetaBonuses(creature, run) {
  if (!creature || !run) return;
  if (run.metaHpMult > 1) {
    creature.maxHp = Math.floor(creature.maxHp * run.metaHpMult);
    creature.hp = creature.maxHp;
  }
  if (run.metaAtkMult > 1) {
    creature.attack = Math.floor(creature.attack * run.metaAtkMult);
  }
}
```

- [ ] **Step 3: Apply meta bonuses in `startRun()`**

After the creature instantiation block (after line 326 `}`), add:

```javascript
    // Apply meta progression bonuses
    const metaMults = getMetaMultipliers(this.meta);
    this.run.metaHpMult = metaMults.hpMult;
    this.run.metaAtkMult = metaMults.atkMult;

    // Apply HP/ATK bonuses to starting creatures
    for (const creature of this.run.creatureParty.active) {
      applyMetaBonuses(creature, this.run);
    }

    // Fold XP bonus into itemBuffs base
    this.run.itemBuffs.xpMultiplier = metaMults.xpMult;
```

- [ ] **Step 4: Apply meta bonuses to befriended creatures in `_flushPendingCaptures()`**

In `_flushPendingCaptures()` (line 545-569), after a creature is pushed into `active` or `reserves` (lines 552-554), apply meta bonuses:

```javascript
      if (this.run.creatureParty.active.length < 3) {
        this.run.creatureParty.active.push(creature);
      } else {
        this.run.creatureParty.reserves.push(creature);
      }
      applyMetaBonuses(creature, this.run);
```

This is the correct place because `processBefriend()` in creature-combat-service.js puts captured creatures into `pendingCaptures` (line 604), and `_flushPendingCaptures()` moves them into the party after combat ends.

- [ ] **Step 5: Apply meta bonuses to dealer-bought creatures**

In `src/game/services/exploration-service.js`, find `dealerBuy()`. After the creature is placed into active/reserves (around line 584-589), add:

```javascript
    // Apply meta progression bonuses to purchased creature
    if (this.run.metaHpMult > 1) {
      offered.maxHp = Math.floor(offered.maxHp * this.run.metaHpMult);
      offered.hp = offered.maxHp;
    }
    if (this.run.metaAtkMult > 1) {
      offered.attack = Math.floor(offered.attack * this.run.metaAtkMult);
    }
```

- [ ] **Step 6: Re-apply meta bonuses after level-up in `addXpToCreature()`**

In `src/game/creatures.js`, `addXpToCreature()` recalculates stats from base templates on level-up (lines 139-143), which erases baked-in meta bonuses. Add an optional `metaMults` parameter and re-apply after each level-up:

Change the function signature (line 129):

```javascript
export function addXpToCreature(creature, xp, metaMults = null) {
```

After the stats are recalculated (after line 146 `creature.mp = ...`), add:

```javascript
    // Re-apply meta progression bonuses after level-up stat recalculation
    if (metaMults) {
      if (metaMults.hpMult > 1) {
        const hpBefore = creature.hp;
        creature.maxHp = Math.floor(creature.maxHp * metaMults.hpMult);
        creature.hp = hpBefore + Math.floor(hpDiff * metaMults.hpMult);
      }
      if (metaMults.atkMult > 1) {
        creature.attack = Math.floor(creature.attack * metaMults.atkMult);
      }
    }
```

Then update all callers of `addXpToCreature` to pass the run's meta multipliers. In `creature-combat-service.js`, `awardKillXp()` calls `addXpToCreature` (around line 660). Add `metaMults` as a parameter to `awardKillXp()` and pass it through:

```javascript
// In awardKillXp signature, add metaMults parameter:
export function awardKillXp(creatureParty, enemyLevel, xpMultiplier = 1.0, xpBalanceStacks = 0, metaMults = null) {

// In the addXpToCreature calls within awardKillXp, pass metaMults:
const levelUps = addXpToCreature(creature, share, metaMults);
```

Then update all callers of `awardKillXp` in `loop.js` to pass `{ hpMult: this.run.metaHpMult, atkMult: this.run.metaAtkMult }`. Search for `awardKillXp` calls and add the parameter.

- [ ] **Step 7: Add TODO comments for token earning**

In `src/game/loop.js`, find the boss defeat victory paths (around lines 627-635 where `bossesDefeated` is tracked, and the befriend victory path around line 896). Add TODO comments:

```javascript
// TODO: Award progression token when boss system is implemented
// this.meta.progressionTokens += 1;
```

- [ ] **Step 8: Syntax check**

Run: `node --check src/game/loop.js && node --check src/game/services/exploration-service.js && node --check src/game/creatures.js && node --check src/game/services/creature-combat-service.js && echo "OK"`

Expected: `OK`

- [ ] **Step 9: Run existing tests to check for regressions**

Run: `npm test`

Expected: All existing tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/game/loop.js src/game/services/exploration-service.js src/game/creatures.js src/game/services/creature-combat-service.js
git commit -m "feat(meta-shop): apply HP/ATK/XP meta bonuses at run start, creature creation, and level-up"
```

---

### Task 4: API Routes

**Files:**
- Create: `src/routes/game/meta-shop.js`
- Modify: `src/routes/game/index.js:88-89` (mount routes)

- [ ] **Step 1: Create `src/routes/game/meta-shop.js`**

Follow the pattern from `src/routes/game/economy.js`:

```javascript
/**
 * @fileoverview Meta progression shop routes
 *
 * GET /meta-shop — upgrade state + token balance
 * POST /meta-shop/buy — purchase an upgrade level
 */

import { Router } from 'express';
import { getMetaShopState, buyUpgrade } from '../../game/services/meta-shop-service.js';

export default function createMetaShopRoutes() {
  const router = Router();

  router.get('/meta-shop', (req, res) => {
    const meta = req.gameManager.getMeta();
    res.json(getMetaShopState(meta));
  });

  router.post('/meta-shop/buy', (req, res) => {
    const { upgradeId } = req.body;
    if (!upgradeId) return res.status(400).json({ error: 'upgradeId required' });

    const meta = req.gameManager.getMeta();

    // Hub phase check: run must be null
    if (req.gameManager.run) {
      return res.status(400).json({ error: 'Cannot buy upgrades during a run' });
    }

    const result = buyUpgrade(meta, upgradeId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    req.saveGame();
    res.json(getMetaShopState(meta));
  });

  return router;
}
```

- [ ] **Step 2: Mount routes in `src/routes/game/index.js`**

Add import at top (after line 18):

```javascript
import createMetaShopRoutes from './meta-shop.js';
```

Add mount after economy routes (after line 89 `router.use(createEconomyRoutes());`):

```javascript
  // Mount meta shop routes
  router.use(createMetaShopRoutes());
```

- [ ] **Step 3: Syntax check**

Run: `node --check src/routes/game/meta-shop.js && node --check src/routes/game/index.js && echo "OK"`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/routes/game/meta-shop.js src/routes/game/index.js
git commit -m "feat(meta-shop): add GET/POST API routes for meta shop"
```

---

### Task 5: Frontend UI

**Files:**
- Create: `public/js/ui/meta-shop.js`
- Modify: `public/js/ui/exploration.js:247-271` (renderHub)
- Modify: `public/game.js` (import + init)

- [ ] **Step 1: Create `public/js/ui/meta-shop.js`**

```javascript
/**
 * @fileoverview Meta progression shop UI
 *
 * Full-screen panel showing 3 upgrades with buy buttons.
 * Opened from hub "Upgrades" button.
 */

let getGameState = null;
let updateGameState = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
}

/**
 * Show the meta shop panel
 */
export async function show() {
  // Remove existing panel if any
  document.getElementById('meta-shop-panel')?.remove();

  let shopData;
  try {
    const res = await fetch('/api/game/meta-shop');
    shopData = await res.json();
  } catch (e) {
    console.error('Failed to fetch meta shop:', e);
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'meta-shop-panel';
  panel.className = 'meta-shop-panel';
  panel.innerHTML = `
    <div class="meta-shop-header">
      <button class="meta-shop-close" id="meta-shop-close-btn">&times;</button>
      <h2>Upgrades</h2>
      <div class="meta-shop-tokens">${shopData.progressionTokens} Tokens</div>
    </div>
    <div class="meta-shop-upgrades">
      ${shopData.upgrades.map(u => renderUpgradeCard(u, shopData.progressionTokens)).join('')}
    </div>
  `;

  document.getElementById('game-container').appendChild(panel);

  // Close button
  document.getElementById('meta-shop-close-btn')?.addEventListener('click', () => {
    panel.remove();
  });

  // Buy buttons
  panel.querySelectorAll('.meta-shop-buy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const upgradeId = btn.dataset.upgradeId;
      try {
        const res = await fetch('/api/game/meta-shop/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upgradeId })
        });
        if (res.ok) {
          // Re-render with updated data
          show();
        }
      } catch (e) {
        console.error('Failed to buy upgrade:', e);
      }
    });
  });
}

function renderUpgradeCard(upgrade, tokens) {
  const isMaxed = upgrade.currentLevel >= upgrade.maxLevel;
  const canAfford = !isMaxed && tokens >= upgrade.nextCost;

  // Level pips
  const pips = Array.from({ length: upgrade.maxLevel }, (_, i) =>
    `<span class="meta-shop-pip ${i < upgrade.currentLevel ? 'filled' : ''}"></span>`
  ).join('');

  const statusText = isMaxed
    ? '<span class="meta-shop-maxed">MAX</span>'
    : `<span class="meta-shop-next">Next: +${upgrade.nextValue}% &mdash; ${upgrade.nextCost} token${upgrade.nextCost !== 1 ? 's' : ''}</span>`;

  const currentText = upgrade.currentValue > 0
    ? `<span class="meta-shop-current">+${upgrade.currentValue}%</span>`
    : '';

  return `
    <div class="meta-shop-card ${isMaxed ? 'maxed' : ''}">
      <div class="meta-shop-card-header">
        <strong>${upgrade.nameEn}</strong>
        ${currentText}
      </div>
      <div class="meta-shop-card-desc">${upgrade.description}</div>
      <div class="meta-shop-pips">${pips}</div>
      <div class="meta-shop-card-footer">
        ${statusText}
        ${!isMaxed ? `<button class="meta-shop-buy-btn ${canAfford ? '' : 'disabled'}" data-upgrade-id="${upgrade.id}" ${canAfford ? '' : 'disabled'}>Buy</button>` : ''}
      </div>
    </div>
  `;
}
```

- [ ] **Step 2: Add CSS for meta shop**

Add to `public/game.css` at the end:

```css
/* ============ META SHOP ============ */

.meta-shop-panel {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--bg-primary, #0a0a1a);
  display: flex;
  flex-direction: column;
  padding: 1rem;
  overflow-y: auto;
}

.meta-shop-header {
  text-align: center;
  margin-bottom: 1rem;
  position: relative;
}

.meta-shop-header h2 {
  margin: 0;
  color: var(--text-primary, #fff);
}

.meta-shop-tokens {
  color: var(--accent-primary, #ffd700);
  font-size: 1.1rem;
  margin-top: 0.25rem;
}

.meta-shop-close {
  position: absolute;
  top: 0;
  right: 0;
  background: none;
  border: none;
  color: var(--text-secondary, #aaa);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
}

.meta-shop-upgrades {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 400px;
  margin: 0 auto;
  width: 100%;
}

.meta-shop-card {
  background: var(--bg-secondary, #1a1a2e);
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  padding: 0.75rem;
}

.meta-shop-card.maxed {
  opacity: 0.7;
}

.meta-shop-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
  color: var(--text-primary, #fff);
}

.meta-shop-current {
  color: var(--accent-primary, #ffd700);
  font-size: 0.9rem;
}

.meta-shop-card-desc {
  color: var(--text-secondary, #aaa);
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}

.meta-shop-pips {
  display: flex;
  gap: 4px;
  margin-bottom: 0.5rem;
}

.meta-shop-pip {
  width: 20%;
  height: 6px;
  border-radius: 3px;
  background: var(--bg-tertiary, #2a2a3e);
}

.meta-shop-pip.filled {
  background: var(--accent-primary, #ffd700);
}

.meta-shop-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.meta-shop-next {
  color: var(--text-secondary, #aaa);
  font-size: 0.8rem;
}

.meta-shop-maxed {
  color: var(--accent-primary, #ffd700);
  font-weight: bold;
  font-size: 0.9rem;
}

.meta-shop-buy-btn {
  background: var(--accent-primary, #ffd700);
  color: #000;
  border: none;
  border-radius: 4px;
  padding: 0.35rem 0.75rem;
  font-weight: bold;
  cursor: pointer;
  font-size: 0.85rem;
}

.meta-shop-buy-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Add "Upgrades" button to `renderHub()` in `public/js/ui/exploration.js`**

Import meta-shop at the top of the file:

```javascript
import * as metaShop from './meta-shop.js';
```

Replace the `renderHub()` function body (lines 249-253) to add the Upgrades button:

```javascript
  const gameState = getGameState();
  const tokens = gameState.meta?.progressionTokens || 0;

  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:340px;">
      <button class="action-btn action-btn-secondary" id="speed-review-btn">\uD83D\uDCDA 速習</button>
      <button class="action-btn action-btn-secondary" id="upgrades-btn">\u2B06\uFE0F Upgrades${tokens > 0 ? ` (${tokens})` : ''}</button>
      <button class="action-btn action-btn-primary" id="context-action-btn">\u26A1 潜入</button>
    </div>
  `);
```

Then add the event listener after the existing ones (after line 270):

```javascript
  document.getElementById('upgrades-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    metaShop.show();
  });
```

- [ ] **Step 4: Init meta-shop module in `public/game.js`**

Add import at top:

```javascript
import * as metaShop from './js/ui/meta-shop.js';
```

Add init call alongside other module inits (after explorationUI.init or similar):

```javascript
metaShop.init({
  getGameState: () => gameState,
  updateGameState: updateGameState
});
```

- [ ] **Step 5: Syntax check all frontend files**

Run: `node --check public/js/ui/meta-shop.js && node --check public/js/ui/exploration.js && node --check public/game.js && echo "OK"`

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/meta-shop.js public/js/ui/exploration.js public/game.js public/game.css
git commit -m "feat(meta-shop): add frontend upgrade panel with hub button"
```

---

### Task 6: Update Architecture Docs

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Remove "No meta-upgrade system" from "What Does Not Exist"**

Find the line `No essence currency or meta-upgrade system` in `docs/ARCHITECTURE.md` and remove it.

- [ ] **Step 2: Add meta shop to the Meta-Progression section**

In the Meta-Progression section (around line 393-409), add a paragraph about the upgrade shop:

```markdown
### Progression Tokens & Upgrades

Players earn 1 Progression Token per boss defeated or befriended. Tokens are spent at the hub shop on permanent upgrades (HP Boost, XP Boost, ATK Boost) with 5 levels each. Upgrade definitions live in `data/meta-upgrades.json`. Purchase logic is in `src/game/services/meta-shop-service.js`. Bonuses apply as percentage multipliers baked into creature stats at run start and creature creation.
```

- [ ] **Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: add meta progression shop to architecture docs"
```

---

### Task 7: Full Test Suite + Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: All tests pass (unit + integration).

- [ ] **Step 2: Manual smoke test**

Start the dev server with `npm run dev`, then verify:
1. Load the game, reach the hub
2. "Upgrades" button visible in hub
3. Click opens the upgrade panel
4. All 3 upgrades shown with level 0 / 5
5. No tokens = buy buttons disabled
6. Close button dismisses panel

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(meta-shop): address smoke test issues"
```
