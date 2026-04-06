# Crests Meta-Progression Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old meta-upgrade shop with a gacha-style Crests system where players collect element drops from defeated enemies, open element chests, and equip one crest per element for permanent party-wide stat buffs.

**Architecture:** New `crest-service.js` handles all crest logic (generation, chest opening, equip, multiplier calculation). The existing `applyMetaBonuses()` function in `loop.js` is rewritten to use crest multipliers instead of the old upgrade system. Two new frontend UI modules (chests + equip) replace meta-shop.js. A new PixiJS module handles the gacha chest-opening animation.

**Tech Stack:** Node.js, Express, PixiJS 8, vanilla JS frontend modules, node:test

**Spec:** `docs/superpowers/specs/2026-04-06-crests-meta-progression-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/game/services/crest-service.js` | Crest generation, chest opening, equip/unequip, multiplier calculation |
| `tests/unit/game/crest-service.test.js` | Unit tests for crest service |
| `src/routes/game/crests.js` | API routes: GET state, POST open-chest, POST equip, POST unequip |
| `public/js/ui/chests.js` | Chests screen UI (element chest display, drop counts) |
| `public/js/ui/crests-equip.js` | Crest equip screen UI (slots, inventory, preview) |
| `public/js/pixi/chest-animation.js` | PixiJS gacha animation for chest opening |

### Modified Files
| File | Changes |
|------|---------|
| `src/game/state.js:39-87` | Add `elementDrops`, `crests`, `equippedCrests` to meta-progression; remove `progressionTokens`, `upgrades` |
| `src/game/loop.js:73,80-90,389-400,671,891,1247` | Replace `getMetaMultipliers` import with `getCrestMultipliers`; rewrite `applyMetaBonuses`; replace token awards with element drop collection |
| `src/game/services/exploration-service.js:844-850` | Replace inline meta bonus application with `applyMetaBonuses` call |
| `src/routes/game/index.js:20,106` | Replace meta-shop route import/mount with crest routes |
| `public/js/ui/exploration.js:31,338,354` | Replace metaShop import; add chests/crests buttons to hub |
| `public/game.js:107,1789` | Replace metaShop import/init with chests + crests-equip modules |
| `public/game.css:4693-4826` | Remove `.meta-shop-*` styles; add crest/chest styles |

### Deleted Files
| File | Reason |
|------|--------|
| `data/meta-upgrades.json` | Replaced by crests |
| `src/game/services/meta-shop-service.js` | Replaced by crest-service.js |
| `src/routes/game/meta-shop.js` | Replaced by crests.js routes |
| `public/js/ui/meta-shop.js` | Replaced by chests.js + crests-equip.js |
| `tests/unit/game/meta-shop-service.test.js` | Replaced by crest-service.test.js |

---

## Chunk 1: Crest Service (Backend Core)

### Task 1: Create crest-service.js with generation and multiplier logic

**Files:**
- Create: `src/game/services/crest-service.js`
- Test: `tests/unit/game/crest-service.test.js`

- [ ] **Step 1: Write failing test for `generateCrest()`**

```javascript
// tests/unit/game/crest-service.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateCrest, ELEMENT_STAT_MAP, RARITY_RANGES, CHEST_DROP_RATES } from '../../../src/game/services/crest-service.js';

describe('crest-service', () => {
  describe('generateCrest', () => {
    it('generates a crest with correct element and stat', () => {
      const crest = generateCrest('fire');
      assert.equal(crest.element, 'fire');
      assert.equal(crest.stat, 'attack');
      assert.ok(crest.id.startsWith('crest_fire_'));
      assert.ok(typeof crest.value === 'number');
      assert.ok(crest.value >= 0.03 && crest.value <= 0.40);
      assert.ok(['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(crest.rarity));
    });

    it('maps each element to the correct stat', () => {
      assert.equal(generateCrest('fire').stat, 'attack');
      assert.equal(generateCrest('water').stat, 'mp');
      assert.equal(generateCrest('wood').stat, 'hp');
      assert.equal(generateCrest('earth').stat, 'defense');
      assert.equal(generateCrest('metal').stat, 'xp');
    });

    it('generates value within rarity range', () => {
      // Test many times to check bounds
      for (let i = 0; i < 100; i++) {
        const crest = generateCrest('fire');
        const range = RARITY_RANGES[crest.rarity];
        assert.ok(crest.value >= range.min, `${crest.value} < ${range.min} for ${crest.rarity}`);
        assert.ok(crest.value <= range.max, `${crest.value} > ${range.max} for ${crest.rarity}`);
      }
    });

    it('throws on invalid element', () => {
      assert.throws(() => generateCrest('neutral'), /Invalid element/);
      assert.throws(() => generateCrest('ice'), /Invalid element/);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/crest-service.test.js`
Expected: FAIL with "Cannot find module" or "is not a function"

- [ ] **Step 3: Write crest-service.js with generateCrest**

```javascript
// src/game/services/crest-service.js
/**
 * @fileoverview Crest meta-progression service
 *
 * Handles crest generation (gacha), chest opening, equip/unequip,
 * and multiplier calculation. Pure functions — no side effects.
 */

import { randomBytes } from 'crypto';

const VALID_ELEMENTS = ['fire', 'water', 'earth', 'wood', 'metal'];

export const ELEMENT_STAT_MAP = {
  fire:  'attack',
  water: 'mp',
  wood:  'hp',
  earth: 'defense',
  metal: 'xp'
};

export const RARITY_RANGES = {
  common:    { min: 0.03, max: 0.05 },
  uncommon:  { min: 0.06, max: 0.10 },
  rare:      { min: 0.11, max: 0.18 },
  epic:      { min: 0.19, max: 0.28 },
  legendary: { min: 0.29, max: 0.40 }
};

// Weighted drop rates for chest opening (total = 100)
export const CHEST_DROP_RATES = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1
};

const CHEST_COST = 3;

/**
 * Roll a rarity using weighted drop rates.
 * @returns {string} Rarity tier
 */
function rollRarity() {
  const total = Object.values(CHEST_DROP_RATES).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [rarity, weight] of Object.entries(CHEST_DROP_RATES)) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return 'common';
}

/**
 * Generate a random crest for the given element.
 * @param {string} element - fire|water|earth|wood|metal
 * @returns {{ id: string, element: string, rarity: string, stat: string, value: number }}
 */
export function generateCrest(element) {
  if (!VALID_ELEMENTS.includes(element)) {
    throw new Error(`Invalid element: ${element}`);
  }

  const rarity = rollRarity();
  const range = RARITY_RANGES[rarity];
  const value = Math.round((range.min + Math.random() * (range.max - range.min)) * 100) / 100;
  const suffix = randomBytes(3).toString('hex');

  return {
    id: `crest_${element}_${suffix}`,
    element,
    rarity,
    stat: ELEMENT_STAT_MAP[element],
    value
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/crest-service.test.js`
Expected: All 4 tests PASS

- [ ] **Step 5: Write failing tests for `openChest()` and `getCrestMultipliers()`**

Add to `tests/unit/game/crest-service.test.js`:

```javascript
import { generateCrest, openChest, getCrestMultipliers, equipCrest, unequipCrest, ELEMENT_STAT_MAP, RARITY_RANGES, CHEST_DROP_RATES } from '../../../src/game/services/crest-service.js';

// ... existing generateCrest tests ...

  describe('openChest', () => {
    function makeMeta(drops = {}) {
      return {
        elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0, ...drops },
        crests: [],
        equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null }
      };
    }

    it('opens a chest and deducts drops', () => {
      const meta = makeMeta({ fire: 5 });
      const result = openChest(meta, 'fire');

      assert.equal(result.success, true);
      assert.equal(meta.elementDrops.fire, 2); // 5 - 3
      assert.equal(meta.crests.length, 1);
      assert.equal(meta.crests[0].element, 'fire');
      assert.equal(result.crest.element, 'fire');
    });

    it('fails with insufficient drops', () => {
      const meta = makeMeta({ fire: 2 });
      const result = openChest(meta, 'fire');

      assert.equal(result.success, false);
      assert.equal(result.error, 'Not enough element drops');
      assert.equal(meta.elementDrops.fire, 2); // unchanged
      assert.equal(meta.crests.length, 0);
    });

    it('fails with invalid element', () => {
      const meta = makeMeta();
      const result = openChest(meta, 'neutral');

      assert.equal(result.success, false);
      assert.match(result.error, /Invalid element/);
    });
  });

  describe('equipCrest', () => {
    function makeMeta() {
      const crest = { id: 'crest_fire_abc', element: 'fire', rarity: 'rare', stat: 'attack', value: 0.15 };
      return {
        crests: [crest],
        equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null }
      };
    }

    it('equips a crest to matching element slot', () => {
      const meta = makeMeta();
      const result = equipCrest(meta, 'crest_fire_abc');

      assert.equal(result.success, true);
      assert.equal(meta.equippedCrests.fire, 'crest_fire_abc');
    });

    it('fails when crest not found', () => {
      const meta = makeMeta();
      const result = equipCrest(meta, 'crest_fire_nonexistent');

      assert.equal(result.success, false);
      assert.equal(result.error, 'Crest not found');
    });

    it('replaces existing equipped crest', () => {
      const meta = makeMeta();
      const better = { id: 'crest_fire_xyz', element: 'fire', rarity: 'epic', stat: 'attack', value: 0.25 };
      meta.crests.push(better);
      meta.equippedCrests.fire = 'crest_fire_abc';

      const result = equipCrest(meta, 'crest_fire_xyz');
      assert.equal(result.success, true);
      assert.equal(meta.equippedCrests.fire, 'crest_fire_xyz');
    });
  });

  describe('unequipCrest', () => {
    it('unequips a crest from the element slot', () => {
      const meta = {
        crests: [{ id: 'crest_fire_abc', element: 'fire', rarity: 'rare', stat: 'attack', value: 0.15 }],
        equippedCrests: { fire: 'crest_fire_abc', water: null, earth: null, wood: null, metal: null }
      };

      const result = unequipCrest(meta, 'fire');
      assert.equal(result.success, true);
      assert.equal(meta.equippedCrests.fire, null);
    });

    it('succeeds even when slot is already empty', () => {
      const meta = {
        crests: [],
        equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null }
      };

      const result = unequipCrest(meta, 'fire');
      assert.equal(result.success, true);
    });
  });

  describe('getCrestMultipliers', () => {
    it('returns 1.0 multipliers when no crests equipped', () => {
      const meta = {
        crests: [],
        equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null }
      };

      const mults = getCrestMultipliers(meta);
      assert.equal(mults.hpMult, 1.0);
      assert.equal(mults.atkMult, 1.0);
      assert.equal(mults.mpMult, 1.0);
      assert.equal(mults.defMult, 1.0);
      assert.equal(mults.xpMult, 1.0);
    });

    it('applies equipped crest values as multipliers', () => {
      const meta = {
        crests: [
          { id: 'crest_fire_a', element: 'fire', stat: 'attack', value: 0.15 },
          { id: 'crest_wood_b', element: 'wood', stat: 'hp', value: 0.10 }
        ],
        equippedCrests: { fire: 'crest_fire_a', water: null, earth: null, wood: 'crest_wood_b', metal: null }
      };

      const mults = getCrestMultipliers(meta);
      assert.equal(mults.atkMult, 1.15);
      assert.equal(mults.hpMult, 1.10);
      assert.equal(mults.mpMult, 1.0);
      assert.equal(mults.defMult, 1.0);
      assert.equal(mults.xpMult, 1.0);
    });

    it('returns 1.0 multipliers for null/undefined meta', () => {
      const mults = getCrestMultipliers(null);
      assert.equal(mults.hpMult, 1.0);
      assert.equal(mults.atkMult, 1.0);
    });
  });
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `node --test tests/unit/game/crest-service.test.js`
Expected: FAIL — `openChest`, `equipCrest`, `unequipCrest`, `getCrestMultipliers` not exported

- [ ] **Step 7: Implement openChest, equipCrest, unequipCrest, getCrestMultipliers**

Add to `src/game/services/crest-service.js`:

```javascript
/**
 * Open a chest of the given element. Deducts drops, generates a crest, adds to inventory.
 * @param {object} meta - Player's meta-progression object (mutated)
 * @param {string} element - Element of chest to open
 * @returns {{ success: boolean, crest?: object, error?: string }}
 */
export function openChest(meta, element) {
  if (!VALID_ELEMENTS.includes(element)) {
    return { success: false, error: `Invalid element: ${element}` };
  }

  const drops = meta.elementDrops?.[element] || 0;
  if (drops < CHEST_COST) {
    return { success: false, error: 'Not enough element drops' };
  }

  meta.elementDrops[element] -= CHEST_COST;
  const crest = generateCrest(element);
  if (!meta.crests) meta.crests = [];
  meta.crests.push(crest);

  return { success: true, crest };
}

/**
 * Equip a crest by ID. Places it in the matching element slot.
 * @param {object} meta - Player's meta-progression object (mutated)
 * @param {string} crestId - ID of crest to equip
 * @returns {{ success: boolean, error?: string }}
 */
export function equipCrest(meta, crestId) {
  const crest = (meta.crests || []).find(c => c.id === crestId);
  if (!crest) return { success: false, error: 'Crest not found' };

  if (!meta.equippedCrests) {
    meta.equippedCrests = { fire: null, water: null, earth: null, wood: null, metal: null };
  }
  meta.equippedCrests[crest.element] = crestId;
  return { success: true };
}

/**
 * Unequip the crest in the given element slot.
 * @param {object} meta - Player's meta-progression object (mutated)
 * @param {string} element - Element slot to clear
 * @returns {{ success: boolean }}
 */
export function unequipCrest(meta, element) {
  if (!meta.equippedCrests) {
    meta.equippedCrests = { fire: null, water: null, earth: null, wood: null, metal: null };
  }
  meta.equippedCrests[element] = null;
  return { success: true };
}

/**
 * Calculate stat multipliers from equipped crests.
 * @param {object} meta - Player's meta-progression object
 * @returns {{ hpMult: number, atkMult: number, mpMult: number, defMult: number, xpMult: number }}
 */
export function getCrestMultipliers(meta) {
  const defaults = { hpMult: 1.0, atkMult: 1.0, mpMult: 1.0, defMult: 1.0, xpMult: 1.0 };
  if (!meta?.equippedCrests) return defaults;

  const crests = meta.crests || [];
  const equipped = meta.equippedCrests;

  for (const element of VALID_ELEMENTS) {
    const crestId = equipped[element];
    if (!crestId) continue;
    const crest = crests.find(c => c.id === crestId);
    if (!crest) continue;

    switch (crest.stat) {
      case 'attack':  defaults.atkMult += crest.value; break;
      case 'mp':      defaults.mpMult += crest.value; break;
      case 'hp':      defaults.hpMult += crest.value; break;
      case 'defense': defaults.defMult += crest.value; break;
      case 'xp':      defaults.xpMult += crest.value; break;
    }
  }

  return defaults;
}

/**
 * Get crest state for frontend display.
 * @param {object} meta - Player's meta-progression object
 * @returns {{ elementDrops: object, crests: Array, equippedCrests: object }}
 */
export function getCrestState(meta) {
  return {
    elementDrops: meta.elementDrops || { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
    crests: meta.crests || [],
    equippedCrests: meta.equippedCrests || { fire: null, water: null, earth: null, wood: null, metal: null }
  };
}

export { CHEST_COST };
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `node --test tests/unit/game/crest-service.test.js`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/game/services/crest-service.js tests/unit/game/crest-service.test.js
git commit -m "feat: add crest-service with generation, equip, and multiplier logic"
```

---

### Task 2: Update state factory and remove old meta fields

**Files:**
- Modify: `src/game/state.js:39-87`

- [ ] **Step 1: Read the current `createMetaProgression()` function**

Read `src/game/state.js` lines 39-87 to see current state.

- [ ] **Step 2: Replace `progressionTokens` and `upgrades` with crest fields**

In `src/game/state.js`, in `createMetaProgression()`:

Remove these two lines:
```javascript
    // Purchased upgrades (key: upgrade ID, value: level purchased)
    upgrades: {},

    // Progression tokens earned from boss defeats/befriends
    progressionTokens: 0,
```

Add these fields (after `seenCidScripts` or at the end before the closing brace):
```javascript
    // Element drops collected from defeating enemies (persistent)
    elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },

    // All owned crests
    crests: [],

    // Equipped crest IDs (one per element slot)
    equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null },
```

- [ ] **Step 3: Run syntax check**

Run: `node --check src/game/state.js && echo "OK"`
Expected: "OK"

- [ ] **Step 4: Run full test suite to check nothing breaks**

Run: `npm test`
Expected: Meta-shop tests will fail (expected — we'll delete those next). Other tests should pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/state.js
git commit -m "feat: add crest fields to meta-progression, remove progressionTokens/upgrades"
```

---

### Task 3: Replace meta bonus system in loop.js with crest multipliers

**Files:**
- Modify: `src/game/loop.js:73,80-90,389-400`
- Modify: `src/game/services/exploration-service.js:844-850`

- [ ] **Step 1: Replace the import in loop.js**

In `src/game/loop.js`, change line 73:
```javascript
// OLD:
import { getMetaMultipliers } from './services/meta-shop-service.js';
// NEW:
import { getCrestMultipliers } from './services/crest-service.js';
```

- [ ] **Step 2: Rewrite `applyMetaBonuses()` to use crest multipliers**

Replace `src/game/loop.js` lines 80-90:
```javascript
// OLD:
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

// NEW:
/** Apply crest progression bonuses to a creature using run multipliers */
function applyCrestBonuses(creature, run) {
  if (!creature || !run) return;
  const m = run.crestMults;
  if (!m) return;
  if (m.hpMult > 1) {
    creature.maxHp = Math.floor(creature.maxHp * m.hpMult);
    creature.hp = creature.maxHp;
  }
  if (m.atkMult > 1) {
    creature.attack = Math.floor(creature.attack * m.atkMult);
  }
  if (m.mpMult > 1) {
    creature.maxMp = Math.floor(creature.maxMp * m.mpMult);
    creature.mp = creature.maxMp;
  }
  if (m.defMult > 1) {
    creature.defense = Math.max(1, Math.round(creature.defense * m.defMult));
  }
}
```

- [ ] **Step 3: Update startNewRun() to use crest multipliers**

Replace the meta bonus block in `startNewRun()` (around lines 389-400):
```javascript
// OLD:
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

// NEW:
    // Apply crest progression bonuses
    const crestMults = getCrestMultipliers(this.meta);
    this.run.crestMults = crestMults;

    // Apply stat bonuses to starting creatures
    for (const creature of this.run.creatureParty.active) {
      applyCrestBonuses(creature, this.run);
    }

    // Fold XP bonus into itemBuffs base
    this.run.itemBuffs.xpMultiplier = crestMults.xpMult;
```

- [ ] **Step 4: Update `_flushPendingCaptures()` to use new function**

In `src/game/loop.js`, find `applyMetaBonuses(creature, this.run)` inside `_flushPendingCaptures()` (line ~671) and replace:
```javascript
// OLD:
      applyMetaBonuses(creature, this.run);
// NEW:
      applyCrestBonuses(creature, this.run);
```

- [ ] **Step 5: Update all `metaHpMult`/`metaAtkMult` references in loop.js**

Search for all remaining references to `metaHpMult` and `metaAtkMult` in loop.js. There are two patterns:

**Pattern A — local variable (line ~730, feeds `processInterleavedPvERound`):**
```javascript
// OLD:
const metaMults = { hpMult: this.run.metaHpMult || 1, atkMult: this.run.metaAtkMult || 1 };
// NEW:
const metaMults = this.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 };
```

**Pattern B — direct `awardBattleXp` arguments (lines ~1241, 1575, 1630):**
```javascript
// OLD:
awardBattleXp(this.run.creatureParty, { hpMult: this.run.metaHpMult || 1, atkMult: this.run.metaAtkMult || 1 }, this.run.itemBuffs);
// NEW:
awardBattleXp(this.run.creatureParty, this.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 }, this.run.itemBuffs);
```

Apply Pattern A to line ~730, Pattern B to all 3 `awardBattleXp` call sites.

- [ ] **Step 6: Update exploration-service.js dealer purchase**

In `src/game/services/exploration-service.js`, replace the inline meta bonus application (lines 843-850):
```javascript
// OLD:
    // Apply meta progression bonuses to purchased creature
    if (this.gm.run.metaHpMult > 1) {
      newCreature.maxHp = Math.floor(newCreature.maxHp * this.gm.run.metaHpMult);
      newCreature.hp = newCreature.maxHp;
    }
    if (this.gm.run.metaAtkMult > 1) {
      newCreature.attack = Math.floor(newCreature.attack * this.gm.run.metaAtkMult);
    }

// NEW:
    // Apply crest progression bonuses to purchased creature
    const m = this.gm.run.crestMults;
    if (m) {
      if (m.hpMult > 1) { newCreature.maxHp = Math.floor(newCreature.maxHp * m.hpMult); newCreature.hp = newCreature.maxHp; }
      if (m.atkMult > 1) { newCreature.attack = Math.floor(newCreature.attack * m.atkMult); }
      if (m.mpMult > 1) { newCreature.maxMp = Math.floor(newCreature.maxMp * m.mpMult); newCreature.mp = newCreature.maxMp; }
      if (m.defMult > 1) { newCreature.defense = Math.max(1, Math.round(newCreature.defense * m.defMult)); }
    }
```

- [ ] **Step 7: Run syntax check on both files**

Run: `node --check src/game/loop.js && node --check src/game/services/exploration-service.js && echo "OK"`
Expected: "OK"

- [ ] **Step 8: Commit**

```bash
git add src/game/loop.js src/game/services/exploration-service.js
git commit -m "feat: replace meta-upgrade bonuses with crest multipliers in combat"
```

---

### Task 3b: Update addXpToCreature() for MP/DEF crest bonuses on level-up

**Files:**
- Modify: `src/game/creatures.js:165-197`

Level-up recalculates stats from base templates, then re-applies meta bonuses. Currently only handles HP and ATK. Must also re-apply MP and DEF crest bonuses.

- [ ] **Step 1: Update the metaMults re-application block in addXpToCreature()**

In `src/game/creatures.js`, find lines 188-197 (the `if (metaMults)` block inside `addXpToCreature()`):

```javascript
// OLD:
    // Re-apply meta progression bonuses after level-up stat recalculation
    if (metaMults) {
      if (metaMults.hpMult > 1) {
        creature.maxHp = Math.floor(creature.maxHp * metaMults.hpMult);
        hpDiff = Math.floor(hpDiff * metaMults.hpMult);
      }
      if (metaMults.atkMult > 1) {
        creature.attack = Math.floor(creature.attack * metaMults.atkMult);
      }
    }

// NEW:
    // Re-apply crest progression bonuses after level-up stat recalculation
    if (metaMults) {
      if (metaMults.hpMult > 1) {
        creature.maxHp = Math.floor(creature.maxHp * metaMults.hpMult);
        hpDiff = Math.floor(hpDiff * metaMults.hpMult);
      }
      if (metaMults.atkMult > 1) {
        creature.attack = Math.floor(creature.attack * metaMults.atkMult);
      }
      if (metaMults.mpMult > 1) {
        creature.maxMp = Math.floor(creature.maxMp * metaMults.mpMult);
      }
      if (metaMults.defMult > 1) {
        creature.defense = Math.max(1, Math.round(creature.defense * metaMults.defMult));
      }
    }
```

- [ ] **Step 2: Run syntax check**

Run: `node --check src/game/creatures.js && echo "OK"`
Expected: "OK"

- [ ] **Step 3: Commit**

```bash
git add src/game/creatures.js
git commit -m "feat: re-apply MP/DEF crest bonuses on level-up in addXpToCreature"
```

---

### Task 3c: Update getState() and manager-registry.js migration

**Files:**
- Modify: `src/game/loop.js:303-312` (getState)
- Modify: `src/game/manager-registry.js:49-55` (save migration)

- [ ] **Step 1: Update getState() to expose crest fields**

In `src/game/loop.js`, replace lines 308-309 in the `getState()` method:

```javascript
// OLD:
        progressionTokens: this.meta.progressionTokens || 0,
        upgrades: this.meta.upgrades || {},

// NEW:
        elementDrops: this.meta.elementDrops || { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
        crests: this.meta.crests || [],
        equippedCrests: this.meta.equippedCrests || { fire: null, water: null, earth: null, wood: null, metal: null },
```

- [ ] **Step 2: Update manager-registry.js migration code**

In `src/game/manager-registry.js`, replace lines 49-55:

```javascript
// OLD:
          // Migrate: add progressionTokens and upgrades if missing from old saves
          if (data.meta.progressionTokens === undefined) {
            data.meta.progressionTokens = 0;
          }
          if (!data.meta.upgrades) {
            data.meta.upgrades = {};
          }

// NEW:
          // Migrate: remove old meta-upgrade fields, add crest fields
          delete data.meta.progressionTokens;
          delete data.meta.upgrades;
          if (!data.meta.elementDrops) {
            data.meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
          }
          if (!data.meta.crests) {
            data.meta.crests = [];
          }
          if (!data.meta.equippedCrests) {
            data.meta.equippedCrests = { fire: null, water: null, earth: null, wood: null, metal: null };
          }
```

- [ ] **Step 3: Run syntax check**

Run: `node --check src/game/loop.js && node --check src/game/manager-registry.js && echo "OK"`
Expected: "OK"

- [ ] **Step 4: Commit**

```bash
git add src/game/loop.js src/game/manager-registry.js
git commit -m "feat: update getState + save migration for crest fields"
```

---

### Task 3d: Consolidate applyCrestBonuses into crest-service.js

The spec requires "consistent: same code path" for crest bonus application. Move the function to crest-service.js so it can be imported by both loop.js and exploration-service.js.

**Files:**
- Modify: `src/game/services/crest-service.js`
- Modify: `src/game/loop.js`
- Modify: `src/game/services/exploration-service.js`

- [ ] **Step 1: Add applyCrestBonuses to crest-service.js**

Add to the bottom of `src/game/services/crest-service.js`:

```javascript
/**
 * Apply crest progression bonuses to a creature's stats.
 * Call this at every creature creation point (run start, befriend, dealer purchase).
 * @param {object} creature - The creature to buff (mutated)
 * @param {{ hpMult: number, atkMult: number, mpMult: number, defMult: number }} mults - Crest multipliers
 */
export function applyCrestBonuses(creature, mults) {
  if (!creature || !mults) return;
  if (mults.hpMult > 1) {
    creature.maxHp = Math.floor(creature.maxHp * mults.hpMult);
    creature.hp = creature.maxHp;
  }
  if (mults.atkMult > 1) {
    creature.attack = Math.floor(creature.attack * mults.atkMult);
  }
  if (mults.mpMult > 1) {
    creature.maxMp = Math.floor(creature.maxMp * mults.mpMult);
    creature.mp = creature.maxMp;
  }
  if (mults.defMult > 1) {
    creature.defense = Math.max(1, Math.round(creature.defense * mults.defMult));
  }
}
```

- [ ] **Step 2: Update loop.js to import and use applyCrestBonuses from crest-service**

In `src/game/loop.js`:
- Update the import line to also import `applyCrestBonuses`:
  ```javascript
  import { getCrestMultipliers, applyCrestBonuses } from './services/crest-service.js';
  ```
- Remove the local `applyCrestBonuses` function definition (the one added in Task 3 Step 2)
- Update the call site in `startNewRun()`:
  ```javascript
  applyCrestBonuses(creature, crestMults);
  ```
- Update the call site in `_flushPendingCaptures()`:
  ```javascript
  applyCrestBonuses(creature, this.run.crestMults);
  ```

- [ ] **Step 3: Update exploration-service.js to use applyCrestBonuses**

In `src/game/services/exploration-service.js`:
- Add import at the top:
  ```javascript
  import { applyCrestBonuses } from './crest-service.js';
  ```
- Replace the inline bonus code (lines 843-850) with:
  ```javascript
      // Apply crest progression bonuses to purchased creature
      applyCrestBonuses(newCreature, this.gm.run.crestMults);
  ```

- [ ] **Step 4: Run syntax check**

Run: `node --check src/game/services/crest-service.js && node --check src/game/loop.js && node --check src/game/services/exploration-service.js && echo "OK"`
Expected: "OK"

- [ ] **Step 5: Commit**

```bash
git add src/game/services/crest-service.js src/game/loop.js src/game/services/exploration-service.js
git commit -m "refactor: consolidate applyCrestBonuses into crest-service for single code path"
```

---

## Chunk 2: Backend Routes + Drop Collection

### Task 4: Add element drop collection on enemy defeat

**Files:**
- Modify: `src/game/loop.js:870-893`

- [ ] **Step 1: Add element drop collection after combat victory**

In `src/game/loop.js`, in the combat victory handler (around line 870-893), after `const newCollectionAdditions = this._flushPendingCaptures();`, add element drop collection:

```javascript
      // Collect element drops from defeated enemies
      if (this.meta) {
        if (!this.meta.elementDrops) {
          this.meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
        }
        for (const enemy of this.combat.enemies || []) {
          if (enemy.hp <= 0 && enemy.element && enemy.element !== 'neutral') {
            this.meta.elementDrops[enemy.element] = (this.meta.elementDrops[enemy.element] || 0) + 1;
          }
        }
      }
```

Insert this block right after `const newCollectionAdditions = this._flushPendingCaptures();` (line 872) and before `this.combat.active = false;` (line 873).

- [ ] **Step 2: Replace progression token awards with drop collection**

Remove the boss progression token award (lines 890-892):
```javascript
// DELETE these lines:
          // Award progression token for boss defeat
          this.meta.progressionTokens = (this.meta.progressionTokens || 0) + 1;
```

Also find and remove the befriend progression token award (around line 1247):
```javascript
// DELETE:
      if (this.combat.isBoss) {
        this.meta.progressionTokens = (this.meta.progressionTokens || 0) + 1;
      }
```

(Bosses already drop element drops like any other enemy via the new collection block.)

- [ ] **Step 3: Add elementDrops to combat result for frontend animation**

In the combat victory return object (around line 896), add the collected drops so the frontend can animate them:

```javascript
        elementDropsCollected: (this.combat.enemies || [])
          .filter(e => e.hp <= 0 && e.element && e.element !== 'neutral')
          .map(e => e.element),
```

- [ ] **Step 4: Run syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: "OK"

- [ ] **Step 5: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: collect element drops from defeated enemies, remove token awards"
```

---

### Task 5: Create crest API routes

**Files:**
- Create: `src/routes/game/crests.js`
- Modify: `src/routes/game/index.js:20,106`

- [ ] **Step 1: Create the crest routes file**

```javascript
// src/routes/game/crests.js
/**
 * @fileoverview Crest meta-progression routes
 *
 * GET  /crests       — crest state (drops, inventory, equipped)
 * POST /crests/open  — open a chest (element required)
 * POST /crests/equip — equip a crest (crestId required)
 * POST /crests/unequip — unequip a slot (element required)
 */

import { Router } from 'express';
import { getCrestState, openChest, equipCrest, unequipCrest } from '../../game/services/crest-service.js';

export default function createCrestRoutes() {
  const router = Router();

  router.get('/crests', (req, res) => {
    const meta = req.gameManager.getMeta();
    res.json(getCrestState(meta));
  });

  router.post('/crests/open', (req, res) => {
    const { element } = req.body;
    if (!element) return res.status(400).json({ error: 'element required' });

    const meta = req.gameManager.getMeta();

    // Hub phase check
    if (req.gameManager.run) {
      return res.status(400).json({ error: 'Cannot open chests during a run' });
    }

    const result = openChest(meta, element);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    req.saveGame();
    res.json({ crest: result.crest, ...getCrestState(meta) });
  });

  router.post('/crests/equip', (req, res) => {
    const { crestId } = req.body;
    if (!crestId) return res.status(400).json({ error: 'crestId required' });

    const meta = req.gameManager.getMeta();
    const result = equipCrest(meta, crestId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    req.saveGame();
    res.json(getCrestState(meta));
  });

  router.post('/crests/unequip', (req, res) => {
    const { element } = req.body;
    if (!element) return res.status(400).json({ error: 'element required' });

    const meta = req.gameManager.getMeta();
    const result = unequipCrest(meta, element);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    req.saveGame();
    res.json(getCrestState(meta));
  });

  return router;
}
```

- [ ] **Step 2: Replace meta-shop routes with crest routes in index.js**

In `src/routes/game/index.js`:

Replace line 20:
```javascript
// OLD:
import createMetaShopRoutes from './meta-shop.js';
// NEW:
import createCrestRoutes from './crests.js';
```

Replace line 106:
```javascript
// OLD:
  router.use(createMetaShopRoutes());
// NEW:
  router.use(createCrestRoutes());
```

- [ ] **Step 3: Run syntax check**

Run: `node --check src/routes/game/crests.js && node --check src/routes/game/index.js && echo "OK"`
Expected: "OK"

- [ ] **Step 4: Commit**

```bash
git add src/routes/game/crests.js src/routes/game/index.js
git commit -m "feat: add crest API routes, replace meta-shop routes"
```

---

**Note:** Old meta-shop file deletion (Task 11b) is deferred to Chunk 5 — after import updates are done — to keep the server bootable throughout.

---

## Chunk 3: Frontend — Chests Screen + Animation

### Task 7: Create chests UI module

**Files:**
- Create: `public/js/ui/chests.js`

- [ ] **Step 1: Read existing UI module patterns**

Read `public/js/ui/meta-shop.js` (already deleted but you saw the pattern) and `public/js/ui/exploration.js` for the `renderButtons()` pattern. The key patterns are:
- Module exports `init(callbacks)` and `show()` functions
- Uses `getAuthHeaders()` and `apiUrl()` from callbacks
- Creates DOM elements and appends to the action area

- [ ] **Step 2: Create the chests UI module**

```javascript
// public/js/ui/chests.js
/**
 * @fileoverview Chests screen — shows 5 element chests, drop counts, and opens chests.
 */

let callbacks = {};

const ELEMENTS = ['fire', 'water', 'earth', 'wood', 'metal'];
const ELEMENT_LABELS = {
  fire: { icon: '🔥', name: 'Fire', color: 'var(--accent-red, #ef5350)' },
  water: { icon: '💧', name: 'Water', color: 'var(--accent-blue, #42a5f5)' },
  wood: { icon: '🌿', name: 'Wood', color: 'var(--accent-green, #66bb6a)' },
  earth: { icon: '🪨', name: 'Earth', color: 'var(--accent-amber, #ffb74d)' },
  metal: { icon: '⚙️', name: 'Metal', color: 'var(--accent-lavender, #b39ddb)' }
};
const CHEST_COST = 3;

export function init(cbs) {
  callbacks = cbs;
}

export async function show() {
  const { getAuthHeaders, apiUrl, onChestOpened } = callbacks;

  const panel = document.createElement('div');
  panel.id = 'chests-panel';
  panel.className = 'crests-panel';

  // Fetch current state
  let state;
  try {
    const res = await fetch(apiUrl('/api/game/crests'), { headers: getAuthHeaders() });
    state = await res.json();
  } catch (e) {
    console.error('[Chests] Failed to fetch state:', e);
    return;
  }

  panel.innerHTML = `
    <div class="crests-header">
      <button class="crests-close" id="chests-close-btn">&times;</button>
      <h2>Chests</h2>
      <div class="crests-subtitle">Open chests to find Crests</div>
    </div>
    <div class="chests-grid">
      ${ELEMENTS.map(el => renderChest(el, state.elementDrops[el] || 0)).join('')}
    </div>
  `;

  document.getElementById('action-area').appendChild(panel);

  // Close button
  document.getElementById('chests-close-btn')?.addEventListener('click', () => panel.remove());

  // Chest buttons
  panel.querySelectorAll('.chest-open-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const element = btn.dataset.element;
      try {
        const res = await fetch(apiUrl('/api/game/crests/open'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ element })
        });
        const data = await res.json();
        if (data.error) return;

        // Trigger chest animation, then refresh
        if (onChestOpened) {
          await onChestOpened(element, data.crest);
        }

        // Refresh the panel
        panel.remove();
        show();
      } catch (e) {
        console.error('[Chests] Failed to open chest:', e);
      }
    });
  });
}

function renderChest(element, drops) {
  const el = ELEMENT_LABELS[element];
  const canOpen = drops >= CHEST_COST;
  return `
    <div class="chest-card ${canOpen ? 'affordable' : ''}" style="--element-color: ${el.color}">
      <div class="chest-icon">${el.icon}</div>
      <div class="chest-name">${el.name}</div>
      <div class="chest-drops">${drops} / ${CHEST_COST}</div>
      <button class="chest-open-btn ${canOpen ? '' : 'disabled'}" data-element="${element}" ${canOpen ? '' : 'disabled'}>
        Open
      </button>
    </div>
  `;
}
```

- [ ] **Step 3: Run syntax check**

Run: `node --check public/js/ui/chests.js && echo "OK"`
Expected: "OK"

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/chests.js
git commit -m "feat: add chests screen UI module"
```

---

### Task 8: Create PixiJS chest-opening animation

**Files:**
- Create: `public/js/pixi/chest-animation.js`

- [ ] **Step 1: Read existing PixiJS patterns**

Read `public/js/pixi/battle-stage.js` lines 32-100 and `public/js/pixi/effects.js` for particle/animation patterns used in the game.

- [ ] **Step 2: Create the chest animation module**

```javascript
// public/js/pixi/chest-animation.js
/**
 * @fileoverview PixiJS gacha animation for chest opening.
 * Creates a temporary fullscreen overlay with particle effects.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';

const RARITY_COLORS = {
  common:    0xb0bec5,
  uncommon:  0x66bb6a,
  rare:      0x42a5f5,
  epic:      0xab47bc,
  legendary: 0xffd54f
};

const RARITY_DURATIONS = {
  common:    2000,
  uncommon:  2500,
  rare:      3000,
  epic:      3500,
  legendary: 4500
};

const ELEMENT_ICONS = {
  fire: '🔥', water: '💧', wood: '🌿', earth: '🪨', metal: '⚙️'
};

const STAT_LABELS = {
  attack: 'ATK', mp: 'MP', hp: 'HP', defense: 'DEF', xp: 'XP'
};

/**
 * Play the chest opening animation.
 * @param {string} element - Element of the chest
 * @param {{ rarity: string, stat: string, value: number }} crest - The crest that was generated
 * @returns {Promise<void>} Resolves when animation completes and user taps to dismiss
 */
export async function playChestAnimation(element, crest) {
  const overlay = document.createElement('div');
  overlay.id = 'chest-anim-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    z-index: 9999; background: rgba(0,0,0,0.85);
  `;
  document.body.appendChild(overlay);

  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    resizeTo: overlay,
    antialias: true
  });
  overlay.appendChild(app.canvas);

  const cx = app.screen.width / 2;
  const cy = app.screen.height / 2;
  const rarityColor = RARITY_COLORS[crest.rarity] || RARITY_COLORS.common;
  const duration = RARITY_DURATIONS[crest.rarity] || 2000;

  const container = new Container();
  app.stage.addChild(container);

  // Phase 1: Chest appears and shakes
  const chest = new Graphics();
  chest.roundRect(-40, -40, 80, 80, 12);
  chest.fill(rarityColor);
  chest.position.set(cx, cy);
  container.addChild(chest);

  // Shake animation
  let elapsed = 0;
  const shakeTime = Math.min(duration * 0.3, 1000);

  await new Promise(resolve => {
    const ticker = app.ticker.add((t) => {
      elapsed += t.deltaMS;
      const intensity = Math.min(elapsed / shakeTime, 1) * 8;
      chest.position.set(cx + (Math.random() - 0.5) * intensity, cy + (Math.random() - 0.5) * intensity);
      if (elapsed >= shakeTime) {
        app.ticker.remove(ticker);
        chest.position.set(cx, cy);
        resolve();
      }
    });
  });

  // Phase 2: Burst — particles explode outward
  chest.visible = false;
  const particles = [];
  const particleCount = crest.rarity === 'legendary' ? 60 : crest.rarity === 'epic' ? 40 : 20;

  for (let i = 0; i < particleCount; i++) {
    const p = new Graphics();
    const size = 3 + Math.random() * 5;
    p.circle(0, 0, size);
    p.fill(rarityColor);
    p.position.set(cx, cy);
    p.alpha = 1;
    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.3;
    const speed = 2 + Math.random() * 4;
    container.addChild(p);
    particles.push({ gfx: p, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1 });
  }

  // Screen flash
  const flash = new Graphics();
  flash.rect(0, 0, app.screen.width, app.screen.height);
  flash.fill(rarityColor);
  flash.alpha = 0.6;
  container.addChild(flash);

  const burstTime = duration * 0.4;
  elapsed = 0;

  await new Promise(resolve => {
    const ticker = app.ticker.add((t) => {
      elapsed += t.deltaMS;
      const progress = elapsed / burstTime;

      flash.alpha = Math.max(0, 0.6 - progress * 1.5);

      for (const p of particles) {
        p.gfx.position.x += p.vx;
        p.gfx.position.y += p.vy;
        p.life -= t.deltaMS / burstTime;
        p.gfx.alpha = Math.max(0, p.life);
      }

      if (elapsed >= burstTime) {
        app.ticker.remove(ticker);
        resolve();
      }
    });
  });

  // Phase 3: Crest card reveal
  for (const p of particles) container.removeChild(p.gfx);
  container.removeChild(flash);

  const card = new Graphics();
  card.roundRect(-70, -50, 140, 100, 16);
  card.fill(0x1a1a2e);
  card.stroke({ color: rarityColor, width: 3 });
  card.position.set(cx, cy);
  card.scale.set(0);
  container.addChild(card);

  const valuePercent = Math.round(crest.value * 100);
  const label = new Text({
    text: `${ELEMENT_ICONS[element]}\n${STAT_LABELS[crest.stat]} +${valuePercent}%`,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 22,
      fill: rarityColor,
      align: 'center',
      lineHeight: 32
    }
  });
  label.anchor.set(0.5);
  label.position.set(cx, cy);
  label.alpha = 0;
  container.addChild(label);

  const rarityLabel = new Text({
    text: crest.rarity.toUpperCase(),
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 14,
      fill: rarityColor,
      align: 'center',
      fontWeight: 'bold'
    }
  });
  rarityLabel.anchor.set(0.5);
  rarityLabel.position.set(cx, cy + 55);
  rarityLabel.alpha = 0;
  container.addChild(rarityLabel);

  // Scale up card
  elapsed = 0;
  const revealTime = 400;
  await new Promise(resolve => {
    const ticker = app.ticker.add((t) => {
      elapsed += t.deltaMS;
      const progress = Math.min(elapsed / revealTime, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      card.scale.set(ease);
      label.alpha = ease;
      rarityLabel.alpha = ease;
      if (progress >= 1) {
        app.ticker.remove(ticker);
        resolve();
      }
    });
  });

  // Phase 4: Wait for tap to dismiss
  await new Promise(resolve => {
    overlay.addEventListener('click', resolve, { once: true });
    overlay.addEventListener('touchend', resolve, { once: true });
  });

  // Cleanup
  app.destroy(true);
  overlay.remove();
}
```

- [ ] **Step 3: Verify file loads**

Note: `node --check` won't work on browser modules importing from `pixi.js`. Verify manually during integration test (Task 12).

- [ ] **Step 4: Commit**

```bash
git add public/js/pixi/chest-animation.js
git commit -m "feat: add PixiJS gacha chest-opening animation"
```

---

## Chunk 4: Frontend — Crests Equip Screen

### Task 9: Create crests equip UI module

**Files:**
- Create: `public/js/ui/crests-equip.js`

- [ ] **Step 1: Create the equip screen module**

```javascript
// public/js/ui/crests-equip.js
/**
 * @fileoverview Crests equip screen — 5 element slots + inventory grid.
 */

let callbacks = {};

const ELEMENTS = ['fire', 'water', 'earth', 'wood', 'metal'];
const ELEMENT_LABELS = {
  fire: { icon: '🔥', name: 'Fire' },
  water: { icon: '💧', name: 'Water' },
  wood: { icon: '🌿', name: 'Wood' },
  earth: { icon: '🪨', name: 'Earth' },
  metal: { icon: '⚙️', name: 'Metal' }
};
const STAT_LABELS = {
  attack: 'ATK', mp: 'MP', hp: 'HP', defense: 'DEF', xp: 'XP'
};
const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };

export function init(cbs) {
  callbacks = cbs;
}

export async function show() {
  const { getAuthHeaders, apiUrl } = callbacks;

  let state;
  try {
    const res = await fetch(apiUrl('/api/game/crests'), { headers: getAuthHeaders() });
    state = await res.json();
  } catch (e) {
    console.error('[Crests] Failed to fetch state:', e);
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'crests-equip-panel';
  panel.className = 'crests-panel';

  render(panel, state);
  document.getElementById('action-area').appendChild(panel);
  wireEvents(panel, state);
}

function render(panel, state) {
  const { crests, equippedCrests } = state;

  panel.innerHTML = `
    <div class="crests-header">
      <button class="crests-close" id="crests-close-btn">&times;</button>
      <h2>Crests</h2>
    </div>
    <div class="crests-slots">
      ${ELEMENTS.map(el => {
        const crestId = equippedCrests[el];
        const crest = crestId ? crests.find(c => c.id === crestId) : null;
        return renderSlot(el, crest);
      }).join('')}
    </div>
    <div class="crests-filter-tabs">
      <button class="crests-tab active" data-filter="all">All</button>
      ${ELEMENTS.map(el => `<button class="crests-tab" data-filter="${el}">${ELEMENT_LABELS[el].icon}</button>`).join('')}
    </div>
    <div class="crests-inventory">
      ${renderInventory(crests, equippedCrests, 'all')}
    </div>
  `;
}

function renderSlot(element, crest) {
  const el = ELEMENT_LABELS[element];
  if (crest) {
    const pct = Math.round(crest.value * 100);
    return `
      <div class="crest-slot filled rarity-${crest.rarity}" data-element="${element}" data-crest-id="${crest.id}">
        <div class="crest-slot-icon">${el.icon}</div>
        <div class="crest-slot-value">${STAT_LABELS[crest.stat]} +${pct}%</div>
      </div>
    `;
  }
  return `
    <div class="crest-slot empty" data-element="${element}">
      <div class="crest-slot-icon">${el.icon}</div>
      <div class="crest-slot-plus">+</div>
    </div>
  `;
}

function renderInventory(crests, equippedCrests, filter) {
  const equippedIds = new Set(Object.values(equippedCrests).filter(Boolean));
  let filtered = crests;
  if (filter !== 'all') {
    filtered = crests.filter(c => c.element === filter);
  }

  // Sort: rarity (best first), then value descending
  filtered.sort((a, b) => {
    const rd = (RARITY_ORDER[a.rarity] || 4) - (RARITY_ORDER[b.rarity] || 4);
    if (rd !== 0) return rd;
    return b.value - a.value;
  });

  if (filtered.length === 0) {
    return '<div class="crests-empty">No crests yet. Open chests to find some!</div>';
  }

  return filtered.map(c => {
    const pct = Math.round(c.value * 100);
    const equipped = equippedIds.has(c.id);
    const isWeaker = !equipped && isWeakerThanEquipped(c, crests, equippedCrests);
    return `
      <div class="crest-tile rarity-${c.rarity} ${equipped ? 'equipped' : ''} ${isWeaker ? 'weaker' : ''}" data-crest-id="${c.id}">
        <div class="crest-tile-icon">${ELEMENT_LABELS[c.element].icon}</div>
        <div class="crest-tile-value">+${pct}%</div>
      </div>
    `;
  }).join('');
}

function isWeakerThanEquipped(crest, allCrests, equippedCrests) {
  const equippedId = equippedCrests[crest.element];
  if (!equippedId) return false;
  const equipped = allCrests.find(c => c.id === equippedId);
  if (!equipped) return false;
  return crest.value < equipped.value;
}

function wireEvents(panel, state) {
  const { getAuthHeaders, apiUrl } = callbacks;

  // Close
  panel.querySelector('#crests-close-btn')?.addEventListener('click', () => panel.remove());

  // Filter tabs
  panel.querySelectorAll('.crests-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.crests-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const inv = panel.querySelector('.crests-inventory');
      if (inv) inv.innerHTML = renderInventory(state.crests, state.equippedCrests, tab.dataset.filter);
      // Re-wire inventory click events
      wireInventoryClicks(panel, state);
    });
  });

  // Slot clicks (unequip)
  panel.querySelectorAll('.crest-slot.filled').forEach(slot => {
    slot.addEventListener('click', async () => {
      const element = slot.dataset.element;
      try {
        const res = await fetch(apiUrl('/api/game/crests/unequip'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ element })
        });
        const data = await res.json();
        if (!data.error) {
          Object.assign(state, data);
          render(panel, state);
          wireEvents(panel, state);
        }
      } catch (e) { console.error('[Crests] Unequip failed:', e); }
    });
  });

  // Slot clicks (empty — filter to that element)
  panel.querySelectorAll('.crest-slot.empty').forEach(slot => {
    slot.addEventListener('click', () => {
      const element = slot.dataset.element;
      panel.querySelectorAll('.crests-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.filter === element);
      });
      const inv = panel.querySelector('.crests-inventory');
      if (inv) inv.innerHTML = renderInventory(state.crests, state.equippedCrests, element);
      wireInventoryClicks(panel, state);
    });
  });

  wireInventoryClicks(panel, state);
}

function wireInventoryClicks(panel, state) {
  const { getAuthHeaders, apiUrl } = callbacks;

  panel.querySelectorAll('.crest-tile:not(.equipped)').forEach(tile => {
    tile.addEventListener('click', async () => {
      const crestId = tile.dataset.crestId;
      const crest = state.crests.find(c => c.id === crestId);
      if (!crest) return;

      // Show preview with comparison
      const equippedId = state.equippedCrests[crest.element];
      const equipped = equippedId ? state.crests.find(c => c.id === equippedId) : null;
      const confirmed = await showEquipPreview(crest, equipped);
      if (!confirmed) return;

      try {
        const res = await fetch(apiUrl('/api/game/crests/equip'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ crestId })
        });
        const data = await res.json();
        if (!data.error) {
          Object.assign(state, data);
          render(panel, state);
          wireEvents(panel, state);
        }
      } catch (e) { console.error('[Crests] Equip failed:', e); }
    });
  });
}

function showEquipPreview(crest, equipped) {
  return new Promise(resolve => {
    const newPct = Math.round(crest.value * 100);
    const curPct = equipped ? Math.round(equipped.value * 100) : 0;
    const diff = newPct - curPct;
    const diffStr = diff > 0 ? `+${diff}%` : `${diff}%`;

    const overlay = document.createElement('div');
    overlay.className = 'crest-preview-overlay';
    overlay.innerHTML = `
      <div class="crest-preview-card">
        <div class="crest-preview-title">${ELEMENT_LABELS[crest.element].icon} ${STAT_LABELS[crest.stat]} +${newPct}%</div>
        ${equipped ? `<div class="crest-preview-compare">Current: +${curPct}% → ${diffStr}</div>` : ''}
        <div class="crest-preview-rarity rarity-${crest.rarity}">${crest.rarity.toUpperCase()}</div>
        <div class="crest-preview-actions">
          <button class="crest-preview-cancel">Cancel</button>
          <button class="crest-preview-confirm">Equip</button>
        </div>
      </div>
    `;

    overlay.querySelector('.crest-preview-cancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.querySelector('.crest-preview-confirm').addEventListener('click', () => { overlay.remove(); resolve(true); });
    document.getElementById('action-area').appendChild(overlay);
  });
}
```

- [ ] **Step 2: Run syntax check**

Run: `node --check public/js/ui/crests-equip.js && echo "OK"`
Expected: "OK"

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/crests-equip.js
git commit -m "feat: add crests equip screen UI module"
```

---

## Chunk 5: Hub Integration, Wiring, CSS, and Cleanup

### Task 10: Wire new modules into game.js and hub

**Files:**
- Modify: `public/game.js:107,1789`
- Modify: `public/js/ui/exploration.js:31,338,354`

- [ ] **Step 1: Update imports in game.js**

In `public/game.js`, replace the meta-shop import (line 107):
```javascript
// OLD:
import * as metaShop from './js/ui/meta-shop.js';
// NEW:
import * as chestsUI from './js/ui/chests.js';
import * as crestsEquipUI from './js/ui/crests-equip.js';
import { playChestAnimation } from './js/pixi/chest-animation.js';
```

- [ ] **Step 2: Update module initialization in game.js**

Replace the `metaShop.init()` block (around line 1789):
```javascript
// OLD:
  metaShop.init({
    getGameState: () => gameState,
    ...
  });

// NEW:
  chestsUI.init({
    getAuthHeaders,
    apiUrl,
    onChestOpened: async (element, crest) => {
      await playChestAnimation(element, crest);
    }
  });

  crestsEquipUI.init({
    getAuthHeaders,
    apiUrl
  });
```

- [ ] **Step 3: Update hub buttons in exploration.js**

In `public/js/ui/exploration.js`, replace the meta-shop import (line 31):
```javascript
// OLD:
import * as metaShop from './meta-shop.js';
// NEW:
import * as chestsUI from './chests.js';
import * as crestsEquipUI from './crests-equip.js';
```

Replace the hub buttons (lines 337-361). Remove the tokens reference (line 338) and replace the upgrade button (line 354):
```javascript
// OLD:
  const tokens = gameState.meta?.progressionTokens || 0;
  ...
    { label: `⬆️ 強化${tokens > 0 ? ` (${tokens})` : ''}`, onClick: () => metaShop.show() },

// NEW (remove tokens line, replace button):
    { label: '🎁 Chests', onClick: () => chestsUI.show() },
    { label: '🔮 Crests', onClick: () => crestsEquipUI.show() },
```

The full new `renderHub()` should be:
```javascript
export async function renderHub() {
  const gameState = getGameState();

  const pvpTeams = gameState.meta?.pvpTeams || [null, null, null];
  const hasPvpTeams = pvpTeams.some(t => t !== null);

  const dueCount = apiGetVocabDueCount ? (await apiGetVocabDueCount().catch(() => ({ count: 0 }))).count : 0;

  renderButtons([
    { label: `📚 速習${dueCount > 0 ? ` (${dueCount})` : ''}`, onClick: async () => {
      const result = await apiGetDueWords();
      if (result?.words?.length > 0) {
        speedReview.start(result.words);
      } else {
        sceneModule.showNarration('復習する言葉がありません', { autoDismiss: 2000 });
      }
    }},
    { label: '🎁 Chests', onClick: () => chestsUI.show() },
    { label: '🔮 Crests', onClick: () => crestsEquipUI.show() },
    { label: '⚔️ Multiplayer Battle', onClick: () => {
      const gs = getGameState();
      gs.phase = 'pvp_lobby';
      updateUI();
    }, disabled: !hasPvpTeams },
    { label: '⚡ 潜入', onClick: () => startNewRun(), primary: true },
  ]);
}
```

- [ ] **Step 4: Run syntax check on both files**

Run: `node --check public/js/ui/exploration.js && node --check public/game.js && echo "OK"`
Expected: "OK"

- [ ] **Step 5: Commit**

```bash
git add public/game.js public/js/ui/exploration.js
git commit -m "feat: wire chests + crests screens into hub, remove meta-shop references"
```

---

### Task 11: Add CSS for chests and crests screens

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Remove old `.meta-shop-*` CSS**

In `public/game.css`, delete the entire meta-shop CSS block (lines ~4693-4826, all `.meta-shop-*` rules).

- [ ] **Step 2: Add new crest/chest CSS**

Append to `public/game.css`:

```css
/* ── Crests Panel (shared between chests + equip) ── */
.crests-panel {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-primary, #e8edf3);
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 16px;
  padding-top: env(safe-area-inset-top, 16px);
}

.crests-header {
  text-align: center;
  margin-bottom: 16px;
  position: relative;
}

.crests-header h2 {
  margin: 0;
  font-size: 1.3rem;
  color: var(--text-primary);
}

.crests-subtitle {
  color: var(--text-secondary);
  font-size: 0.85rem;
  margin-top: 4px;
}

.crests-close {
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0; right: 0;
  width: 36px; height: 36px;
  border: none;
  background: var(--bg-secondary);
  border-radius: 50%;
  font-size: 1.2rem;
  color: var(--text-secondary);
  cursor: pointer;
}

/* ── Chests Grid ── */
.chests-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.chest-card {
  background: var(--bg-elevated);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-soft);
  padding: 12px 8px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border: 2px solid transparent;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.chest-card.affordable {
  border-color: var(--element-color);
  box-shadow: 0 0 12px color-mix(in srgb, var(--element-color) 30%, transparent);
  animation: chest-pulse 2s ease-in-out infinite;
}

@keyframes chest-pulse {
  0%, 100% { box-shadow: 0 0 8px color-mix(in srgb, var(--element-color) 20%, transparent); }
  50% { box-shadow: 0 0 16px color-mix(in srgb, var(--element-color) 40%, transparent); }
}

.chest-icon { font-size: 1.8rem; }
.chest-name { font-size: 0.75rem; color: var(--text-secondary); }
.chest-drops { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }

.chest-open-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-pill);
  padding: 6px 14px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.chest-open-btn.disabled {
  opacity: 0.35;
  cursor: default;
}

/* ── Crest Equip Slots ── */
.crests-slots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
}

.crest-slot {
  width: 56px;
  height: 56px;
  border-radius: var(--card-radius);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.3s;
}

.crest-slot.empty { opacity: 0.5; }
.crest-slot.empty .crest-slot-plus { color: var(--text-muted); font-size: 1.2rem; }
.crest-slot-icon { font-size: 1.2rem; }
.crest-slot-value { font-size: 0.6rem; font-weight: 600; color: var(--text-primary); }

.crest-slot.filled {
  animation: slot-breathe 3s ease-in-out infinite;
}

.crest-slot.rarity-common    { border-color: var(--rarity-common); }
.crest-slot.rarity-uncommon  { border-color: var(--rarity-uncommon); }
.crest-slot.rarity-rare      { border-color: var(--rarity-rare); }
.crest-slot.rarity-epic      { border-color: var(--rarity-epic); }
.crest-slot.rarity-legendary { border-color: var(--rarity-legendary); }

@keyframes slot-breathe {
  0%, 100% { box-shadow: var(--shadow-soft); }
  50% { box-shadow: 0 0 12px rgba(0,0,0,0.12); }
}

/* ── Filter Tabs ── */
.crests-filter-tabs {
  display: flex;
  justify-content: center;
  gap: 4px;
  margin-bottom: 12px;
}

.crests-tab {
  background: var(--bg-secondary);
  border: none;
  border-radius: var(--radius-pill);
  padding: 6px 12px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  cursor: pointer;
}

.crests-tab.active {
  background: var(--accent);
  color: #fff;
}

/* ── Crest Inventory Grid ── */
.crests-inventory {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
}

.crests-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 24px;
  font-size: 0.9rem;
  grid-column: 1 / -1;
}

.crest-tile {
  background: var(--bg-elevated);
  border-radius: var(--card-radius);
  padding: 10px 6px;
  text-align: center;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.15s;
}

.crest-tile:active { transform: scale(0.95); }

.crest-tile.rarity-common    { border-color: var(--rarity-common); }
.crest-tile.rarity-uncommon  { border-color: var(--rarity-uncommon); }
.crest-tile.rarity-rare      { border-color: var(--rarity-rare); }
.crest-tile.rarity-epic      { border-color: var(--rarity-epic); }
.crest-tile.rarity-legendary { border-color: var(--rarity-legendary); }

.crest-tile.equipped { opacity: 0.4; pointer-events: none; }
.crest-tile.weaker   { opacity: 0.5; }

.crest-tile-icon { font-size: 1.4rem; }
.crest-tile-value { font-size: 0.75rem; font-weight: 600; color: var(--text-primary); margin-top: 4px; }

/* ── Crest Equip Preview ── */
.crest-preview-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.crest-preview-card {
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  padding: 24px;
  text-align: center;
  box-shadow: var(--shadow-elevated);
  min-width: 200px;
}

.crest-preview-title { font-size: 1.2rem; font-weight: 600; margin-bottom: 8px; }
.crest-preview-compare { color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 8px; }
.crest-preview-rarity { font-size: 0.75rem; font-weight: 700; margin-bottom: 16px; }

.crest-preview-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.crest-preview-cancel {
  background: var(--bg-secondary);
  border: none;
  border-radius: var(--radius-pill);
  padding: 8px 20px;
  color: var(--text-secondary);
  cursor: pointer;
}

.crest-preview-confirm {
  background: var(--accent);
  border: none;
  border-radius: var(--radius-pill);
  padding: 8px 20px;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Step 3: Run syntax check on CSS (just verify file is parseable)**

Visual verification will come later during playtesting.

- [ ] **Step 4: Commit**

```bash
git add public/game.css
git commit -m "feat: add chests + crests CSS, remove old meta-shop styles"
```

---

### Task 11b: Delete old meta-upgrade files

Now that all imports have been updated, it's safe to delete the old files.

**Files:**
- Delete: `data/meta-upgrades.json`
- Delete: `src/game/services/meta-shop-service.js`
- Delete: `src/routes/game/meta-shop.js`
- Delete: `public/js/ui/meta-shop.js`
- Delete: `tests/unit/game/meta-shop-service.test.js`

- [ ] **Step 1: Remove all old meta-shop files**

```bash
git rm data/meta-upgrades.json
git rm src/game/services/meta-shop-service.js
git rm src/routes/game/meta-shop.js
git rm public/js/ui/meta-shop.js
git rm tests/unit/game/meta-shop-service.test.js
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All remaining tests PASS

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove old meta-upgrade system (shop service, routes, UI, tests, data)"
```

---

### Task 12: Final integration test — run full test suite and syntax check all modified files

**Files:** All modified files

- [ ] **Step 1: Run syntax checks on all JS files**

```bash
node --check src/game/services/crest-service.js && \
node --check src/routes/game/crests.js && \
node --check src/routes/game/index.js && \
node --check src/game/loop.js && \
node --check src/game/state.js && \
node --check src/game/services/exploration-service.js && \
node --check public/js/ui/chests.js && \
node --check public/js/ui/crests-equip.js && \
node --check public/js/pixi/chest-animation.js && \
node --check public/js/ui/exploration.js && \
node --check public/game.js && \
echo "ALL OK"
```

Expected: "ALL OK"

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests PASS. The old meta-shop tests are gone, replaced by crest-service tests.

- [ ] **Step 3: Start dev server and verify no startup errors**

Run: `npm run dev`
Expected: Server starts on port 3000 without errors. Check console for import errors.

- [ ] **Step 4: Commit any remaining fixes, then final commit**

```bash
git add -A
git commit -m "feat: crests meta-progression system — complete implementation"
```

---

## Summary

| Chunk | Tasks | Description |
|-------|-------|-------------|
| **1** | 1, 2, 3, 3b, 3c, 3d | Backend core: crest service, state, bonus system, level-up, migration |
| **2** | 4, 5 | Routes + element drop collection |
| **3** | 7, 8 | Frontend chests screen + PixiJS animation |
| **4** | 9 | Frontend crests equip screen |
| **5** | 10, 11, 11b, 12 | Hub wiring, CSS, old file cleanup, final integration |

**Total new files:** 6
**Total modified files:** 9 (loop.js, state.js, creatures.js, exploration-service.js, manager-registry.js, routes/index.js, exploration.js, game.js, game.css)
**Total deleted files:** 5

## Known Limitations (v1)

- **PvP teams are snapshots:** Saved PvP teams bake in crest bonuses at save time. If a player upgrades crests after saving a team, the saved team won't reflect the change. Players must re-save teams to get updated bonuses. This matches the old meta-upgrade behavior and can be improved in v2 by re-applying crests at match start.
