# Combat Move Mechanics Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the combat-engine support required by `docs/superpowers/specs/2026-05-06-combat-move-mechanics-engine-design.md`: real dex stats, dex initiative, crits, dodge, heal riders, cleanse, poison KOs, and removal of deprecated shield/haste/spd/temp-flat-attack mechanics.

**Architecture:** Reuse the existing stat-stage architecture in `src/game/combat/effects.js` by adding `dex` beside `atk` and `def`. Keep combat behavior shared through `src/game/services/creature-combat-service.js` so PvE and PvP stay mechanically identical. Add required `baseDex` values to all existing creature templates instead of adding runtime fallbacks.

**Tech Stack:** Node.js ES modules, built-in `node:test`, JSON data files, frontend ES modules under `public/js`.

---

## File Structure

- Modify: `data/creatures.json`
  - Add authored `baseDex` to every creature template.
- Modify: `data/moves.json`
  - Convert `Call` (`yobu`) from deprecated haste to `statChanges.dex`.
- Modify: `src/game/combat/effects.js`
  - Add dex stat-stage helpers, crit/dodge math, cleanse, poison KO behavior.
  - Remove deprecated shield/haste/temp flat attack helpers.
- Modify: `src/game/creatures.js`
  - Add dex to stat calculation, instantiation, level-up, and save sync.
- Modify: `src/game/services/creature-combat-service.js`
  - Use crit/dodge helpers in player, enemy, NPC, PvE, and PvP shared move resolution.
  - Remove haste and shield branches.
- Modify: `src/game/services/combat-cycle-service.js`
  - Reset dex stages, clear room-entry dex stages, and resolve poison-KO victory/defeat/XP at round start.
- Modify: `src/game/services/exploration-service.js`
  - Clear dex stages on room entry.
- Modify: `src/game/combat/party-skill-engine.js`
  - Migrate shield/haste buff counting and defensive checks to positive `def` / `dex` stages.
- Modify: `src/pvp/pvp-combat.js`
  - Use dex initiative and remove haste follow-up execution.
- Modify: `public/js/ui/move-effect-label.js`
  - Replace orphaned `spd` label with `dex`.
- Modify: tests under `tests/unit/combat/`, `tests/unit/creature/`, `tests/unit/pvp/`, and `tests/unit/ui/`
  - Add coverage for all new mechanics and remove deprecated expectations.
- Modify: `docs/move-system-reference.md`
  - Update implementation-gap status after the engine work lands.

Do not add the upcoming expanded move set in this implementation.

## Task 1: Dex-Aware Creature Stats and Required Data

**Files:**
- Modify: `data/creatures.json`
- Modify: `src/game/creatures.js`
- Test: `tests/unit/creature/creatures.test.js`

- [ ] **Step 1: Add failing tests for required `baseDex` and dex stat scaling**

In `tests/unit/creature/creatures.test.js`, update the import block to include `syncCreatureDex`:

```js
import {
  getElementMultiplier,
  ELEMENT_CYCLE,
  instantiateCreature,
  instantiateCreatureForCombat,
  getLatestLearnedMoves,
  RARITY_MULTIPLIERS,
  calculateCreatureDamage,
  addXpToCreature,
  xpToNextLevel,
  getStatsForLevel,
  selectTarget,
  generateEnemyCreature,
  generateEnemyCreatures,
  syncCreatureDefense,
  syncCreatureDex
} from '../../../src/game/creatures.js';
```

Add these tests inside `describe('Creature Instantiation', ...)` after the scaled-stats test:

```js
  it('requires authored baseDex on every creature template', () => {
    const missing = creatures
      .filter(creature => typeof creature.baseDex !== 'number' || !Number.isFinite(creature.baseDex))
      .map(creature => creature.id);

    assert.deepStrictEqual(missing, []);
  });

  it('creates a level-5 common creature with scaled dex', () => {
    const creature = instantiateCreature('hi');
    assert.strictEqual(creature.baseDexTemplate, 12);
    assert.strictEqual(creature.dex, 17); // round(12 * 1.4)
  });
```

Update the existing `stores base template values for level-up calculations` test:

```js
  it('stores base template values for level-up calculations', () => {
    const creature = instantiateCreature('hi');
    assert.strictEqual(creature.baseHpTemplate, 50);
    assert.strictEqual(creature.baseAttackTemplate, 20);
    assert.strictEqual(creature.baseDefenseTemplate, 5);
    assert.strictEqual(creature.baseDexTemplate, 12);
  });
```

Update the `Creature Leveling` stat test:

```js
  it('+10% stats per level', () => {
    const stats = getStatsForLevel(100, 20, 80, 3, 5, 10);
    assert.strictEqual(stats.maxHp, 120);
    assert.strictEqual(stats.attack, 24);
    assert.strictEqual(stats.maxMp, 96);
    assert.strictEqual(stats.defense, 6);
    assert.strictEqual(stats.dex, 12);
  });
```

Add this `syncCreatureDex` describe block after `describe('syncCreatureDefense', ...)`:

```js
describe('syncCreatureDex', () => {
  it('fills missing template and dex from catalog + level', () => {
    const c = instantiateCreature('hi', 6);
    delete c.baseDexTemplate;
    delete c.dex;

    syncCreatureDex(c);

    assert.strictEqual(c.baseDexTemplate, 12);
    assert.strictEqual(c.dex, 18); // round(12 * 1.5) at L6
  });

  it('throws if a saved creature references an unknown template', () => {
    const c = { id: 'missing-template', level: 5 };
    assert.throws(() => syncCreatureDex(c), /Creature template not found/);
  });
});
```

- [ ] **Step 2: Run the creature tests and verify failure**

Run:

```bash
npm run test:unit -- --test-name-pattern="Creature Instantiation|Creature Leveling|syncCreatureDex"
```

Expected: fails because `baseDex` is absent, `getStatsForLevel()` does not return `dex`, and `syncCreatureDex` is not exported.

- [ ] **Step 3: Add authored `baseDex` values to every creature**

Edit `data/creatures.json`. Insert `baseDex` immediately after `baseDefense` for each creature:

```json
{ "id": "hi", "baseDex": 12 }
{ "id": "mizu", "baseDex": 10 }
{ "id": "ki", "baseDex": 10 }
{ "id": "ishi", "baseDex": 6 }
{ "id": "ishino-kyojin", "baseDex": 5 }
{ "id": "tetsu", "baseDex": 7 }
{ "id": "kaze", "baseDex": 16 }
{ "id": "mushi", "baseDex": 13 }
{ "id": "hana", "baseDex": 8 }
{ "id": "tori", "baseDex": 15 }
{ "id": "sakana", "baseDex": 8 }
{ "id": "neko", "baseDex": 14 }
{ "id": "inu", "baseDex": 12 }
{ "id": "hineko", "baseDex": 15 }
{ "id": "fukurou", "baseDex": 12 }
{ "id": "chou", "baseDex": 15 }
{ "id": "hachi", "baseDex": 14 }
{ "id": "ari", "baseDex": 10 }
```

Use JSON object fields, not the compact examples above. For example, the first creature should become:

```json
    "baseHp": 50,
    "baseAttack": 20,
    "baseMp": 50,
    "baseDefense": 5,
    "baseDex": 12,
    "baseWord": "火",
```

- [ ] **Step 4: Add dex stat plumbing in `src/game/creatures.js`**

Add a validator near the constants:

```js
function requireBaseDex(template) {
  if (!template || typeof template.baseDex !== 'number' || !Number.isFinite(template.baseDex)) {
    throw new Error(`Creature template missing numeric baseDex: ${template?.id || 'unknown'}`);
  }
  return template.baseDex;
}
```

Update `instantiateCreature()`:

```js
  const baseMp = template.baseMp || 80;
  const baseDef = template.baseDefense ?? 5;
  const baseDex = requireBaseDex(template);
  const { maxHp, attack, maxMp, defense, dex } = getStatsForLevel(
    Math.floor(template.baseHp * rarityMult),
    Math.floor(template.baseAttack * rarityMult),
    Math.floor(baseMp * rarityMult),
    startingLevel,
    Math.floor(baseDef * rarityMult),
    Math.floor(baseDex * rarityMult)
  );
```

Add fields to the returned creature:

```js
    defense,
    dex,
    mp: maxMp,
    maxMp,
    baseHpTemplate: template.baseHp,
    baseAttackTemplate: template.baseAttack,
    baseDefenseTemplate: baseDef,
    baseDexTemplate: baseDex,
    baseMpTemplate: baseMp,
```

Replace `getStatsForLevel()` with:

```js
export function getStatsForLevel(baseHp, baseAttack, baseMp, level, baseDefense = 5, baseDex) {
  if (typeof baseDex !== 'number' || !Number.isFinite(baseDex)) {
    throw new Error('getStatsForLevel requires numeric baseDex');
  }

  const mult = 1 + (level - 1) * 0.1;
  return {
    maxHp: Math.floor(baseHp * mult),
    attack: Math.floor(baseAttack * mult),
    maxMp: Math.floor(baseMp * mult),
    defense: Math.max(1, Math.round(baseDefense * mult)),
    dex: Math.max(1, Math.round(baseDex * mult))
  };
}
```

Add `syncCreatureDex()` after `syncCreatureDefense()`:

```js
export function syncCreatureDex(creature) {
  if (!creature || !creature.id) return;
  const template = CREATURES_BY_ID[creature.id];
  if (!template) throw new Error(`Creature template not found: ${creature.id}`);

  const baseDex = requireBaseDex(template);
  creature.baseDexTemplate = baseDex;

  const rarityMult = RARITY_MULTIPLIERS[creature.rarity] || 1.0;
  const scaledBaseDex = Math.floor(baseDex * rarityMult);
  const level = Math.max(1, creature.level || 1);
  const mult = 1 + (level - 1) * 0.1;
  creature.dex = Math.max(1, Math.round(scaledBaseDex * mult));
}
```

Update `syncCreatureDefense()` to call dex sync at the end:

```js
  creature.defense = Math.max(1, Math.round(baseDef * mult));
  syncCreatureDex(creature);
```

Update `addXpToCreature()` level-up stat calculation:

```js
    const baseDex = Math.floor((creature.baseDexTemplate ?? requireBaseDex(CREATURES_BY_ID[creature.id])) * rarityMult);
    const stats = getStatsForLevel(baseHp, baseAtk, baseMp, creature.level, baseDef, baseDex);
```

Then set and report dex:

```js
    creature.dex = stats.dex;
```

```js
        dex: lu.dex,
```

- [ ] **Step 5: Run creature tests and verify pass**

Run:

```bash
npm run test:unit -- --test-name-pattern="Creature Instantiation|Creature Leveling|syncCreatureDex"
```

Expected: pass.

## Task 2: Effects Helpers, Dex Stage Math, Cleanse, Crit, Dodge, Poison KOs

**Files:**
- Modify: `src/game/combat/effects.js`
- Test: `tests/unit/combat/effects.test.js`

- [ ] **Step 1: Update effect tests for dex stages and new helpers**

Update the import block in `tests/unit/combat/effects.test.js` to remove deprecated imports and add new helpers:

```js
import {
  tickEffects,
  applyPoison,
  applyHeal,
  applySleep,
  applyStun,
  applyConfuse,
  applyTaunt,
  applyCleanse,
  initStatStages,
  resetStatStages,
  applyStatChange,
  applyStatChanges,
  getStageMultiplier,
  getAttackMultiplier,
  getDefenseMultiplier,
  getDexMultiplier,
  getEffectiveDex,
  computeCritChance,
  rollCritical,
  computeDexHitChance,
  rollDodge,
  isIncapacitated,
  isConfused,
  getTauntTarget,
  breakSleep
} from '../../../src/game/combat/effects.js';
```

Update the stat-stage expectations:

```js
    assert.deepStrictEqual(creature.statStages, { atk: 0, def: 0, dex: 0 });
```

```js
    const creature = { statStages: { atk: 3, def: -1 } };
    initStatStages(creature);
    assert.deepStrictEqual(creature.statStages, { atk: 3, def: -1, dex: 0 });
```

```js
    assert.deepStrictEqual(creature.statStages, { atk: 0, def: 0, dex: 0 });
```

Remove the existing describe blocks for:

- `Combat Effects - Apply Haste`
- `Combat Effects - Apply Shield`
- `Combat Effects - Apply Team Shield`
- `Temp Attack Flat`

Remove query-helper tests for `hasHaste`, `consumeHaste`, and `getDamageReduction`.

Replace the poison floor test with:

```js
  it('can reduce HP to 0 from poison', () => {
    const creature = { id: 'p', nameEn: 'Poisoned', hp: 5, maxHp: 100, activeEffects: [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 10, sourceId: 'attacker' }
    ]};

    const events = tickEffects(creature);

    assert.strictEqual(creature.hp, 0);
    assert.strictEqual(events[0].damage, 5);
    assert.strictEqual(events[0].targetDefeated, true);
    assert.strictEqual(events[0].sourceId, 'attacker');
  });
```

Add new tests after the taunt tests:

```js
describe('Combat Effects - Apply Cleanse', () => {
  it('removes negative status effects and keeps taunt', () => {
    const target = {
      activeEffects: [
        { type: 'poison', remainingTurns: 2 },
        { type: 'sleep', remainingTurns: 1 },
        { type: 'stun', remainingTurns: 1 },
        { type: 'confuse', remainingTurns: 2 },
        { type: 'taunt', remainingTurns: 2 }
      ],
      statStages: { atk: -1, def: 2, dex: -2 }
    };

    applyCleanse(target);

    assert.deepStrictEqual(target.activeEffects.map(e => e.type), ['taunt']);
    assert.deepStrictEqual(target.statStages, { atk: -1, def: 2, dex: -2 });
  });
});

describe('Combat Effects - Dex Math', () => {
  it('getDexMultiplier delegates to stage system', () => {
    const creature = { dex: 20, statStages: { atk: 0, def: 0, dex: 1 } };
    assert.strictEqual(getDexMultiplier(creature), 1.5);
  });

  it('getEffectiveDex applies dex stage multiplier', () => {
    const creature = { dex: 20, statStages: { atk: 0, def: 0, dex: 1 } };
    assert.strictEqual(getEffectiveDex(creature), 30);
  });

  it('computeCritChance clamps between 3% and 25%', () => {
    assert.strictEqual(computeCritChance({ dex: 1, statStages: { dex: -6 } }), 0.03);
    assert.strictEqual(computeCritChance({ dex: 999, statStages: { dex: 6 } }), 0.25);
  });

  it('rollCritical returns roll result and chance', () => {
    const result = rollCritical({ dex: 20, statStages: { dex: 0 } }, () => 0.01);
    assert.strictEqual(result.critical, true);
    assert.ok(result.critChance > 0.03);
  });

  it('computeDexHitChance caps defender dodge at 30%', () => {
    const attacker = { statStages: { dex: -6 } };
    const defender = { statStages: { dex: 6 } };
    const result = computeDexHitChance(attacker, defender);
    assert.strictEqual(result.hitChance, 0.70);
    assert.strictEqual(result.dodgeChance, 0.30);
  });

  it('rollDodge marks a dodge when roll is inside dodge chance', () => {
    const attacker = { statStages: { dex: -6 } };
    const defender = { statStages: { dex: 6 } };
    const result = rollDodge(attacker, defender, () => 0.29);
    assert.strictEqual(result.dodged, true);
  });
});
```

- [ ] **Step 2: Run effect tests and verify failure**

Run:

```bash
npm run test:unit -- --test-name-pattern="Combat Effects"
```

Expected: fails because the new helpers are missing and deprecated helper imports were removed.

- [ ] **Step 3: Implement effects helpers and poison KO behavior**

In `src/game/combat/effects.js`, replace stat-stage initialization with:

```js
const STAGE_MIN = -6;
const STAGE_MAX = 6;
const STAT_STAGE_DEFAULTS = { atk: 0, def: 0, dex: 0 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function initStatStages(creature) {
  creature.statStages = { ...STAT_STAGE_DEFAULTS, ...(creature.statStages || {}) };
}

export function resetStatStages(creature) {
  creature.statStages = { ...STAT_STAGE_DEFAULTS };
}
```

Update poison inside `tickEffects()`:

```js
    if (effect.type === 'poison') {
      const damage = Math.max(0, Math.min(effect.damagePerTurn, creature.hp));
      creature.hp = Math.max(0, creature.hp - damage);
      effect.remainingTurns -= 1;
      events.push({
        type: 'poison',
        targetId: creature.id,
        targetName: creature.nameEn,
        damage,
        remainingTurns: effect.remainingTurns,
        targetDefeated: creature.hp <= 0,
        sourceId: effect.sourceId,
      });
    } else if (effect.remainingTurns !== undefined) {
```

Delete haste-specific tick handling. Haste should no longer persist or be consumed.

Add cleanse and dex helpers after `applyTaunt()`:

```js
export function applyCleanse(target) {
  if (!target.activeEffects) return;
  const negative = new Set(['poison', 'sleep', 'stun', 'confuse']);
  target.activeEffects = target.activeEffects.filter(effect => !negative.has(effect.type));
}
```

Add query helpers:

```js
export function getDexMultiplier(creature) {
  return getStageMultiplier(creature, 'dex');
}

export function getEffectiveDex(creature) {
  const dex = Math.max(1, Math.round(Number(creature?.dex) || 1));
  return Math.max(1, Math.round(dex * getDexMultiplier(creature)));
}

export function computeCritChance(creature) {
  return clamp((getEffectiveDex(creature) + 8) / 256, 0.03, 0.25);
}

export function rollCritical(creature, rng = Math.random) {
  const critChance = computeCritChance(creature);
  return { critical: rng() < critChance, critChance };
}

export function computeDexHitChance(attacker, defender) {
  const attackerDexStage = attacker?.statStages?.dex || 0;
  const defenderDexStage = defender?.statStages?.dex || 0;
  const stageDelta = clamp(attackerDexStage - defenderDexStage, STAGE_MIN, STAGE_MAX);
  const rawHitChance = Math.max(3, 3 + stageDelta) / Math.max(3, 3 - stageDelta);
  const hitChance = clamp(rawHitChance, 0.70, 1.00);
  return { hitChance, dodgeChance: 1 - hitChance, stageDelta };
}

export function rollDodge(attacker, defender, rng = Math.random) {
  const result = computeDexHitChance(attacker, defender);
  return { ...result, dodged: rng() < result.dodgeChance };
}
```

Remove these exports and their helper bodies:

- `applyHaste`
- `applyShield`
- `applyTeamShield`
- `hasHaste`
- `consumeHaste`
- `getDamageReduction`
- `applyTempAttackFlat`
- `getFlatAttackBonus`

- [ ] **Step 4: Run effect tests and verify pass**

Run:

```bash
npm run test:unit -- --test-name-pattern="Combat Effects"
```

Expected: pass.

## Task 3: Move Data and UI Labels for Dex

**Files:**
- Modify: `data/moves.json`
- Modify: `public/js/ui/move-effect-label.js`
- Test: `tests/unit/ui/move-effect-label.test.js`
- Test: `tests/unit/creature/creatures.test.js`

- [ ] **Step 1: Add failing tests for `Call` and dex labels**

In `tests/unit/creature/creatures.test.js`, add this test near other move-data tests:

```js
  it('uses dex stat stages instead of haste for Call', () => {
    const call = moves.find(move => move.id === 'yobu');

    assert.strictEqual(call.category, 'buff');
    assert.strictEqual(call.target, 'all_allies');
    assert.deepStrictEqual(call.statChanges, { dex: 1 });
    assert.ok(!('statusEffect' in call) || call.statusEffect == null);
  });
```

In `tests/unit/ui/move-effect-label.test.js`, add:

```js
  it('renders dex stat changes', () => {
    const move = { category: 'buff', statChanges: { dex: 1 } };
    assert.deepStrictEqual(effectLabel(move), { iconType: 'chevron-up', text: 'Dex +1' });
  });
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:unit -- --test-name-pattern="Call|move effect label|dex stat changes"
```

Expected: fails because `Call` still uses haste and the label uses `spd`.

- [ ] **Step 3: Update `Call` in `data/moves.json`**

Replace the `yobu` move body fields:

```json
    "category": "buff",
    "target": "all_allies",
    "power": 0,
    "mpCost": 14,
    "statChanges": {
      "dex": 1
    },
    "tier": 1,
    "description": "Calls out to the whole team, raising dexterity by 1 stage.",
```

Remove `statusEffect`, `statusChance`, and `statusDuration` from `yobu`.

- [ ] **Step 4: Update `move-effect-label.js`**

Replace the top constants with:

```js
const STAT_LABELS = { atk: 'Atk', def: 'Def', dex: 'Dex' };
const STAT_PRIORITY = ['atk', 'def', 'dex'];
```

- [ ] **Step 5: Run label and move-data tests**

Run:

```bash
npm run test:unit -- --test-name-pattern="Call|move effect label|dex stat changes"
node --check public/js/ui/move-effect-label.js
```

Expected: pass and syntax check prints no errors.

## Task 4: Shared Move Resolution for Dodge, Crit, Heal Riders, and Cleanse

**Files:**
- Modify: `src/game/services/creature-combat-service.js`
- Test: `tests/unit/combat/creature-combat-service.test.js`

- [ ] **Step 1: Add failing move-resolution tests**

In `tests/unit/combat/creature-combat-service.test.js`, add tests inside `describe('Creature Combat - Status Effects in Move Turn', ...)`:

```js
  it('dodged damage move skips damage, status, and stat riders', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    allies[0].statStages = { atk: 0, def: 0, dex: -6 };
    enemies[0].statStages = { atk: 0, def: 0, dex: 6 };
    const startHp = enemies[0].hp;
    const move = {
      id: 'slow-poison-hit',
      name: '毒打', nameEn: 'Poison Hit', reading: 'どくだ',
      element: 'neutral', category: 'damage', target: 'single_enemy',
      power: 20, mpCost: 0, statusEffect: 'poison', statusChance: 100,
      statusDuration: 2, statChanges: { atk: -1 }
    };
    allies[0].moves = [move];

    const origRandom = Math.random;
    Math.random = () => 0.01;
    try {
      const result = processMoveTurn(allies, enemies, [{ creatureIndex: 0, moveId: 'slow-poison-hit', targetIndex: 0 }]);
      assert.strictEqual(result.attacks[0].dodged, true);
      assert.strictEqual(result.attacks[0].damage, 0);
      assert.strictEqual(enemies[0].hp, startHp);
      assert.deepStrictEqual(enemies[0].activeEffects, []);
      assert.strictEqual(enemies[0].statStages.atk, 0);
    } finally {
      Math.random = origRandom;
    }
  });

  it('critical damage marks attack record and increases damage', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    allies[0].dex = 999;
    allies[0].statStages = { atk: 0, def: 0, dex: 6 };
    enemies[0].statStages = { atk: 0, def: 0, dex: 0 };
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;

    const origRandom = Math.random;
    Math.random = () => 0.01;
    try {
      const result = processMoveTurn(allies, enemies, [{ creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }]);
      assert.strictEqual(result.attacks[0].critical, true);
      assert.ok(result.attacks[0].damage > 0);
    } finally {
      Math.random = origRandom;
    }
  });

  it('heal moves apply cleanse and stat riders to allies', () => {
    const allies = [instantiateCreature('mizu')];
    allies[0].hp = 10;
    allies[0].activeEffects = [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: 'x' },
      { type: 'taunt', remainingTurns: 2, sourceId: 'y' }
    ];
    allies[0].statStages = { atk: 0, def: 0, dex: 0 };
    const enemies = [instantiateCreature('hi')];
    const move = {
      id: 'cleanse-heal',
      name: '清癒', nameEn: 'Cleanse Heal', reading: 'せいゆ',
      element: 'neutral', category: 'heal', target: 'self',
      power: 20, mpCost: 0, statusEffect: 'cleanse', statusChance: 100,
      statChanges: { dex: 1 }
    };
    allies[0].moves = [move];

    const result = processMoveTurn(allies, enemies, [{ creatureIndex: 0, moveId: 'cleanse-heal', targetIndex: 0 }]);

    assert.ok(result.attacks[0].healAmount > 0);
    assert.strictEqual(result.attacks[0].effectApplied, 'cleanse');
    assert.deepStrictEqual(allies[0].activeEffects.map(e => e.type), ['taunt']);
    assert.strictEqual(allies[0].statStages.dex, 1);
  });
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:unit -- --test-name-pattern="dodged damage|critical damage|heal moves apply cleanse"
```

Expected: fails because move resolution has no dodge/crit and heal riders are not wired.

- [ ] **Step 3: Update imports and attack-record defaults**

In `src/game/services/creature-combat-service.js`, replace the effects import with the current helper set:

```js
import {
  applyHeal, applyPoison, tickEffects,
  applySleep, applyStun, applyConfuse,
  applyTaunt, applyCleanse,
  applyStatChanges, resetStatStages,
  isIncapacitated, isConfused,
  getAttackMultiplier, getDefenseMultiplier, getTauntTarget, breakSleep,
  rollCritical, rollDodge
} from '../combat/effects.js';
```

Update `buildAttackRecord()` defaults:

```js
    critical: false,
    critChance: null,
    dodged: false,
    hitChance: 1,
    dodgeChance: 0,
```

Remove `getFlatAttackBonus()` from `rollMoveDamage()`:

```js
  let buffedAttack = buffs ? getBuffedAttack(attacker.attack, buffs, attacker.level) : attacker.attack;
  buffedAttack = Math.floor(buffedAttack * getAttackMultiplier(attacker));
```

- [ ] **Step 4: Add cleanse support to `tryApplyStatus()`**

Replace the status switch with no haste/shield cases:

```js
  switch (move.statusEffect) {
    case 'poison': {
      const damagePerTurn = Math.max(1, Math.floor((caster.attack / 10) * move.power * 0.2));
      applyPoison(target, { damagePerTurn, duration, sourceId });
      return 'poison';
    }
    case 'sleep':
      applySleep(target, { duration, sourceId });
      return 'sleep';
    case 'stun':
      applyStun(target, { sourceId });
      return 'stun';
    case 'confuse':
      applyConfuse(target, { duration, sourceId });
      return 'confuse';
    case 'taunt':
      applyTaunt(target, { duration, sourceId });
      return 'taunt';
    case 'cleanse':
      applyCleanse(target);
      return 'cleanse';
    default:
      return null;
  }
```

- [ ] **Step 5: Add shared dodge/crit helpers in `creature-combat-service.js`**

Add after `tryApplyStatChanges()`:

```js
function isHostileTarget(target, enemies) {
  return Array.isArray(enemies) && enemies.includes(target);
}

function canMoveBeDodged(move, target, enemies) {
  if (!isHostileTarget(target, enemies)) return false;
  return move.category === 'damage' || move.category === 'drain' || move.category === 'debuff';
}

function resolveDodge(attacker, target, move, enemies) {
  if (!canMoveBeDodged(move, target, enemies)) {
    return { dodged: false, hitChance: 1, dodgeChance: 0 };
  }
  return rollDodge(attacker, target);
}

function applyCriticalDamage(attacker, move, damage) {
  if (move.category !== 'damage' && move.category !== 'drain') {
    return { damage, critical: false, critChance: null };
  }
  const crit = rollCritical(attacker);
  return {
    damage: crit.critical ? Math.floor(damage * 1.5) : damage,
    critical: crit.critical,
    critChance: crit.critChance
  };
}
```

- [ ] **Step 6: Wire dodge and crit in `executeMove()` damage/drain branches**

In both `case 'damage'` and `case 'drain'`, before rolling variance:

```js
        const dodge = resolveDodge(creature, target, move, enemies);
        if (dodge.dodged) {
          attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
            dodged: true,
            hitChance: dodge.hitChance,
            dodgeChance: dodge.dodgeChance,
            stab,
            elementMultiplier: getElementMultiplier(move.element, target.element)
          }));
          continue;
        }
```

After `rollMoveDamage(...)`:

```js
        const crit = applyCriticalDamage(creature, move, damage);
        damage = crit.damage;
```

Include crit fields in `buildAttackRecord()` overrides:

```js
          damage,
          critical: crit.critical,
          critChance: crit.critChance,
          stab,
          elementMultiplier: getElementMultiplier(move.element, target.element),
          targetDefeated,
          effectApplied,
          statChangesApplied
```

- [ ] **Step 7: Wire heal riders**

In `case 'heal'`, after `applyHeal()`:

```js
        const effectApplied = move.statusEffect ? tryApplyStatus(move, target, creature, allies) : null;
        const statChangesApplied = tryApplyStatChanges(move, target);

        attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
          healAmount,
          effectApplied,
          statChangesApplied
        }));
```

- [ ] **Step 8: Wire legacy `processEnemyTurn()` path**

In `buildEnemyActionRecord()`, apply the same dodge/crit behavior for `damage` and `drain`. Use the same helper calls:

```js
      const dodge = resolveDodge(enemy, target, move, targetSide === 'player' ? allies : []);
      if (dodge.dodged) {
        rec.dodged = true;
        rec.hitChance = dodge.hitChance;
        rec.dodgeChance = dodge.dodgeChance;
        rec.elementMultiplier = getElementMultiplier(move.element, target.element);
        break;
      }
```

After damage is calculated:

```js
      const crit = applyCriticalDamage(enemy, move, damage);
      damage = crit.damage;
      rec.critical = crit.critical;
      rec.critChance = crit.critChance;
```

For the enemy heal branch, add:

```js
      if (move.statusEffect) rec.effectApplied = tryApplyStatus(move, target, enemy, enemies);
      rec.statChangesApplied = tryApplyStatChanges(move, target);
```

Delete the `case 'shield'` branch.

- [ ] **Step 9: Run move-resolution tests**

Run:

```bash
npm run test:unit -- --test-name-pattern="dodged damage|critical damage|heal moves apply cleanse|Status Effects in Enemy Turn"
```

Expected: pass after removing or rewriting obsolete haste/shield tests in this file.

## Task 5: Dex Initiative and Haste Removal in PvE/PvP

**Files:**
- Modify: `src/game/services/creature-combat-service.js`
- Modify: `src/pvp/pvp-combat.js`
- Test: `tests/unit/combat/creature-combat-service.test.js`
- Test: `tests/unit/pvp/pvp-combat.test.js`

- [ ] **Step 1: Add failing initiative tests**

In `tests/unit/pvp/pvp-combat.test.js`, update `makeCreature()` to include dex fields:

```js
    attack: 15, defense: 5, dex: 10,
    statStages: { atk: 0, def: 0, dex: 0 },
```

Replace the `buildTurnOrder` level-sort test with:

```js
  it('sorts by effective dex descending before level', () => {
    const a1 = makeCreature({ level: 99, dex: 5, statStages: { atk: 0, def: 0, dex: 0 } });
    const a2 = makeCreature({ level: 7, dex: 12, statStages: { atk: 0, def: 0, dex: 1 } });
    const b1 = makeCreature({ level: 5, dex: 15, statStages: { atk: 0, def: 0, dex: 0 } });

    const order = buildTurnOrder([a1, a2], [b1]);

    assert.strictEqual(order[0].creature, a2, 'dex 12 at +1 becomes effective dex 18');
    assert.strictEqual(order[1].creature, b1, 'dex 15 goes second');
    assert.strictEqual(order[2].creature, a1, 'higher level loses to lower dex');
  });
```

Replace the PvP initiative test:

```js
  it('resolves damage in initiative order by effective dex', () => {
    sideA[0].level = 50;
    sideA[0].dex = 5;
    sideA[0].statStages = { atk: 0, def: 0, dex: 0 };
    sideB[0].level = 3;
    sideB[0].dex = 20;
    sideB[0].statStages = { atk: 0, def: 0, dex: 0 };
    sideA[0].maxHp = 500;
    sideA[0].hp = 500;

    const result = resolveRound(sideA, sideB, movesA, movesB);

    assert.ok(result.attacks.length >= 1);
    assert.strictEqual(result.attacks[0].side, 'sideB', 'higher dex side B should strike before higher level side A');
  });
```

Remove `counter-kill prevents subsequent haste attacks in PvP`; haste no longer exists.

In `tests/unit/combat/creature-combat-service.test.js`, remove the hasted ally and hasted enemy tests. Add:

```js
  it('processInterleavedPvERound resolves higher dex before higher level', () => {
    const slowHighLevel = instantiateCreature('ishi', 20);
    const fastLowLevel = instantiateCreature('kaze', 5);
    slowHighLevel.dex = 5;
    fastLowLevel.dex = 30;
    slowHighLevel.statStages = { atk: 0, def: 0, dex: 0 };
    fastLowLevel.statStages = { atk: 0, def: 0, dex: 0 };
    slowHighLevel.moves = [{
      id: 'slow-hit', name: '遅打', nameEn: 'Slow Hit', reading: 'おそだ',
      element: 'neutral', category: 'damage', target: 'single_enemy', power: 5, mpCost: 0
    }];
    fastLowLevel.moves = [{
      id: 'fast-hit', name: '速打', nameEn: 'Fast Hit', reading: 'はやだ',
      element: 'neutral', category: 'damage', target: 'single_enemy', power: 5, mpCost: 0
    }];

    const result = processInterleavedPvERound(
      [slowHighLevel],
      [fastLowLevel],
      [{ creatureIndex: 0, moveId: 'slow-hit', targetIndex: 0 }]
    );

    assert.strictEqual(result.enemyAttacks[0].attackerId, fastLowLevel.id);
  });
```

- [ ] **Step 2: Run initiative tests and verify failure**

Run:

```bash
npm run test:unit -- --test-name-pattern="effective dex|initiative order"
```

Expected: fails because initiative still sorts by level and haste code still exists.

- [ ] **Step 3: Update PvP initiative**

In `src/pvp/pvp-combat.js`, import `getEffectiveDex` instead of haste helpers:

```js
import { getEffectiveDex, isIncapacitated } from '../game/combat/effects.js';
```

Update `buildTurnOrder()` sort:

```js
  entries.sort((a, b) => {
    const dexDiff = getEffectiveDex(b.creature) - getEffectiveDex(a.creature);
    if (dexDiff !== 0) return dexDiff;
    const levelDiff = (b.creature.level || 1) - (a.creature.level || 1);
    if (levelDiff !== 0) return levelDiff;
    return Math.random() - 0.5;
  });
```

Remove `hastedA` and `hastedB` collection. In the `executeSlotMoveTurn()` call, remove `hastedSlots`.

Update the local `initiative` array to store dex:

```js
      initiative.push({ side: 'sideA', index: idx, level: c.level || 1, dex: getEffectiveDex(c) });
```

```js
      initiative.push({ side: 'sideB', index: idx, level: c.level || 1, dex: getEffectiveDex(c) });
```

Sort it:

```js
  initiative.sort((a, b) => {
    const dexDiff = (b.dex || 1) - (a.dex || 1);
    if (dexDiff !== 0) return dexDiff;
    const levelDiff = (b.level || 1) - (a.level || 1);
    if (levelDiff !== 0) return levelDiff;
    return Math.random() - 0.5;
  });
```

- [ ] **Step 4: Update PvE initiative and remove haste execution**

In `src/game/services/creature-combat-service.js`, import `getEffectiveDex` from effects.

Remove hasted slot collection in:

- `processMoveTurn()`
- `executeSlotMoveTurn()`
- `processInterleavedPvERound()`
- `processEnemyTurn()`

In `executeSlotMoveTurn()`, remove the `hastedSlots` option and this follow-up block:

```js
    if (hastedSlots?.has(slotIndex)) {
      runOneExecute();
      if (stopped) break;
    }
```

In `processInterleavedPvERound()`, push dex into initiative slots:

```js
      initiative.push({ kind: 'ally', index: allyIndex, level: c.level || 1, dex: getEffectiveDex(c) });
```

```js
      initiative.push({ kind: 'enemy', index: ei, level: e.level || 1, dex: getEffectiveDex(e) });
```

Sort it:

```js
  initiative.sort((a, b) => {
    const dexDiff = (b.dex || 1) - (a.dex || 1);
    if (dexDiff !== 0) return dexDiff;
    const levelDiff = (b.level || 1) - (a.level || 1);
    if (levelDiff !== 0) return levelDiff;
    return Math.random() - 0.5;
  });
```

In `processEnemyTurn()`, replace:

```js
    const attackCount = hasHaste(enemy) ? 2 : 1;
```

with:

```js
    const attackCount = 1;
```

- [ ] **Step 5: Run PvE/PvP initiative tests**

Run:

```bash
npm run test:unit -- --test-name-pattern="buildTurnOrder|resolveRound|processInterleavedPvERound"
```

Expected: pass once all haste references in these files are removed.

## Task 6: Poison KO Flow in Combat Cycles and PvP

**Files:**
- Modify: `src/game/services/creature-combat-service.js`
- Modify: `src/game/services/combat-cycle-service.js`
- Modify: `src/pvp/pvp-combat.js`
- Test: `tests/unit/combat/effects.test.js`
- Test: `tests/unit/combat/creature-combat-service.test.js`
- Test: `tests/unit/pvp/pvp-combat.test.js`

- [ ] **Step 1: Update poison tests for KO semantics**

In `tests/unit/combat/creature-combat-service.test.js`, update the existing `tickAllEffects` poison tests so a creature at low HP can be defeated:

```js
  it('tickAllEffects allows poison to KO enemies', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    enemies[0].hp = 3;
    enemies[0].activeEffects = [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: allies[0].id }
    ];

    const events = tickAllEffects(allies, enemies);

    assert.strictEqual(enemies[0].hp, 0);
    assert.strictEqual(events[0].targetSide, 'enemy');
    assert.strictEqual(events[0].targetIndex, 0);
    assert.strictEqual(events[0].targetDefeated, true);
  });
```

In `tests/unit/pvp/pvp-combat.test.js`, replace the draw test body with:

```js
  it('returns draw when both sides are KO after poison effects', () => {
    sideA[0].hp = 1;
    sideA[0].activeEffects = [{ type: 'poison', damagePerTurn: 10, remainingTurns: 2, sourceId: 'b1' }];
    sideB[0].hp = 1;
    sideB[0].activeEffects = [{ type: 'poison', damagePerTurn: 10, remainingTurns: 2, sourceId: 'a1' }];

    const result = resolveRound(sideA, sideB, [], []);

    assert.strictEqual(sideA[0].hp, 0);
    assert.strictEqual(sideB[0].hp, 0);
    assert.strictEqual(result.winner, 'draw');
  });
```

- [ ] **Step 2: Run poison tests and verify failure**

Run:

```bash
npm run test:unit -- --test-name-pattern="poison"
```

Expected: fails where tests still expect poison to leave HP at 1 or PvP draw is manually forced.

- [ ] **Step 3: Ensure `tickAllEffects()` preserves KO metadata**

In `src/game/services/creature-combat-service.js`, `tickAllEffects()` already appends `targetSide` and `targetIndex`. Keep that behavior and rely on the `tickEffects()` event fields added in Task 2:

```js
events.push({ ...ev, targetSide: side, targetIndex: index });
```

- [ ] **Step 4: Add poison-KO rewards and start-of-round terminal checks in `combat-cycle-service.js`**

Update the import from `creature-combat-service.js`:

```js
  awardKillXp,
```

Add a helper method inside `CombatCycleService`:

```js
  _collectPoisonKoXpEvents(effectEvents, metaMults) {
    const xpEvents = [];
    const defeatedEnemyIndices = new Set();
    for (const event of effectEvents || []) {
      if (event.type !== 'poison') continue;
      if (event.targetSide !== 'enemy') continue;
      if (!event.targetDefeated) continue;
      if (typeof event.targetIndex !== 'number') continue;
      if (defeatedEnemyIndices.has(event.targetIndex)) continue;

      const enemy = this.gm.combat.enemies[event.targetIndex];
      if (!enemy) continue;

      defeatedEnemyIndices.add(event.targetIndex);
      const xpEvent = awardKillXp(
        this.gm.run.creatureParty,
        enemy.level,
        this.gm.run.itemBuffs?.xpMultiplier,
        this.gm.run.itemBuffs?.xpBalanceStacks,
        metaMults,
        this.gm.run.itemBuffs
      );
      xpEvents.push({ enemyId: enemy.id, enemyIndex: event.targetIndex, enemyName: enemy.nameEn, ...xpEvent });
    }
    return xpEvents;
  }
```

At the top of `_handleCreatureAttackTurn()`, after `roundStartEvents` and `metaMults` are available, add:

```js
    const poisonXpEvents = this._collectPoisonKoXpEvents(effectEvents, metaMults);
    if (poisonXpEvents.length > 0) {
      this.gm.run.player.credits = (this.gm.run.player.credits || 0) + poisonXpEvents.length * CREDITS_PER_KILL;
    }
    if (checkAllDefeated(this.gm.combat.enemies)) {
      collectElementDrops(this.gm.meta, this.gm.combat.enemies, this.gm.run?.runSummary);
      finalizeCombatVictory(this.gm.combat, this.gm.run, { meta: this.gm.meta, narrate: (t) => this.gm.narrate(t) });
      const tutorialRewards = this._collectTutorialRewards();
      this.gm.emitState();
      return {
        actionType: 'attack',
        barks: [],
        playerAttacks: [],
        enemyAttacks: [],
        npcSkillAttacks: [],
        npcSkillUsed: null,
        counterAttacks: [],
        xpEvents: poisonXpEvents,
        mpRegens: [],
        effectEvents,
        roundStartEvents,
        combatEnded: true,
        victory: true,
        allies: this.gm.combat.allies,
        creatureParty: this.gm.run.creatureParty,
        enemies: this.gm.combat.enemies,
        newCollectionAdditions: [],
        tutorialRewards,
        elementDropsCollected: getElementDropList(this.gm.combat.enemies)
      };
    }
```

When merging normal attack result XP, include poison XP:

```js
    playerResult.xpEvents = [...poisonXpEvents, ...(playerResult.xpEvents || [])];
```

Add equivalent terminal checks to `_handleCreatureDefendTurn()` and `_handleCreatureBefriendTurn()` with `actionType: 'defend'` or `actionType: 'befriend'`. These paths should not run enemy attacks if poison already ended the battle.

- [ ] **Step 5: Update PvP poison KO winner logic**

In `src/pvp/pvp-combat.js`, after `effectEvents` and `roundStartEvents` are computed, keep existing flow but ensure the initiative builders skip newly KO'd creatures. The existing `hp > 0` checks should handle this after Task 2. Ensure winner computation at the end uses `checkAllDefeated(sideA)` and `checkAllDefeated(sideB)` after poison ticks.

- [ ] **Step 6: Run poison KO tests**

Run:

```bash
npm run test:unit -- --test-name-pattern="poison|draw when both sides"
```

Expected: pass.

## Task 7: Party Skill Migration and Deprecated Mechanics Removal

**Files:**
- Modify: `src/game/combat/party-skill-engine.js`
- Modify: `src/game/party-skills.js`
- Modify: `src/game/services/creature-combat-service.js`
- Modify: `src/game/combat/effects.js`
- Test: `tests/unit/combat/party-skill-engine.test.js`
- Test: `tests/unit/combat/creature-combat-service.test.js`
- Test: `tests/unit/combat/effects.test.js`

- [ ] **Step 1: Rewrite party-skill tests away from shield/haste**

In `tests/unit/combat/party-skill-engine.test.js`, update fixture helpers to default to dex:

```js
function ally(id, hp = 100, maxHp = 100, attack = 20, defense = 5, element = 'neutral') {
  return { id, hp, maxHp, attack, defense, dex: 10, element, activeEffects: [], statStages: { atk: 0, def: 0, dex: 0 } };
}

function enemy(id, hp = 100, maxHp = 100, attack = 15, defense = 5, element = 'neutral') {
  return { id, hp, maxHp, attack, defense, dex: 10, element, activeEffects: [], statStages: { atk: 0, def: 0, dex: 0 } };
}
```

Replace tests named around shield/haste buff counting with dex/def equivalents:

```js
test('countBuffTypes counts positive atk, def, and dex stages', () => {
  const creature = {
    statStages: { atk: 3, def: 1, dex: 2 },
    activeEffects: [{ type: 'taunt', remainingTurns: 2 }]
  };

  assert.equal(countBuffTypes(creature), 3);
});

test('Hardened Riposte: +50% when defender has positive DEF stage', () => {
  const allies = [ally('a1')];
  const enemies = [enemy('e1')];
  allies[0].statStages.def = 2;
  const record = attackRecord({ attackerIndex: 0, targetIndex: 0, damage: 10 });

  const result = computeInlineCounter(record, allies, enemies, ['retaliationStrike', 'hardenedRiposte'], {});

  assert.ok(result.damage > Math.floor((allies[0].attack || 10) * 0.25));
});
```

Remove tests that assert shield/team_shield/haste are counted as buff types.

- [ ] **Step 2: Run party-skill tests and verify failure**

Run:

```bash
npm run test:unit -- --test-name-pattern="party-skill|Hardened Riposte|countBuffTypes"
```

Expected: fails because production still counts shield/haste.

- [ ] **Step 3: Migrate party-skill engine**

In `src/game/combat/party-skill-engine.js`, remove `getDamageReduction` from imports:

```js
import { applyStatChange, applyHeal, getStageMultiplier, breakSleep, initStatStages } from './effects.js';
```

In `computeInlineCounter()`, replace shield logic:

```js
    const hasDefStage = (defender.statStages?.def || 0) > 0;
    if (hasDefStage) {
      counterDmg = Math.floor(counterDmg * 1.5);
    }
```

Update `countBuffTypes()` to count only positive stages:

```js
export function countBuffTypes(creature) {
  let count = 0;
  if (creature.statStages) {
    for (const [stat, val] of Object.entries(creature.statStages)) {
      if ((stat === 'atk' || stat === 'def' || stat === 'dex') && val > 0) count++;
    }
  }
  return count;
}
```

Update any comments and party-skill proc labels that mention shield/haste so they refer to positive DEF or DEX stages.

- [ ] **Step 4: Update party skill descriptions**

In `src/game/party-skills.js`, update `hardenedRiposte` text:

```js
    desc: 'Counters deal +50% when you have a positive DEF stage.',
```

Update any descriptions that mention haste to say dex instead.

- [ ] **Step 5: Remove deprecated branches from combat service**

In `src/game/services/creature-combat-service.js`, delete:

- `case 'shield'` in `executeMove()`
- `case 'shield'` in `buildEnemyActionRecord()`
- all haste collection and second-execute behavior
- shield reduction application in damage branches

Also update `pickEnemyTarget()`:

```js
      if (['buff', 'heal'].includes(move.category)) {
```

- [ ] **Step 6: Run tests and grep for deprecated mechanics**

Run:

```bash
npm run test:unit -- --test-name-pattern="party-skill|Combat Effects|Creature Combat"
rg "hasHaste|consumeHaste|applyHaste|applyShield|applyTeamShield|getDamageReduction|temp_attack_flat|statusEffect.: .haste|category.: .shield|team_shield|\\bspd\\b" src public tests data
```

Expected: tests pass. `rg` should return no production/test references except historical docs or design docs if the search is broadened beyond the specified paths.

## Task 8: Reset, Save-Sync, and Room-Transition Dex Cleanup

**Files:**
- Modify: `src/game/services/combat-cycle-service.js`
- Modify: `src/game/services/exploration-service.js`
- Test: `tests/unit/combat/resolution.test.js`
- Test: `tests/unit/game/exploration-service-room-heal.test.js`

- [ ] **Step 1: Add/update tests for dex reset**

In any existing test that checks stat-stage reset shape, update expected stages:

```js
assert.deepStrictEqual(creature.statStages, { atk: 0, def: 0, dex: 0 });
```

In `tests/unit/game/exploration-service-room-heal.test.js`, add this test inside `describe('ExplorationService room heal (5% per room entry)', ...)`:

```js
  it('clears dex stages on room entry with other combat buffs', () => {
    const creature = { statStages: { atk: 1, def: -1, dex: 3 }, activeEffects: [{ type: 'poison', remainingTurns: 2 }] };
    const gm = makeGmWithRoomsAndParty({
      rooms: [
        createRoom('friendlyNpc', 'okunomori', 1, 2),
        createRoom('friendlyNpc', 'okunomori', 2, 2)
      ],
      creatureParty: { active: [creature], reserves: [] }
    });
    const service = new ExplorationService(gm);

    service.proceedToNextRoom();

    assert.deepStrictEqual(creature.statStages, { atk: 0, def: 0, dex: 0 });
    assert.deepStrictEqual(creature.activeEffects, []);
  });
```

- [ ] **Step 2: Update reset code paths**

In `src/game/services/exploration-service.js`, replace:

```js
      creature.statStages = { atk: 0, def: 0 };
```

with:

```js
      creature.statStages = { atk: 0, def: 0, dex: 0 };
```

In `src/game/services/combat-cycle-service.js`, no object literal should manually reset only `{ atk, def }`; use `resetStatStages(c)` where possible.

- [ ] **Step 3: Run reset-related tests**

Run:

```bash
npm run test:unit -- --test-name-pattern="resetStatStages|room entry|combat buffs"
```

Expected: pass.

## Task 9: Final Docs and Verification

**Files:**
- Modify: `docs/move-system-reference.md`

- [ ] **Step 1: Update `docs/move-system-reference.md` implementation gaps**

Edit the implementation gaps section so completed items are no longer described as current gaps. Replace the `dex` bullet with:

```md
3. **`dex` stat** — implemented as a real creature stat plus battle-stage stat. It affects turn order, critical-hit chance, and dodge chance in both PvE and PvP.
```

Replace the `heal riders`, `poison can KO`, and `cleanse handler` bullets with implemented notes. Remove the note saying `heal` riders are not wired.

Keep the deprecated-mechanics section, but mark shield/haste/spd/temp flat attack as removed rather than live legacy.

- [ ] **Step 2: Run syntax checks on touched JS files**

Run:

```bash
node --check src/game/combat/effects.js
node --check src/game/creatures.js
node --check src/game/services/creature-combat-service.js
node --check src/game/services/combat-cycle-service.js
node --check src/game/services/exploration-service.js
node --check src/game/combat/party-skill-engine.js
node --check src/pvp/pvp-combat.js
node --check public/js/ui/move-effect-label.js
```

Expected: each command exits successfully with no syntax errors.

- [ ] **Step 3: Run targeted unit tests**

Run:

```bash
npm run test:unit -- --test-name-pattern="Combat Effects|Creature Combat|resolveRound|buildTurnOrder|Creature Instantiation|Creature Leveling|move effect label|party-skill"
```

Expected: pass.

- [ ] **Step 4: Run full unit suite**

Run:

```bash
npm run test:unit
```

Expected: pass.

- [ ] **Step 5: Inspect remaining deprecated references**

Run:

```bash
rg "hasHaste|consumeHaste|applyHaste|applyShield|applyTeamShield|getDamageReduction|temp_attack_flat|statusEffect.: .haste|category.: .shield|team_shield|\\bspd\\b" src public tests data
```

Expected: no output. If output remains in production/test code, remove or migrate it. Historical docs outside these paths do not block this plan.

- [ ] **Step 6: Check lints for edited files**

Use Cursor's lint diagnostics for:

- `src/game/combat/effects.js`
- `src/game/creatures.js`
- `src/game/services/creature-combat-service.js`
- `src/game/services/combat-cycle-service.js`
- `src/game/combat/party-skill-engine.js`
- `src/pvp/pvp-combat.js`
- `public/js/ui/move-effect-label.js`

Expected: no new linter errors from this work.

## Self-Review Notes

Spec coverage:

- Real `baseDex` / `dex` / `baseDexTemplate`: Task 1.
- No fallback for missing creature dex: Task 1 tests and `requireBaseDex()`.
- Existing stat-stage architecture reused for dex: Task 2.
- Dex initiative in PvE and PvP: Task 5.
- Crit and dodge formulas: Tasks 2 and 4.
- Heal riders and cleanse: Tasks 2 and 4.
- Poison KOs and XP/victory flow: Task 6.
- Deprecated shield/haste/spd/temp-flat-attack removal: Tasks 3, 5, and 7.
- UI label contract: Task 3.
- Docs update: Task 9.

Placeholder scan: no deferred implementation markers remain. Task 8 now points at the concrete `tests/unit/game/exploration-service-room-heal.test.js` import pattern and includes an executable test body.

Type consistency:

- `baseDex`, `dex`, and `baseDexTemplate` are used consistently.
- `statStages.dex` uses the existing `getStageMultiplier(creature, stat)` system.
- Attack-record fields are `critical`, `critChance`, `dodged`, `hitChance`, and `dodgeChance`.
