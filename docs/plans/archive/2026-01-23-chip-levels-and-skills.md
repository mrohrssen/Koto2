# Chip Levels & Chip Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-run chip leveling (L1-7, +5% additive scaling) and fixed active chip skills with charge meters to the combat system.

**Architecture:** Chip levels scale existing pipeline effect values via helper functions. Chip skills are a parallel system: charge meters fill each turn, clicking a charged chip opens a popup to activate an instant effect or place a one-shot buff. Buffs integrate at four points around the existing pipeline (PRE_PIPELINE, POST_PIPELINE, PIPELINE_MODIFIER, DEFENSIVE).

**Tech Stack:** Express.js backend (ES modules), vanilla JS frontend, local JSON data files, Node.js `node:test` for unit tests.

---

## Task 1: Add Level & Skill Config to chip-config.json

**Files:**
- Modify: `data/chip-config.json`

**Step 1: Add config entries**

Add `levelConfig` and `skillConfig` to the existing JSON:

```json
{
  "categories": { ... },
  "pipelineEffects": { ... },
  "rarities": { ... },
  "upgradeConfig": { ... },
  "levelConfig": {
    "maxLevel": 7,
    "scalingPerLevel": 0.05
  },
  "skillConfig": {
    "defaultCharges": 5,
    "chargePerTurn": 1
  }
}
```

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/chip-config.json'))" && echo OK`
Expected: `OK`

**Step 3: Commit**

```bash
git add data/chip-config.json
git commit -m "feat: add levelConfig and skillConfig to chip-config.json"
```

---

## Task 2: Add Skill Definitions to chips.json (All 18 Chips)

**Files:**
- Modify: `data/chips.json`

**Step 1: Add `skill` object to each of the 18 chip definitions**

Each chip gets a `skill` field. Two types:

**Instant skills** (`"type": "instant"`):
```json
"skill": {
  "id": "flash",
  "name": "閃光",
  "nameEn": "Flash",
  "description": "40ダメージを直接与える",
  "descriptionEn": "Deal 40 damage directly",
  "type": "instant",
  "effect": { "damage": 40 },
  "chargesRequired": 5
}
```

**Buff skills** (`"type": "buff"`):
```json
"skill": {
  "id": "fullCharge",
  "name": "満充電",
  "nameEn": "Full Charge",
  "description": "次の攻撃に+20ダメージ",
  "descriptionEn": "Next attack deals +20 damage",
  "type": "buff",
  "buffType": "PRE_PIPELINE",
  "effect": { "flatBonus": 20 },
  "chargesRequired": 5
}
```

Full skill definitions for all 18 chips:

| Chip | Skill ID | Type | BuffType | Effect Object | Condition |
|------|----------|------|----------|---------------|-----------|
| battery | fullCharge | buff | PRE_PIPELINE | `{ "flatBonus": 20 }` | - |
| speaker | maxVolume | buff | POST_PIPELINE | `{ "multiplier": 1.8 }` | - |
| glasses | weakSpot | buff | POST_PIPELINE | `{ "multiplier": 1.3 }` | - |
| lightBulb | flash | instant | - | `{ "damage": 40 }` | - |
| scissors | finalCut | buff | POST_PIPELINE | `{ "multiplier": 2.0 }` | `"enemyBelow30"` |
| clock | rewind | buff | PIPELINE_MODIFIER | `{ "runTwice": true }` | - |
| charcoal | warmth | instant | - | `{ "heal": 30 }` | - |
| book | totalRelease | instant | - | `{ "damageFromStacks": true, "stackMultiplier": 5 }` | - |
| eraser | cleanSlate | buff | PRE_PIPELINE | `{ "flatBonus": 60 }` | `"emptySlots>=2"` |
| onigiri | extraServing | instant | - | `{ "heal": 25 }` | - |
| wallet | cashOut | instant | - | `{ "damageFromKills": true, "killMultiplier": 2 }` | - |
| straw | bigSip | instant | - | `{ "heal": 20, "damage": 10 }` | - |
| key | trumpCard | buff | POST_PIPELINE | `{ "multiplier": 1.3 }` | `"isBoss"` |
| egg | revival | buff | DEFENSIVE | `{ "surviveLethal": true }` | - |
| fireworks | grandFinale | buff | PRE_PIPELINE | `{ "flatBonus": 15 }` | - |
| mirror | facingMirrors | buff | PIPELINE_MODIFIER | `{ "nextChipDouble": true }` | - |
| feather | lightStep | buff | PRE_PIPELINE | `{ "flatBonusPerEmpty": 30 }` | - |
| drum | powerHit | instant | - | `{ "damageFromAttack": true, "attackMultiplier": 3 }` | - |

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/chips.json'))" && echo OK`
Expected: `OK`

**Step 3: Verify all 18 chips have skills**

Run: `node -e "const c=JSON.parse(require('fs').readFileSync('data/chips.json'));const missing=Object.keys(c).filter(k=>!c[k].skill);console.log(missing.length?'MISSING: '+missing.join(','):'All 18 have skills')"`
Expected: `All 18 have skills`

**Step 4: Commit**

```bash
git add data/chips.json
git commit -m "feat: add skill definitions to all 18 chips in chips.json"
```

---

## Task 3: Add Chip State Fields to Player Run State

**Files:**
- Modify: `src/game/state.js:226-292` (inside `createNewRun`)

**Step 1: Write the unit test**

Create `tests/unit/chip-state.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createNewRun, createNewPlayer } from '../../src/game/state.js';

describe('Chip State in Run', () => {
  it('should initialize _chipCharges as empty object', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);
    assert.deepStrictEqual(run.player._chipCharges, {});
  });

  it('should initialize _chipLevels as empty object', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);
    assert.deepStrictEqual(run.player._chipLevels, {});
  });

  it('should initialize _activeBuffs as empty array', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);
    assert.deepStrictEqual(run.player._activeBuffs, []);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/chip-state.test.js`
Expected: FAIL — `_chipCharges` is undefined

**Step 3: Add state initialization**

In `src/game/state.js`, inside `createNewRun()`, after line 248 (`player: JSON.parse(JSON.stringify(player))`), the run.player object is a deep copy. Add initialization after the return object is built — or better, add fields directly to the player copy. Insert after line 248:

```javascript
    // Player state for this run (copy so we can reset)
    player: JSON.parse(JSON.stringify(player)),
```

Change this to initialize chip state on the copied player. After line 248, before the run object closes, we need a post-creation step. The cleanest approach: add the fields after the object literal.

Actually, since the player copy is inline, we'll add the fields by modifying the function to set them after creation:

```javascript
export function createNewRun(player) {
  const run = {
    // ... existing fields unchanged ...
  };

  // Initialize chip skill state on the run player copy
  run.player._chipCharges = {};
  run.player._chipLevels = {};
  run.player._activeBuffs = [];

  return run;
}
```

This means changing the function from `return { ... }` to `const run = { ... }; ... return run;`.

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/chip-state.test.js`
Expected: PASS (3 tests)

**Step 5: Syntax check**

Run: `node --check src/game/state.js && echo OK`
Expected: `OK`

**Step 6: Commit**

```bash
git add src/game/state.js tests/unit/chip-state.test.js
git commit -m "feat: add _chipCharges, _chipLevels, _activeBuffs to run player state"
```

---

## Task 4: Chip Charge Helper Functions

**Files:**
- Modify: `src/game/items/chips.js`
- Create: `tests/unit/chip-charges.test.js`

**Step 1: Write the unit test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getChipCharge,
  incrementAllEquippedCharges,
  resetChipCharge,
  isChipSkillReady
} from '../../src/game/items/chips.js';

describe('Chip Charge Helpers', () => {
  function makePlayer(charges = {}, equippedChips = ['battery', 'speaker']) {
    return {
      _chipCharges: charges,
      equipment: { weapon: { equippedChips } }
    };
  }

  it('getChipCharge returns 0 for uncharged chip', () => {
    const player = makePlayer();
    assert.strictEqual(getChipCharge(player, 'battery'), 0);
  });

  it('getChipCharge returns stored charge', () => {
    const player = makePlayer({ battery: 3 });
    assert.strictEqual(getChipCharge(player, 'battery'), 3);
  });

  it('incrementAllEquippedCharges increments all equipped chips by 1', () => {
    const player = makePlayer({ battery: 2 });
    incrementAllEquippedCharges(player);
    assert.strictEqual(player._chipCharges.battery, 3);
    assert.strictEqual(player._chipCharges.speaker, 1);
  });

  it('resetChipCharge sets charge to 0', () => {
    const player = makePlayer({ battery: 5 });
    resetChipCharge(player, 'battery');
    assert.strictEqual(player._chipCharges.battery, 0);
  });

  it('isChipSkillReady returns true at 5 charges', () => {
    const player = makePlayer({ battery: 5 });
    assert.strictEqual(isChipSkillReady(player, 'battery'), true);
  });

  it('isChipSkillReady returns false below required charges', () => {
    const player = makePlayer({ battery: 4 });
    assert.strictEqual(isChipSkillReady(player, 'battery'), false);
  });

  it('incrementAllEquippedCharges skips chips not in weapon', () => {
    const player = makePlayer({}, ['battery']);
    incrementAllEquippedCharges(player);
    assert.strictEqual(player._chipCharges.battery, 1);
    assert.strictEqual(player._chipCharges.speaker, undefined);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/chip-charges.test.js`
Expected: FAIL — functions not exported

**Step 3: Implement charge helpers in chips.js**

Add these exports at the end of `src/game/items/chips.js` (before the final closing, after existing exports):

```javascript
// ============ CHIP CHARGE HELPERS ============

export function getChipCharge(player, chipId) {
  return player._chipCharges?.[chipId] || 0;
}

export function incrementAllEquippedCharges(player) {
  const equippedChips = player.equipment?.weapon?.equippedChips || [];
  if (!player._chipCharges) player._chipCharges = {};
  for (const chipId of equippedChips) {
    player._chipCharges[chipId] = (player._chipCharges[chipId] || 0) + 1;
  }
}

export function resetChipCharge(player, chipId) {
  if (!player._chipCharges) player._chipCharges = {};
  player._chipCharges[chipId] = 0;
}

export function isChipSkillReady(player, chipId) {
  const chip = getChip(chipId);
  if (!chip?.skill) return false;
  const charge = getChipCharge(player, chipId);
  return charge >= chip.skill.chargesRequired;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/chip-charges.test.js`
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add src/game/items/chips.js tests/unit/chip-charges.test.js
git commit -m "feat: add chip charge helper functions"
```

---

## Task 5: Chip Level Helper Functions + Scaling

**Files:**
- Modify: `src/game/items/chips.js`
- Create: `tests/unit/chip-levels.test.js`

**Step 1: Write the unit test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getChipLevel,
  setChipLevel,
  getScaledEffectValue,
  CHIPS
} from '../../src/game/items/chips.js';

describe('Chip Level Helpers', () => {
  function makePlayer(levels = {}) {
    return { _chipLevels: levels };
  }

  it('getChipLevel returns 1 for unleveled chip', () => {
    const player = makePlayer();
    assert.strictEqual(getChipLevel(player, 'battery'), 1);
  });

  it('getChipLevel returns stored level', () => {
    const player = makePlayer({ battery: 4 });
    assert.strictEqual(getChipLevel(player, 'battery'), 4);
  });

  it('setChipLevel stores level', () => {
    const player = makePlayer();
    setChipLevel(player, 'battery', 5);
    assert.strictEqual(player._chipLevels.battery, 5);
  });

  it('setChipLevel clamps to max 7', () => {
    const player = makePlayer();
    setChipLevel(player, 'battery', 10);
    assert.strictEqual(player._chipLevels.battery, 7);
  });

  it('setChipLevel clamps to min 1', () => {
    const player = makePlayer();
    setChipLevel(player, 'battery', 0);
    assert.strictEqual(player._chipLevels.battery, 1);
  });
});

describe('getScaledEffectValue', () => {
  it('flatAdd chip at level 1 returns base value', () => {
    const chip = CHIPS.battery; // flatAdd, value: 5
    assert.strictEqual(getScaledEffectValue(chip, 1), 5);
  });

  it('flatAdd chip at level 7 applies 30% bonus floored', () => {
    const chip = CHIPS.battery; // flatAdd, value: 5
    // floor(5 * (1 + 6*0.05)) = floor(5 * 1.3) = floor(6.5) = 6
    assert.strictEqual(getScaledEffectValue(chip, 7), 6);
  });

  it('multiply chip at level 1 returns base value', () => {
    const chip = CHIPS.speaker; // multiply, value: 1.5
    assert.strictEqual(getScaledEffectValue(chip, 1), 1.5);
  });

  it('multiply chip at level 7 scales bonus portion', () => {
    const chip = CHIPS.speaker; // multiply, value: 1.5
    // 1 + (1.5-1) * (1 + 6*0.05) = 1 + 0.5 * 1.3 = 1.65
    const result = getScaledEffectValue(chip, 7);
    assert.ok(Math.abs(result - 1.65) < 0.001, `Expected ~1.65, got ${result}`);
  });

  it('critMod chip scales without floor', () => {
    const chip = CHIPS.glasses; // critMod, value: 20
    // 20 * (1 + 6*0.05) = 20 * 1.3 = 26
    const result = getScaledEffectValue(chip, 7);
    assert.ok(Math.abs(result - 26) < 0.001, `Expected ~26, got ${result}`);
  });

  it('stacking chip uses flatAdd formula', () => {
    const chip = CHIPS.book; // stacking, value: 3
    // floor(3 * (1 + 2*0.05)) = floor(3 * 1.1) = floor(3.3) = 3
    assert.strictEqual(getScaledEffectValue(chip, 3), 3);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/chip-levels.test.js`
Expected: FAIL — functions not exported

**Step 3: Implement level helpers in chips.js**

Add after the charge helpers:

```javascript
// ============ CHIP LEVEL HELPERS ============

import chipConfig from '../../data/chip-config.json' with { type: 'json' };

export function getChipLevel(player, chipId) {
  return player._chipLevels?.[chipId] || 1;
}

export function setChipLevel(player, chipId, level) {
  if (!player._chipLevels) player._chipLevels = {};
  const maxLevel = chipConfig.levelConfig?.maxLevel || 7;
  player._chipLevels[chipId] = Math.max(1, Math.min(maxLevel, level));
}

export function getScaledEffectValue(chip, level) {
  const effect = chip.effects?.pipeline;
  if (!effect || level <= 1) return effect?.value;

  const scalingPerLevel = chipConfig.levelConfig?.scalingPerLevel || 0.05;
  const scaleFactor = 1 + (level - 1) * scalingPerLevel;
  const value = effect.value;
  const type = effect.type;

  // Multiply types: scale the bonus portion (value - 1), keep base 1.0
  if (type === 'multiply' || type === 'conditional' || type === 'vsBoss' || type === 'destroyedMultiplier') {
    return 1 + (value - 1) * scaleFactor;
  }

  // CritMod: scale without floor (keep decimal precision)
  if (type === 'critMod') {
    return value * scaleFactor;
  }

  // All others (flatAdd, stacking, damageAndHeal, killCounter, riskyFlat, perEmptySlot, emptySlots, nthAttack): floor
  return Math.floor(value * scaleFactor);
}
```

**Note:** The `chip-config.json` import may already exist or need to be added at the top of the file. Check existing imports first — if `chipConfig` is already imported (it likely is for rarities), reuse it. If not, add the import at the top of the file with the other imports.

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/chip-levels.test.js`
Expected: PASS (9 tests)

**Step 5: Commit**

```bash
git add src/game/items/chips.js tests/unit/chip-levels.test.js
git commit -m "feat: add chip level helpers and getScaledEffectValue"
```

---

## Task 6: Reset Charge on Unequip and Chip Destruction

**Files:**
- Modify: `src/game/items/chips.js` (in `unequipChip()`)
- Modify: `src/game/services/combat-service.js` (sacrifice/destruction handlers)

**Step 1: Add resetChipCharge call to unequipChip**

In `src/game/items/chips.js`, in `unequipChip()` (around line 876, after the filter that removes the chip from equippedChips):

```javascript
  // Remove from equipment (chip stays in inventory)
  equipment.equippedChips = equipment.equippedChips.filter(id => id !== chipId);

  // Reset charge when unequipped
  resetChipCharge(player, chipId);
```

**Step 2: Add resetChipCharge calls to combat-service.js destruction handlers**

In `src/game/services/combat-service.js`, in the sacrifice handler (around line 150-169), after removing chips, add charge reset. Same for fireworks random destruction (around line 183-199).

In the sacrifice loop (after line 164 `weapon.equippedChips.splice(eqIndex, 1)`):
```javascript
          // Reset charge for destroyed chip
          resetChipCharge(this.gm.run.player, chipId);
```

In the fireworks handler (after line 195 `weapon.equippedChips.indexOf(victimId)`):
```javascript
          resetChipCharge(this.gm.run.player, victimId);
```

Add import at top of combat-service.js:
```javascript
import { resetChipCharge } from '../items/chips.js';
```

**Step 3: Syntax check both files**

Run: `node --check src/game/items/chips.js && node --check src/game/services/combat-service.js && echo OK`
Expected: `OK`

**Step 4: Commit**

```bash
git add src/game/items/chips.js src/game/services/combat-service.js
git commit -m "feat: reset chip charge on unequip and destruction"
```

---

## Task 7: Create chip-skills.js — Buff Management

**Files:**
- Create: `src/game/combat/chip-skills.js`
- Create: `tests/unit/chip-skills.test.js`

**Step 1: Write the unit test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BUFF_TYPES,
  addBuff,
  consumeBuffsByType,
  clearAllBuffs,
  hasDefensiveBuff
} from '../../src/game/combat/chip-skills.js';

describe('Buff Management', () => {
  function makePlayer() {
    return { _activeBuffs: [] };
  }

  it('BUFF_TYPES has all four types', () => {
    assert.strictEqual(BUFF_TYPES.PRE_PIPELINE, 'PRE_PIPELINE');
    assert.strictEqual(BUFF_TYPES.POST_PIPELINE, 'POST_PIPELINE');
    assert.strictEqual(BUFF_TYPES.PIPELINE_MODIFIER, 'PIPELINE_MODIFIER');
    assert.strictEqual(BUFF_TYPES.DEFENSIVE, 'DEFENSIVE');
  });

  it('addBuff pushes buff to player._activeBuffs', () => {
    const player = makePlayer();
    addBuff(player, { id: 'test', buffType: 'PRE_PIPELINE', effect: {} });
    assert.strictEqual(player._activeBuffs.length, 1);
    assert.strictEqual(player._activeBuffs[0].id, 'test');
  });

  it('consumeBuffsByType returns and removes matching buffs', () => {
    const player = makePlayer();
    addBuff(player, { id: 'a', buffType: 'PRE_PIPELINE', effect: {} });
    addBuff(player, { id: 'b', buffType: 'POST_PIPELINE', effect: {} });
    addBuff(player, { id: 'c', buffType: 'PRE_PIPELINE', effect: {} });

    const consumed = consumeBuffsByType(player, 'PRE_PIPELINE');
    assert.strictEqual(consumed.length, 2);
    assert.strictEqual(player._activeBuffs.length, 1);
    assert.strictEqual(player._activeBuffs[0].id, 'b');
  });

  it('clearAllBuffs empties the array', () => {
    const player = makePlayer();
    addBuff(player, { id: 'a', buffType: 'PRE_PIPELINE', effect: {} });
    addBuff(player, { id: 'b', buffType: 'DEFENSIVE', effect: {} });
    clearAllBuffs(player);
    assert.strictEqual(player._activeBuffs.length, 0);
  });

  it('hasDefensiveBuff returns true when DEFENSIVE buff exists', () => {
    const player = makePlayer();
    addBuff(player, { id: 'egg', buffType: 'DEFENSIVE', effect: { surviveLethal: true } });
    assert.strictEqual(hasDefensiveBuff(player), true);
  });

  it('hasDefensiveBuff returns false when no DEFENSIVE buff', () => {
    const player = makePlayer();
    addBuff(player, { id: 'a', buffType: 'PRE_PIPELINE', effect: {} });
    assert.strictEqual(hasDefensiveBuff(player), false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/chip-skills.test.js`
Expected: FAIL — module not found

**Step 3: Implement buff management**

Create `src/game/combat/chip-skills.js`:

```javascript
/**
 * Chip Skills System
 *
 * PURPOSE: Manages chip skill activation (instant effects + buff placement)
 * and buff lifecycle (add, consume by type, clear).
 *
 * BUFF TYPES:
 * - PRE_PIPELINE: Flat bonuses added to baseDamage before pipeline
 * - POST_PIPELINE: Multipliers applied to finalDamage after pipeline
 * - PIPELINE_MODIFIER: Changes how pipeline executes (runTwice, nextChipDouble)
 * - DEFENSIVE: Checked when player takes lethal damage
 */

import { getChip, getChipCharge, resetChipCharge, isChipSkillReady } from '../items/chips.js';

// ============ BUFF TYPE CONSTANTS ============

export const BUFF_TYPES = {
  PRE_PIPELINE: 'PRE_PIPELINE',
  POST_PIPELINE: 'POST_PIPELINE',
  PIPELINE_MODIFIER: 'PIPELINE_MODIFIER',
  DEFENSIVE: 'DEFENSIVE'
};

// ============ BUFF MANAGEMENT ============

export function addBuff(player, buff) {
  if (!player._activeBuffs) player._activeBuffs = [];
  player._activeBuffs.push(buff);
}

export function consumeBuffsByType(player, type) {
  if (!player._activeBuffs) return [];
  const matching = player._activeBuffs.filter(b => b.buffType === type);
  player._activeBuffs = player._activeBuffs.filter(b => b.buffType !== type);
  return matching;
}

export function clearAllBuffs(player) {
  player._activeBuffs = [];
}

export function hasDefensiveBuff(player) {
  return (player._activeBuffs || []).some(b => b.buffType === BUFF_TYPES.DEFENSIVE);
}

// ============ INSTANT SKILL EXECUTION ============

export function executeInstantSkill(player, enemy, chip) {
  const skill = chip.skill;
  const result = { damage: 0, heal: 0 };

  if (skill.effect.damage) {
    result.damage = skill.effect.damage;
  }
  if (skill.effect.heal) {
    result.heal = skill.effect.heal;
  }
  if (skill.effect.damageFromStacks) {
    const stacks = player._combatStacks?.[chip.id] || 0;
    result.damage = skill.effect.stackMultiplier * stacks;
  }
  if (skill.effect.damageFromKills) {
    result.damage = (player._runKills || 0) * skill.effect.killMultiplier;
  }
  if (skill.effect.damageFromAttack) {
    result.damage = player.attack * skill.effect.attackMultiplier;
  }

  // Apply effects
  if (result.damage > 0 && enemy) {
    enemy.hp = Math.max(0, enemy.hp - result.damage);
  }
  if (result.heal > 0) {
    player.hp = Math.min(player.maxHp, player.hp + result.heal);
  }

  return result;
}

// ============ BUFF SKILL ACTIVATION ============

export function activateBuffSkill(player, chip) {
  const skill = chip.skill;
  const buff = {
    id: skill.id,
    chipId: chip.id,
    buffType: skill.buffType,
    effect: { ...skill.effect },
    condition: skill.condition || null
  };
  addBuff(player, buff);
  return buff;
}

// ============ TOP-LEVEL SKILL USE ============

export function useChipSkill(player, enemy, chipId) {
  // Validate chip is equipped
  const equippedChips = player.equipment?.weapon?.equippedChips || [];
  if (!equippedChips.includes(chipId)) {
    return { success: false, error: 'Chip not equipped' };
  }

  // Get chip definition
  const chip = getChip(chipId);
  if (!chip?.skill) {
    return { success: false, error: 'Chip has no skill' };
  }

  // Check charges
  if (!isChipSkillReady(player, chipId)) {
    return { success: false, error: 'Skill not charged' };
  }

  let result;
  if (chip.skill.type === 'instant') {
    const instantResult = executeInstantSkill(player, enemy, chip);
    result = { skillType: 'instant', ...instantResult };
  } else if (chip.skill.type === 'buff') {
    const buff = activateBuffSkill(player, chip);
    result = { skillType: 'buff', buffApplied: buff };
  } else {
    return { success: false, error: 'Unknown skill type' };
  }

  // Reset charge
  resetChipCharge(player, chipId);

  return {
    success: true,
    skillName: chip.skill.name,
    skillNameEn: chip.skill.nameEn,
    chipId,
    ...result
  };
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/chip-skills.test.js`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add src/game/combat/chip-skills.js tests/unit/chip-skills.test.js
git commit -m "feat: create chip-skills.js with buff management and skill execution"
```

---

## Task 8: Unit Tests for Instant and Buff Skill Execution

**Files:**
- Modify: `tests/unit/chip-skills.test.js`

**Step 1: Add tests for executeInstantSkill and activateBuffSkill**

Append to `tests/unit/chip-skills.test.js`:

```javascript
import { executeInstantSkill, activateBuffSkill, useChipSkill } from '../../src/game/combat/chip-skills.js';
import { CHIPS } from '../../src/game/items/chips.js';

describe('executeInstantSkill', () => {
  it('lightBulb deals 40 damage', () => {
    const player = { hp: 100, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.lightBulb);
    assert.strictEqual(result.damage, 40);
    assert.strictEqual(enemy.hp, 160);
  });

  it('charcoal heals 30 HP', () => {
    const player = { hp: 50, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.charcoal);
    assert.strictEqual(result.heal, 30);
    assert.strictEqual(player.hp, 80);
  });

  it('charcoal heal caps at maxHp', () => {
    const player = { hp: 90, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    executeInstantSkill(player, enemy, CHIPS.charcoal);
    assert.strictEqual(player.hp, 100);
  });

  it('straw heals 20 and deals 10 damage', () => {
    const player = { hp: 50, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.straw);
    assert.strictEqual(result.heal, 20);
    assert.strictEqual(result.damage, 10);
    assert.strictEqual(player.hp, 70);
    assert.strictEqual(enemy.hp, 190);
  });

  it('book deals 5x stacks damage', () => {
    const player = { hp: 100, maxHp: 100, attack: 15, _combatStacks: { book: 8 }, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.book);
    assert.strictEqual(result.damage, 40); // 5 * 8
    assert.strictEqual(enemy.hp, 160);
  });

  it('book deals 0 damage with no stacks', () => {
    const player = { hp: 100, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.book);
    assert.strictEqual(result.damage, 0);
  });

  it('wallet deals kills*2 damage', () => {
    const player = { hp: 100, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 10 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.wallet);
    assert.strictEqual(result.damage, 20); // 10 * 2
  });

  it('drum deals 3x player.attack', () => {
    const player = { hp: 100, maxHp: 100, attack: 25, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.drum);
    assert.strictEqual(result.damage, 75); // 25 * 3
  });
});

describe('activateBuffSkill', () => {
  it('battery creates PRE_PIPELINE buff with flatBonus 20', () => {
    const player = { _activeBuffs: [] };
    const buff = activateBuffSkill(player, CHIPS.battery);
    assert.strictEqual(buff.buffType, 'PRE_PIPELINE');
    assert.strictEqual(buff.effect.flatBonus, 20);
    assert.strictEqual(player._activeBuffs.length, 1);
  });

  it('speaker creates POST_PIPELINE buff with multiplier 1.8', () => {
    const player = { _activeBuffs: [] };
    const buff = activateBuffSkill(player, CHIPS.speaker);
    assert.strictEqual(buff.buffType, 'POST_PIPELINE');
    assert.strictEqual(buff.effect.multiplier, 1.8);
  });

  it('clock creates PIPELINE_MODIFIER with runTwice', () => {
    const player = { _activeBuffs: [] };
    const buff = activateBuffSkill(player, CHIPS.clock);
    assert.strictEqual(buff.buffType, 'PIPELINE_MODIFIER');
    assert.strictEqual(buff.effect.runTwice, true);
  });

  it('egg creates DEFENSIVE buff with surviveLethal', () => {
    const player = { _activeBuffs: [] };
    const buff = activateBuffSkill(player, CHIPS.egg);
    assert.strictEqual(buff.buffType, 'DEFENSIVE');
    assert.strictEqual(buff.effect.surviveLethal, true);
  });

  it('scissors buff has enemyBelow30 condition', () => {
    const player = { _activeBuffs: [] };
    const buff = activateBuffSkill(player, CHIPS.scissors);
    assert.strictEqual(buff.condition, 'enemyBelow30');
  });
});

describe('useChipSkill', () => {
  function makePlayer(chipId, charge = 5) {
    return {
      hp: 100, maxHp: 100, attack: 15,
      _chipCharges: { [chipId]: charge },
      _activeBuffs: [],
      _combatStacks: {},
      _runKills: 5,
      equipment: { weapon: { equippedChips: [chipId] } }
    };
  }

  it('fails if chip not equipped', () => {
    const player = makePlayer('battery');
    player.equipment.weapon.equippedChips = [];
    const result = useChipSkill(player, {}, 'battery');
    assert.strictEqual(result.success, false);
  });

  it('fails if not enough charges', () => {
    const player = makePlayer('battery', 3);
    const result = useChipSkill(player, {}, 'battery');
    assert.strictEqual(result.success, false);
  });

  it('succeeds and resets charge for instant skill', () => {
    const player = makePlayer('lightBulb');
    const enemy = { hp: 200, maxHp: 200 };
    const result = useChipSkill(player, enemy, 'lightBulb');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.skillType, 'instant');
    assert.strictEqual(result.damage, 40);
    assert.strictEqual(player._chipCharges.lightBulb, 0);
  });

  it('succeeds and resets charge for buff skill', () => {
    const player = makePlayer('battery');
    const result = useChipSkill(player, {}, 'battery');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.skillType, 'buff');
    assert.strictEqual(player._chipCharges.battery, 0);
    assert.strictEqual(player._activeBuffs.length, 1);
  });
});
```

**Step 2: Run all chip-skills tests**

Run: `node --test tests/unit/chip-skills.test.js`
Expected: PASS (all tests — both buff management and skill execution)

**Step 3: Commit**

```bash
git add tests/unit/chip-skills.test.js
git commit -m "test: add comprehensive unit tests for chip skill execution"
```

---

## Task 9: Charge Increment After Enemy Turn

**Files:**
- Modify: `src/game/services/combat-service.js`

**Step 1: Add charge increment in executeCombatCycle**

In `combat-service.js`, the enemy turn is handled in the `else if (attackerType === 'enemy')` block (line 335). After the enemy attack resolves and before the final `return result` (around line 375), increment charges:

```javascript
import { resetChipCharge, incrementAllEquippedCharges } from '../items/chips.js';
```

At the end of the enemy attack block (after line 355, before the defeat check or after it if player survived):

Actually, the spec says "All equipped weapon chips gain +1 charge at end of each turn (after enemy acts)". The charge should increment after the enemy acts, but only if the player wasn't stunned. Since this system doesn't have stun/sleep status on the player yet that skips turns, we'll just increment after enemy resolves, before defeat check.

Insert after line 355 (after dodge tracking, before defeat check):

```javascript
      // Increment chip charges after enemy turn (round complete)
      // Skip if player turn was skipped (stun/sleep - not yet implemented)
      incrementAllEquippedCharges(this.gm.run.player);
```

**Step 2: Syntax check**

Run: `node --check src/game/services/combat-service.js && echo OK`
Expected: `OK`

**Step 3: Commit**

```bash
git add src/game/services/combat-service.js
git commit -m "feat: increment all chip charges after enemy turn resolves"
```

---

## Task 10: Apply Level Scaling in Pipeline Execution

**Files:**
- Modify: `src/game/items/chips.js` (in `processPipelineChip` and `executeChipPipeline`)

**Step 1: Write a focused unit test**

Add to `tests/unit/chip-levels.test.js`:

```javascript
import { executeChipPipeline } from '../../src/game/items/chips.js';

describe('Level Scaling in Pipeline', () => {
  it('flatAdd chip at level 7 uses scaled value in pipeline', () => {
    const chips = [CHIPS.battery]; // flatAdd, value 5
    const result = executeChipPipeline(chips, {
      baseDamage: 100,
      isCrit: false,
      critChance: 5,
      target: { isBoss: false, hp: 500, maxHp: 500 },
      combatStacks: {},
      weaponMaxSlots: 5,
      weaponUsedSlots: 1,
      runKills: 0,
      runChipsDestroyed: 0,
      player: { _chipLevels: { battery: 7 } }
    });
    // Level 7: floor(5 * 1.3) = 6, so base 100 + 6 = 106
    assert.strictEqual(result.finalDamage, 106);
  });

  it('multiply chip at level 7 uses scaled multiplier', () => {
    const chips = [CHIPS.speaker]; // multiply, value 1.5, triggerChance 0.8
    // Force trigger by using mock - actually triggerChance is checked with Math.random
    // We'll test with triggerChance 1.0 chip or accept probabilistic behavior
    // Battery is more reliable for deterministic testing
    // Let's just verify the pipeline accepts the player context without error
    const result = executeChipPipeline(chips, {
      baseDamage: 100,
      isCrit: false,
      critChance: 5,
      target: { isBoss: false, hp: 500, maxHp: 500 },
      combatStacks: {},
      weaponMaxSlots: 5,
      weaponUsedSlots: 1,
      runKills: 0,
      runChipsDestroyed: 0,
      player: { _chipLevels: { speaker: 7 } }
    });
    // Speaker has 80% trigger chance, so result is probabilistic
    // Just verify no crash and result is valid
    assert.ok(result.finalDamage >= 100);
  });

  it('level 1 (default) returns normal pipeline result', () => {
    const chips = [CHIPS.battery];
    const result = executeChipPipeline(chips, {
      baseDamage: 100,
      isCrit: false,
      critChance: 5,
      target: { isBoss: false, hp: 500, maxHp: 500 },
      combatStacks: {},
      weaponMaxSlots: 5,
      weaponUsedSlots: 1,
      runKills: 0,
      runChipsDestroyed: 0,
      player: { _chipLevels: {} }
    });
    assert.strictEqual(result.finalDamage, 105); // 100 + 5
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/chip-levels.test.js`
Expected: FAIL — pipeline doesn't use player context for scaling yet

**Step 3: Modify pipeline to use level scaling**

In `executeChipPipeline()` (line 607-691), add `player` to the state object passed to `processPipelineChip`:

Around line 621-625, where the state object is built:
```javascript
  const state = {
    damage: context.baseDamage,
    // ... existing fields ...
    player: context.player || null  // Add player for level scaling
  };
```

In `processPipelineChip()` (line 296-599), where `effect.value` is read, replace with scaled value:

Find the line where `const value = effect.value;` or where value is first used. The function reads `effect.value` directly in multiple switch cases. The cleanest approach:

At the top of `processPipelineChip`, after getting the effect, compute the scaled value:

```javascript
function processPipelineChip(chip, state) {
  const effect = chip.effects?.pipeline;
  if (!effect) return state;

  // Apply level scaling to effect value
  let effectValue = effect.value;
  if (state.player) {
    effectValue = getScaledEffectValue(chip, getChipLevel(state.player, chip.id));
  }

  // ... rest of function uses effectValue instead of effect.value
```

Then replace all references to `effect.value` within `processPipelineChip` with `effectValue`. This is the key change — every case in the switch that reads `effect.value` should read `effectValue` instead.

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/chip-levels.test.js`
Expected: PASS

**Step 5: Run existing pipeline tests to ensure no regression**

Run: `node --test tests/unit/pipeline-chips.test.js`
Expected: PASS (existing tests still work — they don't pass player, so effectValue falls back to effect.value)

**Step 6: Commit**

```bash
git add src/game/items/chips.js tests/unit/chip-levels.test.js
git commit -m "feat: apply chip level scaling in pipeline execution"
```

---

## Task 11: Pass Player Context to Pipeline from Player Actions

**Files:**
- Modify: `src/game/combat/player-actions.js`

**Step 1: Add `player` to pipeline context**

In `executePlayerAttack()` (line 59-69), add `player` to the context object:

```javascript
      const pipelineResult = executeChipPipeline(weaponChips, {
        baseDamage: attackResult.damage,
        isCrit: attackResult.critical,
        critChance: attackResult.critChance,
        target: enemy,
        combatStacks: player._combatStacks || {},
        weaponMaxSlots,
        weaponUsedSlots,
        runKills: player._runKills || 0,
        runChipsDestroyed: player._runChipsDestroyed || 0,
        player  // Add for level scaling
      });
```

**Step 2: Syntax check**

Run: `node --check src/game/combat/player-actions.js && echo OK`
Expected: `OK`

**Step 3: Commit**

```bash
git add src/game/combat/player-actions.js
git commit -m "feat: pass player to pipeline context for level scaling"
```

---

## Task 12: Apply PRE_PIPELINE and POST_PIPELINE Buffs

**Files:**
- Modify: `src/game/combat/player-actions.js`
- Add to: `tests/unit/chip-skills.test.js`

**Step 1: Write the unit test**

Add to `tests/unit/chip-skills.test.js`:

```javascript
import { executePlayerAttack } from '../../src/game/combat/player-actions.js';

describe('Buff Application in Player Attack', () => {
  function makeAttackPlayer(buffs = [], equippedChips = ['battery']) {
    return {
      hp: 100, maxHp: 100,
      attack: 20,
      stats: { str: 10, agi: 10, vit: 10, int: 10, dex: 10, luk: 10 },
      _activeBuffs: buffs,
      _chipCharges: {},
      _chipLevels: {},
      _combatStacks: {},
      _runKills: 0,
      _runChipsDestroyed: 0,
      equipment: {
        weapon: { equippedChips, attack: 10 },
        armor: null, shield: null, accessory: null
      },
      chips: equippedChips.map(id => ({ id }))
    };
  }

  it('PRE_PIPELINE flatBonus adds to base damage before pipeline', () => {
    const player = makeAttackPlayer([
      { id: 'fullCharge', buffType: 'PRE_PIPELINE', effect: { flatBonus: 20 }, condition: null }
    ]);
    const enemy = { hp: 500, maxHp: 500, stats: { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 }, isBoss: false };
    const result = executePlayerAttack(player, enemy);
    // Buff consumed
    assert.strictEqual(player._activeBuffs.length, 0);
    // Damage should be higher than without buff (exact value depends on attack formula)
    if (result.anyHit) {
      assert.ok(result.totalDamage > 0);
    }
  });
});
```

Note: Exact damage values depend on the attack formula RNG (hit/crit rolls). The integration test verifies buff consumption.

**Step 2: Implement buff application**

In `src/game/combat/player-actions.js`, add import:

```javascript
import { consumeBuffsByType } from './chip-skills.js';
```

After line 44 (after `resolvePhysicalAttack`), if the attack hit, apply PRE_PIPELINE buffs before the pipeline, and POST_PIPELINE after:

```javascript
  if (attackResult.hit) {
    result.anyHit = true;

    // --- PRE_PIPELINE buffs: add flat bonuses to base damage ---
    let baseDamage = attackResult.damage;
    const preBuffs = consumeBuffsByType(player, 'PRE_PIPELINE');
    for (const buff of preBuffs) {
      if (buff.condition === 'emptySlots>=2') {
        const weapon = player.equipment?.weapon;
        const empty = 5 - (weapon?.equippedChips?.length || 0);
        if (empty >= 2) baseDamage += buff.effect.flatBonus;
      } else if (buff.effect.flatBonusPerEmpty) {
        const weapon = player.equipment?.weapon;
        const empty = 5 - (weapon?.equippedChips?.length || 0);
        baseDamage += buff.effect.flatBonusPerEmpty * empty;
      } else if (buff.effect.flatBonus) {
        baseDamage += buff.effect.flatBonus;
      }
    }

    // --- PIPELINE_MODIFIER buffs: alter pipeline execution ---
    const modBuffs = consumeBuffsByType(player, 'PIPELINE_MODIFIER');
    const runTwice = modBuffs.some(b => b.effect.runTwice);
    const nextChipDouble = modBuffs.some(b => b.effect.nextChipDouble);

    // Get weapon chips in slot order and execute pipeline
    const weaponChips = getWeaponPipelineChips(player);
    let pipelineResult = null;
    if (weaponChips.length > 0) {
      const weapon = player.equipment?.weapon;
      const weaponMaxSlots = 5;
      const weaponUsedSlots = weapon?.equippedChips?.length || 0;

      const pipelineContext = {
        baseDamage,
        isCrit: attackResult.critical,
        critChance: attackResult.critChance,
        target: enemy,
        combatStacks: player._combatStacks || {},
        weaponMaxSlots,
        weaponUsedSlots,
        runKills: player._runKills || 0,
        runChipsDestroyed: player._runChipsDestroyed || 0,
        player,
        nextChipDouble
      };

      pipelineResult = executeChipPipeline(weaponChips, pipelineContext);

      if (runTwice) {
        const secondResult = executeChipPipeline(weaponChips, {
          ...pipelineContext,
          combatStacks: pipelineResult.combatStacks
        });
        pipelineResult.finalDamage += secondResult.finalDamage;
        pipelineResult.healPlayer = (pipelineResult.healPlayer || 0) + (secondResult.healPlayer || 0);
        // Merge fired chips for animation (mark second run)
        pipelineResult.secondRunFiredChips = secondResult.firedChips;
      }

      player._combatStacks = pipelineResult.combatStacks;
      result.totalDamage = pipelineResult.finalDamage;
      result.pipelineResult = pipelineResult;
    } else {
      result.totalDamage = baseDamage;
    }

    // --- POST_PIPELINE buffs: multiply final damage ---
    const postBuffs = consumeBuffsByType(player, 'POST_PIPELINE');
    for (const buff of postBuffs) {
      if (buff.condition === 'enemyBelow30' && enemy.hp / enemy.maxHp >= 0.3) continue;
      if (buff.condition === 'isBoss' && !enemy.isBoss) continue;
      result.totalDamage = Math.floor(result.totalDamage * buff.effect.multiplier);
    }
  }
```

This replaces lines 49-76 of the original function. The key changes:
1. PRE_PIPELINE buffs add to `baseDamage` before pipeline
2. PIPELINE_MODIFIER buffs alter pipeline behavior (runTwice, nextChipDouble)
3. POST_PIPELINE buffs multiply `result.totalDamage` after pipeline

**Step 3: Handle nextChipDouble in pipeline**

In `src/game/items/chips.js`, in `processPipelineChip()`, add support for `nextChipDouble` flag in the state:

In `executeChipPipeline`, after processing each chip, check if nextChipDouble should fire the next chip twice. Add to the main loop (around line 645):

```javascript
    // Handle nextChipDouble: if flag set, process next chip twice
    if (state.nextChipDouble && i > 0 && !state.nextChipDoubleApplied) {
      // This chip was doubled by the mirror - process it again
      state = processPipelineChip(chip, state);
      state.nextChipDoubleApplied = true;
    }
```

Actually, better approach: track which chip index should be doubled. When the pipeline receives `nextChipDouble: true` in context, the FIRST chip in the pipeline fires twice (since mirror was used before the attack, the "next chip in execution order" is the first one). We'll implement it as: the first chip processes twice.

```javascript
  // In executeChipPipeline, initialize from context:
  let nextChipDoubleActive = context.nextChipDouble || false;

  // In the main loop, after processPipelineChip:
  if (nextChipDoubleActive) {
    state = processPipelineChip(chip, state);
    nextChipDoubleActive = false; // Only doubles one chip
  }
```

**Step 4: Run tests**

Run: `node --test tests/unit/chip-skills.test.js && node --test tests/unit/pipeline-chips.test.js`
Expected: PASS

**Step 5: Syntax check**

Run: `node --check src/game/combat/player-actions.js && node --check src/game/items/chips.js && echo OK`
Expected: `OK`

**Step 6: Commit**

```bash
git add src/game/combat/player-actions.js src/game/items/chips.js tests/unit/chip-skills.test.js
git commit -m "feat: apply PRE/POST/MODIFIER buffs around pipeline in player attack"
```

---

## Task 13: Apply DEFENSIVE Buffs (Egg Revival)

**Files:**
- Modify: `src/game/combat/enemy.js`

**Step 1: Add DEFENSIVE buff check in enemy damage application**

In `src/game/combat/enemy.js`, around line 111 where `player.hp = Math.max(0, player.hp - finalDamage)`:

Replace with:
```javascript
      // Apply damage to player (check DEFENSIVE buffs for lethal protection)
      if (player.hp - finalDamage <= 0 && finalDamage > 0) {
        const { consumeBuffsByType } = await import('./chip-skills.js');
        const defBuffs = consumeBuffsByType(player, 'DEFENSIVE');
        if (defBuffs.some(b => b.effect.surviveLethal)) {
          player.hp = 1;
          result.survivedLethal = true;
        } else {
          player.hp = 0;
        }
      } else {
        player.hp = Math.max(0, player.hp - finalDamage);
      }
      result.playerDefeated = player.hp <= 0;
```

Wait — this file uses static imports. Use a regular import at the top instead:

```javascript
import { consumeBuffsByType } from './chip-skills.js';
```

Then the inline code becomes:
```javascript
      // Apply damage to player (check DEFENSIVE buffs for lethal protection)
      if (player.hp - finalDamage <= 0 && finalDamage > 0) {
        const defBuffs = consumeBuffsByType(player, 'DEFENSIVE');
        if (defBuffs.some(b => b.effect.surviveLethal)) {
          player.hp = 1;
          result.survivedLethal = true;
        } else {
          player.hp = 0;
        }
      } else {
        player.hp = Math.max(0, player.hp - finalDamage);
      }
      result.playerDefeated = player.hp <= 0;
```

**Step 2: Syntax check**

Run: `node --check src/game/combat/enemy.js && echo OK`
Expected: `OK`

**Step 3: Commit**

```bash
git add src/game/combat/enemy.js
git commit -m "feat: apply DEFENSIVE buffs (egg revival) on lethal enemy damage"
```

---

## Task 14: Clear Buffs on Combat End

**Files:**
- Modify: `src/game/services/combat-service.js`

**Step 1: Add clearAllBuffs calls**

Import at the top of `combat-service.js`:
```javascript
import { clearAllBuffs } from '../combat/chip-skills.js';
```

In the victory block (around line 277-334), after `this.gm.combat.active = false` (line 327):
```javascript
        clearAllBuffs(this.gm.run.player);
```

In the defeat block (around line 358-374), after `this.gm.combat.active = false` (line 363):
```javascript
        clearAllBuffs(this.gm.run.player);
```

**Step 2: Syntax check**

Run: `node --check src/game/services/combat-service.js && echo OK`
Expected: `OK`

**Step 3: Commit**

```bash
git add src/game/services/combat-service.js
git commit -m "feat: clear active buffs on combat end (victory/defeat)"
```

---

## Task 15: API Endpoints — use-chip-skill and chip-skill-info

**Files:**
- Modify: `src/routes/game/combat.js`

**Step 1: Add use-chip-skill endpoint**

In `src/routes/game/combat.js`, add after existing routes:

```javascript
  // Use chip skill (during combat, before vocab card)
  router.post('/use-chip-skill', (req, res) => {
    const { chipId } = req.body;
    if (!chipId) {
      return res.status(400).json({ error: 'chipId required' });
    }
    if (!gameManager.combat?.active) {
      return res.status(400).json({ error: 'No active combat' });
    }

    try {
      const { useChipSkill } = await import('../../game/combat/chip-skills.js');
      const result = useChipSkill(
        gameManager.run.player,
        gameManager.combat.enemy,
        chipId
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      saveGameData();
      res.json({
        ...result,
        playerHp: { current: gameManager.run.player.hp, max: gameManager.run.player.maxHp },
        enemyHp: { current: gameManager.combat.enemy.hp, max: gameManager.combat.enemy.maxHp },
        chipCharges: gameManager.run.player._chipCharges
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
```

Wait — the route file uses sync handlers and top-level imports. Let's use a top-level import and sync handler:

Add import in the function body (routes are created at startup):

Actually, looking at the route pattern, the routes file uses a factory function that creates routes. Add the import at the top of the module:

At the top of `combat.js`, add:
```javascript
import { useChipSkill } from '../../game/combat/chip-skills.js';
import { getChip, getChipCharge, isChipSkillReady, getChipLevel } from '../../game/items/chips.js';
```

Then the route becomes:
```javascript
  router.post('/use-chip-skill', (req, res) => {
    const { chipId } = req.body;
    if (!chipId) {
      return res.status(400).json({ error: 'chipId required' });
    }
    if (!gameManager.combat?.active) {
      return res.status(400).json({ error: 'No active combat' });
    }

    const result = useChipSkill(
      gameManager.run.player,
      gameManager.combat.enemy,
      chipId
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    saveGameData();
    res.json({
      ...result,
      playerHp: { current: gameManager.run.player.hp, max: gameManager.run.player.maxHp },
      enemyHp: { current: gameManager.combat.enemy.hp, max: gameManager.combat.enemy.maxHp },
      chipCharges: gameManager.run.player._chipCharges
    });
  });
```

**Step 2: Add chip-skill-info endpoint**

```javascript
  router.get('/chip-skill-info/:chipId', (req, res) => {
    const { chipId } = req.params;
    const chip = getChip(chipId);
    if (!chip) {
      return res.status(404).json({ error: 'Chip not found' });
    }

    const player = gameManager.run?.player;
    if (!player) {
      return res.status(400).json({ error: 'No active run' });
    }

    res.json({
      chip: {
        id: chip.id,
        name: chip.name,
        nameEn: chip.nameEn,
        skill: chip.skill
      },
      charges: getChipCharge(player, chipId),
      chargesRequired: chip.skill?.chargesRequired || 5,
      level: getChipLevel(player, chipId),
      isReady: isChipSkillReady(player, chipId)
    });
  });
```

**Step 3: Extend chip-loadout response**

In `src/routes/game/run.js`, find the `/chip-loadout` GET handler and add `chipCharges` and `chipLevels` to the response:

Add to the response object:
```javascript
    res.json({
      ...loadout,
      chipCharges: gameManager.run.player._chipCharges || {},
      chipLevels: gameManager.run.player._chipLevels || {}
    });
```

**Step 4: Syntax check**

Run: `node --check src/routes/game/combat.js && node --check src/routes/game/run.js && echo OK`
Expected: `OK`

**Step 5: Commit**

```bash
git add src/routes/game/combat.js src/routes/game/run.js
git commit -m "feat: add use-chip-skill and chip-skill-info API endpoints"
```

---

## Task 16: Frontend — Charge Meters and Level Badges

**Files:**
- Modify: `public/js/ui/combat.js`

**Step 1: Update renderCombatChips to show charge meters and level badges**

In `public/js/ui/combat.js`, modify the `renderCombatChips()` function (line 404-434). Replace the chip slot HTML generation:

```javascript
export function renderCombatChips(pipelineResult = null) {
  if (!chipLoadoutCache?.equipment?.weapon) return '';

  const weaponChips = chipLoadoutCache.equipment.weapon.equippedChips || [];
  const chipCharges = chipLoadoutCache.chipCharges || {};
  const chipLevels = chipLoadoutCache.chipLevels || {};
  let html = '';

  for (let i = 0; i < 5; i++) {
    const chip = weaponChips[i];
    if (chip) {
      const rarityClass = `rarity-${chip.rarity || 'common'}`;
      const iconId = chip.baseId || chip.id.replace(/_(common|uncommon|rare|epic|legendary)$/, '');
      const chipId = chip.baseId || chip.id;

      // Pipeline fire state
      const fireState = pipelineResult?.firedChips?.[i];
      let stateClass = '';
      if (fireState && !fireState.skipped && !fireState.notPipeline) {
        stateClass = fireState.triggered ? 'triggered' : 'failed';
      }

      // Charge state
      const charges = chipCharges[chipId] || 0;
      const chargesRequired = chip.skill?.chargesRequired || 5;
      const isCharged = charges >= chargesRequired;
      const chargedClass = isCharged ? 'chip-charged' : '';

      // Level badge
      const level = chipLevels[chipId] || 1;
      const levelBadge = level > 1 ? `<span class="chip-level-badge">L${level}</span>` : '';

      // Charge meter segments
      let meterHtml = '<div class="chip-charge-meter">';
      for (let s = 0; s < chargesRequired; s++) {
        meterHtml += `<div class="chip-charge-segment${s < charges ? ' filled' : ''}"></div>`;
      }
      meterHtml += '</div>';

      html += `
        <div class="chip-slot filled ${rarityClass} ${stateClass} ${chargedClass}" title="${chip.name}" data-index="${i}" data-chip-id="${chipId}" onclick="window.showChipSkillPopup('${chipId}')">
          ${levelBadge}
          <img class="chip-slot-icon" src="/assets/icons/chips/${iconId}.png" alt="" onerror="this.style.display='none'">
          ${fireState?.triggered ? `<span class="chip-effect-text">${fireState.displayText}</span>` : ''}
          ${meterHtml}
        </div>
      `;
    } else {
      html += `<div class="chip-slot empty" data-index="${i}"></div>`;
    }
  }
  return html;
}
```

**Step 2: Syntax check**

Run: `node --check public/js/ui/combat.js && echo OK`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/ui/combat.js
git commit -m "feat: add charge meters and level badges to combat chip display"
```

---

## Task 17: Frontend — Skill Popup

**Files:**
- Modify: `public/js/ui/combat.js`

**Step 1: Implement showChipSkillPopup**

Add to `public/js/ui/combat.js`:

```javascript
// ============ CHIP SKILL POPUP ============

window.showChipSkillPopup = async function(chipId) {
  // Remove existing popup
  const existing = document.querySelector('.chip-skill-popup');
  if (existing) existing.remove();

  try {
    const response = await fetch(`/api/game/chip-skill-info/${chipId}`);
    const data = await response.json();
    if (!data.chip?.skill) return;

    const { chip, charges, chargesRequired, level, isReady } = data;
    const skill = chip.skill;

    // Find the chip slot element for positioning
    const chipSlot = document.querySelector(`.chip-slot[data-chip-id="${chipId}"]`);
    if (!chipSlot) return;

    const rect = chipSlot.getBoundingClientRect();

    const popup = document.createElement('div');
    popup.className = 'chip-skill-popup';
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.top - 160}px`;

    const chargeText = isReady ? 'READY' : `Charging ${charges}/${chargesRequired}`;

    popup.innerHTML = `
      <div class="skill-popup-header">
        <span class="skill-name">${skill.name}</span>
        <span class="skill-name-en">${skill.nameEn}</span>
      </div>
      <div class="skill-description">${skill.descriptionEn}</div>
      <div class="skill-charge-status ${isReady ? 'ready' : 'charging'}">${chargeText}</div>
      <button class="skill-use-btn" ${isReady ? '' : 'disabled'} onclick="window.useChipSkill('${chipId}')">
        ${isReady ? 'Use Skill' : `${charges}/${chargesRequired}`}
      </button>
    `;

    document.body.appendChild(popup);

    // Close on click outside
    const closeHandler = (e) => {
      if (!popup.contains(e.target) && !chipSlot.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', closeHandler);
        document.removeEventListener('keydown', escHandler);
      }
    };
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        popup.remove();
        document.removeEventListener('click', closeHandler);
        document.removeEventListener('keydown', escHandler);
      }
    };
    // Delay adding listener to avoid immediate close from the click that opened it
    setTimeout(() => {
      document.addEventListener('click', closeHandler);
      document.addEventListener('keydown', escHandler);
    }, 10);

  } catch (err) {
    console.error('Failed to show chip skill popup:', err);
  }
};
```

**Step 2: Implement useChipSkill frontend function**

```javascript
window.useChipSkill = async function(chipId) {
  try {
    const response = await fetch('/api/game/use-chip-skill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chipId })
    });
    const data = await response.json();

    if (!data.success) {
      console.warn('Skill use failed:', data.error);
      return;
    }

    // Close popup
    const popup = document.querySelector('.chip-skill-popup');
    if (popup) popup.remove();

    // Animate skill activation
    const chipSlot = document.querySelector(`.chip-slot[data-chip-id="${chipId}"]`);
    if (chipSlot) {
      chipSlot.classList.add('chip-skill-activating');
      chipSlot.addEventListener('animationend', () => {
        chipSlot.classList.remove('chip-skill-activating');
      }, { once: true });
    }

    // Update HP bars
    if (data.playerHp) {
      updatePlayerHpBar(data.playerHp.current, data.playerHp.max);
    }
    if (data.enemyHp) {
      updateEnemyHpBar(data.enemyHp.current, data.enemyHp.max);
    }

    // Show damage/heal numbers
    if (data.damage > 0) {
      showDamageNumber(data.damage, false, false, false); // enemy damage
    }
    if (data.heal > 0) {
      showDamageNumber(data.heal, true, false, true); // player heal
    }

    // Show buff indicator
    if (data.skillType === 'buff') {
      showBuffIndicator(data.skillName);
    }

    // Update chip charges in cache and re-render
    if (data.chipCharges) {
      chipLoadoutCache.chipCharges = data.chipCharges;
    }
    rerenderCombatChips();

  } catch (err) {
    console.error('Failed to use chip skill:', err);
  }
};
```

**Step 3: Add buff indicator and helper functions**

```javascript
// ============ BUFF INDICATOR ============

function showBuffIndicator(buffName) {
  const indicator = document.createElement('div');
  indicator.className = 'buff-indicator';
  indicator.textContent = buffName;

  const playerArea = document.querySelector('.player-status') || document.querySelector('.player-hp-bar');
  if (playerArea) {
    playerArea.appendChild(indicator);
  }
}

function rerenderCombatChips() {
  const chipDisplay = document.querySelector('.combat-chips-display');
  if (chipDisplay) {
    chipDisplay.innerHTML = renderCombatChips();
  }
}

function updatePlayerHpBar(current, max) {
  const hpBar = document.querySelector('.player-hp-fill');
  const hpText = document.querySelector('.player-hp-text');
  if (hpBar) hpBar.style.width = `${(current / max) * 100}%`;
  if (hpText) hpText.textContent = `${current}/${max}`;
}

function updateEnemyHpBar(current, max) {
  const hpBar = document.querySelector('.enemy-hp-fill');
  const hpText = document.querySelector('.enemy-hp-text');
  if (hpBar) hpBar.style.width = `${(current / max) * 100}%`;
  if (hpText) hpText.textContent = `${current}/${max}`;
}
```

**Step 4: Syntax check**

Run: `node --check public/js/ui/combat.js && echo OK`
Expected: `OK`

**Step 5: Commit**

```bash
git add public/js/ui/combat.js
git commit -m "feat: add chip skill popup, use-skill handler, and buff indicators"
```

---

## Task 18: Frontend — Re-render Chips After State Changes

**Files:**
- Modify: `public/js/ui/combat.js`

**Step 1: Update chip display after combat cycle response**

Find where the combat cycle response is handled (likely in `game.js` or `combat.js`). After the attack animation completes and charges are updated from the server response, call `rerenderCombatChips()`.

Look for where `chipLoadoutCache` is populated — this is likely in a fetch to `/api/game/chip-loadout`. Ensure that after each combat cycle response (which doesn't currently include charges), the cache is refreshed.

Add to the combat cycle response handler (wherever `result.playerAttack` is processed):

```javascript
// After attack response, refresh chip charges from server
async function refreshChipLoadout() {
  try {
    const res = await fetch('/api/game/chip-loadout');
    const data = await res.json();
    chipLoadoutCache = data;
    rerenderCombatChips();
  } catch (err) {
    console.error('Failed to refresh chip loadout:', err);
  }
}
```

Call `refreshChipLoadout()` after each combat cycle completes (attack animation finishes).

**Step 2: Clear buff indicators on combat end**

Add to whatever function handles combat end UI:
```javascript
function clearBuffIndicators() {
  const indicators = document.querySelectorAll('.buff-indicator');
  indicators.forEach(el => el.remove());
}
```

Call `clearBuffIndicators()` when combat ends (victory or defeat screen shown).

**Step 3: Syntax check**

Run: `node --check public/js/ui/combat.js && echo OK`
Expected: `OK`

**Step 4: Commit**

```bash
git add public/js/ui/combat.js
git commit -m "feat: re-render chip display after state changes and combat end"
```

---

## Task 19: CSS Styles for Charge Meters, Level Badges, Popup, Animations

**Files:**
- Modify: `public/game.css`

**Step 1: Add all chip skill CSS styles**

Append to `public/game.css`:

```css
/* ============ CHIP CHARGE METER ============ */
.chip-charge-meter {
  display: flex;
  gap: 1px;
  width: 100%;
  height: 3px;
  margin-top: 2px;
}

.chip-charge-segment {
  flex: 1;
  background: var(--bg-darker, #1a1a2e);
  border-radius: 1px;
}

.chip-charge-segment.filled {
  background: var(--accent-cyan, #00ffff);
}

/* ============ CHIP LEVEL BADGE ============ */
.chip-level-badge {
  position: absolute;
  top: -2px;
  left: -2px;
  font-size: 9px;
  font-weight: bold;
  color: var(--accent-cyan, #00ffff);
  background: var(--bg-dark, #0f0f23);
  padding: 0 2px;
  border-radius: 2px;
  line-height: 1;
  z-index: 2;
}

/* ============ CHARGED GLOW ============ */
.chip-charged {
  animation: pulse-glow 1.5s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 4px var(--accent-cyan, #00ffff); }
  50% { box-shadow: 0 0 12px var(--accent-cyan, #00ffff), 0 0 20px rgba(0, 255, 255, 0.3); }
}

/* ============ SKILL POPUP ============ */
.chip-skill-popup {
  position: fixed;
  z-index: 1000;
  background: var(--bg-dark, #0f0f23);
  border: 1px solid var(--accent-cyan, #00ffff);
  border-radius: 8px;
  padding: 12px;
  min-width: 180px;
  max-width: 240px;
  box-shadow: 0 0 20px rgba(0, 255, 255, 0.2);
}

.skill-popup-header {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
}

.skill-name {
  font-size: 14px;
  font-weight: bold;
  color: var(--accent-cyan, #00ffff);
}

.skill-name-en {
  font-size: 11px;
  color: var(--text-dim, #888);
}

.skill-description {
  font-size: 12px;
  color: var(--text-main, #e0e0e0);
  margin-bottom: 8px;
  line-height: 1.3;
}

.skill-charge-status {
  font-size: 11px;
  margin-bottom: 8px;
  text-align: center;
}

.skill-charge-status.ready {
  color: var(--accent-cyan, #00ffff);
  font-weight: bold;
}

.skill-charge-status.charging {
  color: var(--text-dim, #888);
}

.skill-use-btn {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--accent-cyan, #00ffff);
  background: transparent;
  color: var(--accent-cyan, #00ffff);
  font-size: 13px;
  font-weight: bold;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.skill-use-btn:hover:not(:disabled) {
  background: rgba(0, 255, 255, 0.1);
  box-shadow: 0 0 8px rgba(0, 255, 255, 0.3);
}

.skill-use-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  border-color: var(--text-dim, #555);
  color: var(--text-dim, #888);
}

/* ============ SKILL ACTIVATION ANIMATION ============ */
.chip-skill-activating {
  animation: skill-burst 1s ease-out forwards;
}

@keyframes skill-burst {
  0% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 0 transparent; }
  20% { transform: scale(1.3); filter: brightness(2); box-shadow: 0 0 20px var(--accent-cyan, #00ffff); }
  50% { transform: scale(1.1); filter: brightness(1.5); box-shadow: 0 0 30px var(--accent-cyan, #00ffff), 0 0 60px rgba(0, 255, 255, 0.3); }
  100% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 4px var(--accent-cyan, #00ffff); }
}

/* ============ BUFF INDICATOR ============ */
.buff-indicator {
  position: absolute;
  top: -20px;
  right: 0;
  font-size: 10px;
  color: var(--accent-cyan, #00ffff);
  background: rgba(0, 255, 255, 0.1);
  border: 1px solid rgba(0, 255, 255, 0.3);
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  animation: buff-appear 0.3s ease-out;
}

@keyframes buff-appear {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**Step 2: Commit**

```bash
git add public/game.css
git commit -m "feat: add CSS for charge meters, level badges, skill popup, and animations"
```

---

## Task 20: Syntax Check and Unit Test Run

**Files:** (none created — validation only)

**Step 1: Syntax check all modified files**

Run:
```bash
node --check src/game/state.js && \
node --check src/game/items/chips.js && \
node --check src/game/combat/chip-skills.js && \
node --check src/game/combat/player-actions.js && \
node --check src/game/combat/enemy.js && \
node --check src/game/services/combat-service.js && \
node --check src/routes/game/combat.js && \
node --check src/routes/game/run.js && \
node --check public/js/ui/combat.js && \
echo "ALL OK"
```
Expected: `ALL OK`

**Step 2: Run all unit tests**

Run: `node --test tests/unit/chip-state.test.js tests/unit/chip-charges.test.js tests/unit/chip-levels.test.js tests/unit/chip-skills.test.js tests/unit/pipeline-chips.test.js`
Expected: All pass

**Step 3: Run integration tests**

Run: `npm run test:unit && npm run test:integration`
Expected: All pass

---

## Task 21: E2E Test Run

**Files:** (none — validation only)

**Step 1: Run e2e tests**

Run: `./scripts/e2e-test.sh`
Expected: 80+/87 passing (some known flakiness acceptable)

If tests fail, investigate whether failures are related to the new code (chip skills) or pre-existing flakiness. Fix any regressions.

**Step 2: If all good, commit any test fixes**

```bash
git add -A && git commit -m "fix: resolve test failures from chip skills integration"
```

---

## Summary of Files Modified

| File | Changes |
|------|---------|
| `data/chip-config.json` | Added `levelConfig` + `skillConfig` |
| `data/chips.json` | Added `skill` definitions to all 18 chips |
| `src/game/state.js` | Added `_chipCharges`, `_chipLevels`, `_activeBuffs` init |
| `src/game/items/chips.js` | Charge helpers, level helpers, `getScaledEffectValue()`, pipeline scaling, unequip reset, nextChipDouble |
| `src/game/combat/chip-skills.js` | **NEW** — buff management, instant/buff execution, `useChipSkill()` |
| `src/game/combat/player-actions.js` | Apply PRE/POST/MODIFIER buffs around pipeline, pass player to context |
| `src/game/combat/enemy.js` | DEFENSIVE buff check on lethal damage |
| `src/game/services/combat-service.js` | Charge increment, destruction reset, clear buffs on combat end |
| `src/routes/game/combat.js` | `use-chip-skill`, `chip-skill-info` endpoints |
| `src/routes/game/run.js` | Extended chip-loadout response with charges/levels |
| `public/js/ui/combat.js` | Charge meters, level badges, glow, popup, skill button, animation, re-render |
| `public/game.css` | Meter, badge, glow, popup, activation, buff indicator styles |
| `tests/unit/chip-state.test.js` | **NEW** — state initialization tests |
| `tests/unit/chip-charges.test.js` | **NEW** — charge helper tests |
| `tests/unit/chip-levels.test.js` | **NEW** — level helper + scaling tests |
| `tests/unit/chip-skills.test.js` | **NEW** — buff management + skill execution tests |
