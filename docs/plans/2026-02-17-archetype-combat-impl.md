# Archetype Combat System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace flat robot/chip combat with archetype-differentiated creatures — Fighters hit hard, Mages burst AoE, Tricksters poison, Tanks heal.

**Architecture:** Four layers merged sequentially: (1) Schema + Stats — creature data gains archetype-specific baseHp/baseAttack, skill types, and targeting; (2) Combat Effects — processUltimate branches on skill type to support heal and poison; (3) Chip Removal — delete all chip pipeline code; (4) UI Polish — green heal numbers, purple poison indicators, archetype labels.

**Tech Stack:** Node.js native test runner, ES6 modules, Express backend, vanilla JS frontend with anime.js effects.

**Design doc:** `docs/plans/2026-02-17-archetype-combat-design.md`

---

## Layer 1: Schema + Stats

### Task 1: Update `instantiateRobot` to preserve archetype and new skill fields

**Files:**
- Modify: `src/game/robots.js:48-73`
- Test: `tests/unit/robots.test.js`

**Step 1: Write the failing tests**

Add to `tests/unit/robots.test.js`:

```javascript
describe('Archetype-Aware Instantiation', () => {
  it('preserves archetype field from template', () => {
    const robot = instantiateRobot('sizzlit');
    // sizzlit template must have archetype field
    assert.ok(robot.archetype, 'robot should have archetype');
  });

  it('uses per-creature baseHp instead of flat 100', () => {
    // Requires a creature template with baseHp != 100
    // After updating robots.json with real values, add concrete assertion
    const robot = instantiateRobot('sizzlit');
    assert.ok(typeof robot.baseHpTemplate === 'number', 'should store template baseHp');
    assert.ok(typeof robot.baseAttackTemplate === 'number', 'should store template baseAttack');
  });

  it('preserves skill type and target fields on autoSkill', () => {
    const robot = instantiateRobot('sizzlit');
    assert.ok(robot.autoSkill.type, 'autoSkill should have type');
    assert.ok(robot.autoSkill.target, 'autoSkill should have target');
  });

  it('preserves skill type and target fields on ultimate', () => {
    const robot = instantiateRobot('sizzlit');
    assert.ok(robot.ultimate.type, 'ultimate should have type');
    assert.ok(robot.ultimate.target, 'ultimate should have target');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/robots.test.js`
Expected: FAIL — archetype, baseHpTemplate, type, target fields missing

**Step 3: Update robots.json templates**

Add to every creature in `data/robots.json`:
- `archetype` field (one of: `"Fighter"`, `"Mage"`, `"Trickster"`, `"Tank/Healer"`)
- `autoSkill.type`: `"damage"` and `autoSkill.target`: `"single_enemy"` (all auto-attacks are damage)
- `ultimate.type`: `"damage"` and `ultimate.target`: `"all_enemies"` or `"single_enemy"` per creature

For existing creatures, assign archetypes based on their stats/names (all are effectively Fighters since stats are identical). The important thing is the code handles these fields.

**Step 4: Update `instantiateRobot` in `src/game/robots.js`**

```javascript
export function instantiateRobot(templateId) {
  const template = ROBOTS_BY_ID[templateId];
  if (!template) throw new Error(`Robot template not found: ${templateId}`);

  const mult = RARITY_MULTIPLIERS[template.rarity] || 1.0;
  const hp = Math.floor(template.baseHp * mult);
  const attack = Math.floor(template.baseAttack * mult);

  return {
    id: template.id,
    name: template.name,
    nameEn: template.nameEn,
    element: template.element,
    rarity: template.rarity,
    archetype: template.archetype || 'Fighter',
    level: 1,
    xp: 0,
    hp,
    maxHp: hp,
    attack,
    baseHpTemplate: template.baseHp,
    baseAttackTemplate: template.baseAttack,
    autoSkill: { ...template.autoSkill },
    ultimate: {
      ...template.ultimate,
      charges: 0
    }
  };
}
```

Key changes:
- Added `archetype` (defaults to `'Fighter'` for backward compat)
- Added `baseHpTemplate` and `baseAttackTemplate` (needed for level-up recalculation)
- Skill spread already copies `type` and `target` from template

**Step 5: Run tests to verify they pass**

Run: `node --test tests/unit/robots.test.js`
Expected: All pass

**Step 6: Commit**

```bash
git add src/game/robots.js data/robots.json tests/unit/robots.test.js
git commit -m "feat: preserve archetype and skill type/target in robot instantiation"
```

---

### Task 2: Fix `addXpToRobot` to use stored base stats

**Files:**
- Modify: `src/game/robots.js:83-97`
- Test: `tests/unit/robots.test.js`

**Step 1: Write the failing test**

```javascript
describe('Robot Leveling (archetype-aware)', () => {
  it('uses per-creature base stats for level scaling, not hardcoded 100/10', () => {
    // Create a robot manually with non-standard base stats (simulating a Tank)
    const robot = instantiateRobot('sizzlit');
    // Override to simulate a Tank with baseHp=160, baseAttack=7
    robot.baseHpTemplate = 160;
    robot.baseAttackTemplate = 7;
    robot.maxHp = 160;
    robot.hp = 160;
    robot.attack = 7;
    robot.rarity = 'common';
    robot.level = 1;
    robot.xp = 0;

    addXpToRobot(robot, 100); // Level up to 2
    // Level 2: mult = 1.1
    // maxHp = floor(160 * 1.0 * 1.1) = 176
    // attack = floor(7 * 1.0 * 1.1) = 7
    assert.strictEqual(robot.level, 2);
    assert.strictEqual(robot.maxHp, 176);
    assert.strictEqual(robot.attack, 7); // floor(7 * 1.1) = 7
  });
});
```

**Step 2: Run to verify it fails**

Run: `node --test tests/unit/robots.test.js`
Expected: FAIL — maxHp will be 110 (hardcoded 100 * 1.1) not 176

**Step 3: Fix `addXpToRobot`**

In `src/game/robots.js`, replace lines 83-97:

```javascript
export function addXpToRobot(robot, xp) {
  robot.xp += xp;
  while (robot.xp >= XP_PER_LEVEL) {
    robot.xp -= XP_PER_LEVEL;
    robot.level++;
    const rarityMult = RARITY_MULTIPLIERS[robot.rarity] || 1.0;
    const baseHp = Math.floor((robot.baseHpTemplate || 100) * rarityMult);
    const baseAtk = Math.floor((robot.baseAttackTemplate || 10) * rarityMult);
    const stats = getStatsForLevel(baseHp, baseAtk, robot.level);
    const hpDiff = stats.maxHp - robot.maxHp;
    robot.maxHp = stats.maxHp;
    robot.attack = stats.attack;
    robot.hp += hpDiff;
  }
}
```

Change: `100` → `robot.baseHpTemplate || 100`, `10` → `robot.baseAttackTemplate || 10`

**Step 4: Run tests**

Run: `node --test tests/unit/robots.test.js`
Expected: All pass

**Step 5: Commit**

```bash
git add src/game/robots.js tests/unit/robots.test.js
git commit -m "fix: use per-creature base stats for level-up scaling"
```

---

### Task 3: Update `processUltimate` for single vs AoE targeting

**Files:**
- Modify: `src/game/services/robot-combat-service.js:165-211`
- Test: `tests/unit/robot-combat-service.test.js`

**Step 1: Write the failing test**

```javascript
describe('Robot Combat - Ultimate Targeting', () => {
  it('single_enemy ultimate hits only one target', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet'), instantiateRobot('petalia')];
    // Force ultimate to be single-target
    allies[0].ultimate.target = 'single_enemy';
    allies[0].ultimate.charges = allies[0].ultimate.chargesRequired;

    const result = processUltimate(allies[0], enemies);
    assert.ok(result.success);
    assert.strictEqual(result.hits.length, 1, 'single_enemy should hit exactly one target');
  });

  it('all_enemies ultimate hits all alive enemies (existing behavior)', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet'), instantiateRobot('petalia')];
    allies[0].ultimate.target = 'all_enemies';
    allies[0].ultimate.charges = allies[0].ultimate.chargesRequired;

    const result = processUltimate(allies[0], enemies);
    assert.ok(result.success);
    assert.strictEqual(result.hits.length, 2, 'all_enemies should hit all alive enemies');
  });

  it('ultimate with no target field defaults to all_enemies (backward compat)', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet'), instantiateRobot('petalia')];
    delete allies[0].ultimate.target;
    allies[0].ultimate.charges = allies[0].ultimate.chargesRequired;

    const result = processUltimate(allies[0], enemies);
    assert.ok(result.success);
    assert.strictEqual(result.hits.length, 2, 'default should be all_enemies');
  });
});
```

**Step 2: Run to verify it fails**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: FAIL — single_enemy test will hit 2 targets

**Step 3: Update `processUltimate`**

In `src/game/services/robot-combat-service.js`, replace the ultimate function:

```javascript
export function processUltimate(robot, enemies, itemBuffs = null, robotParty = null) {
  if (robot.ultimate.charges < robot.ultimate.chargesRequired) {
    return { success: false, reason: 'Not enough charges' };
  }

  const hits = [];
  const xpEvents = [];
  const defeatedEnemyIds = new Set();
  const ultType = robot.ultimate.type || 'damage';
  const ultTarget = robot.ultimate.target || 'all_enemies';

  // For non-damage ultimates, delegate to effect handlers
  if (ultType === 'heal') {
    return processHealUltimate(robot, robotParty);
  }
  if (ultType === 'poison') {
    return processPoisonUltimate(robot, enemies, itemBuffs, robotParty);
  }

  // Damage ultimate — determine targets
  let targets;
  if (ultTarget === 'single_enemy') {
    const target = selectTarget(robot, enemies.filter(e => e.hp > 0));
    targets = target ? [target] : [];
  } else {
    // all_enemies (default)
    targets = enemies.filter(e => e.hp > 0);
  }

  for (const enemy of targets) {
    const elemMult = getElementMultiplier(robot.ultimate.element, enemy.element);
    const variance = rollVariance();
    const buffedAttack = itemBuffs ? getBuffedAttack(robot.attack, itemBuffs) : robot.attack;
    const buffedPower = itemBuffs ? getBuffedUltimatePower(robot.ultimate.power, itemBuffs) : robot.ultimate.power;
    const buffedElemMult = itemBuffs ? getBuffedElementMultiplier(elemMult, itemBuffs) : elemMult;
    const damage = calculateRobotDamage(buffedAttack, buffedPower, buffedElemMult, variance);
    enemy.hp = Math.max(0, enemy.hp - damage);
    const targetDefeated = enemy.hp <= 0;
    hits.push({
      targetId: enemy.id,
      targetName: enemy.nameEn,
      damage,
      elementMultiplier: elemMult,
      targetDefeated
    });

    if (targetDefeated && !defeatedEnemyIds.has(enemy.id) && robotParty) {
      defeatedEnemyIds.add(enemy.id);
      const xpEvent = awardKillXp(robotParty, 50);
      xpEvents.push({ enemyId: enemy.id, enemyName: enemy.nameEn, ...xpEvent });
    }
  }

  robot.ultimate.charges = 0;

  return {
    success: true,
    type: 'damage',
    robotId: robot.id,
    robotName: robot.nameEn,
    ultimateName: robot.ultimate.nameEn,
    hits,
    xpEvents,
    allEnemiesDefeated: enemies.every(e => e.hp <= 0)
  };
}
```

Add stub functions for heal/poison (implemented in Layer 2):

```javascript
function processHealUltimate(robot, robotParty) {
  robot.ultimate.charges = 0;
  return { success: true, type: 'heal', robotId: robot.id, robotName: robot.nameEn, hits: [], xpEvents: [], allEnemiesDefeated: false };
}

function processPoisonUltimate(robot, enemies, itemBuffs, robotParty) {
  robot.ultimate.charges = 0;
  return { success: true, type: 'poison', robotId: robot.id, robotName: robot.nameEn, hits: [], xpEvents: [], allEnemiesDefeated: false };
}
```

**Step 4: Run tests**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: All pass

**Step 5: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/unit/robot-combat-service.test.js
git commit -m "feat: support single-target vs AoE ultimates based on target field"
```

---

## Layer 2: Combat Effects

### Task 4: Add active effects tracking and tick function

**Files:**
- Create: `src/game/combat/effects.js`
- Test: `tests/unit/combat-effects.test.js`

**Step 1: Write the failing test**

Create `tests/unit/combat-effects.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { tickEffects, applyPoison, applyHeal } from '../../src/game/combat/effects.js';

describe('Combat Effects - Tick', () => {
  it('poison deals damage and decrements remaining turns', () => {
    const robot = { hp: 100, maxHp: 100, activeEffects: [
      { type: 'poison', remainingTurns: 3, damagePerTurn: 5, sourceId: 'test' }
    ]};
    const events = tickEffects(robot);
    assert.strictEqual(robot.hp, 95);
    assert.strictEqual(robot.activeEffects[0].remainingTurns, 2);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'poison');
    assert.strictEqual(events[0].damage, 5);
  });

  it('removes expired effects', () => {
    const robot = { hp: 100, maxHp: 100, activeEffects: [
      { type: 'poison', remainingTurns: 1, damagePerTurn: 5, sourceId: 'test' }
    ]};
    tickEffects(robot);
    assert.strictEqual(robot.activeEffects.length, 0);
  });

  it('does not reduce HP below 1 from poison', () => {
    const robot = { hp: 3, maxHp: 100, activeEffects: [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 10, sourceId: 'test' }
    ]};
    tickEffects(robot);
    assert.strictEqual(robot.hp, 1, 'poison should not kill — min 1 HP');
  });

  it('handles empty activeEffects array', () => {
    const robot = { hp: 100, maxHp: 100, activeEffects: [] };
    const events = tickEffects(robot);
    assert.strictEqual(events.length, 0);
  });

  it('handles missing activeEffects field', () => {
    const robot = { hp: 100, maxHp: 100 };
    const events = tickEffects(robot);
    assert.strictEqual(events.length, 0);
  });
});

describe('Combat Effects - Apply Poison', () => {
  it('adds poison effect to target', () => {
    const target = { hp: 100, maxHp: 100, activeEffects: [] };
    applyPoison(target, { damagePerTurn: 5, duration: 3, sourceId: 'attacker-1' });
    assert.strictEqual(target.activeEffects.length, 1);
    assert.strictEqual(target.activeEffects[0].type, 'poison');
    assert.strictEqual(target.activeEffects[0].damagePerTurn, 5);
    assert.strictEqual(target.activeEffects[0].remainingTurns, 3);
  });

  it('initializes activeEffects if missing', () => {
    const target = { hp: 100, maxHp: 100 };
    applyPoison(target, { damagePerTurn: 5, duration: 3, sourceId: 'attacker-1' });
    assert.strictEqual(target.activeEffects.length, 1);
  });
});

describe('Combat Effects - Apply Heal', () => {
  it('restores HP capped at maxHp', () => {
    const target = { hp: 50, maxHp: 100, activeEffects: [] };
    const healed = applyHeal(target, 30);
    assert.strictEqual(target.hp, 80);
    assert.strictEqual(healed, 30);
  });

  it('caps healing at maxHp', () => {
    const target = { hp: 90, maxHp: 100, activeEffects: [] };
    const healed = applyHeal(target, 30);
    assert.strictEqual(target.hp, 100);
    assert.strictEqual(healed, 10, 'should return actual HP restored');
  });

  it('does not heal KOd robots', () => {
    const target = { hp: 0, maxHp: 100, activeEffects: [] };
    const healed = applyHeal(target, 30);
    assert.strictEqual(target.hp, 0);
    assert.strictEqual(healed, 0);
  });
});
```

**Step 2: Run to verify they fail**

Run: `node --test tests/unit/combat-effects.test.js`
Expected: FAIL — module not found

**Step 3: Implement `src/game/combat/effects.js`**

```javascript
/**
 * Tick all active effects on a robot at the start of a combat round.
 * Returns an array of effect events for the frontend to display.
 */
export function tickEffects(robot) {
  if (!robot.activeEffects || robot.activeEffects.length === 0) return [];

  const events = [];

  for (const effect of robot.activeEffects) {
    if (effect.type === 'poison') {
      const damage = Math.min(effect.damagePerTurn, robot.hp - 1);
      const actualDamage = Math.max(0, damage);
      robot.hp -= actualDamage;
      events.push({
        type: 'poison',
        targetId: robot.id,
        targetName: robot.nameEn,
        damage: actualDamage,
        remainingTurns: effect.remainingTurns - 1
      });
    }
    effect.remainingTurns--;
  }

  // Remove expired effects
  robot.activeEffects = robot.activeEffects.filter(e => e.remainingTurns > 0);

  return events;
}

/**
 * Apply poison status to a target robot.
 */
export function applyPoison(target, { damagePerTurn, duration, sourceId }) {
  if (!target.activeEffects) target.activeEffects = [];
  target.activeEffects.push({
    type: 'poison',
    damagePerTurn,
    remainingTurns: duration,
    sourceId
  });
}

/**
 * Heal a target robot. Returns actual HP restored.
 * Does not heal KO'd robots (hp === 0).
 */
export function applyHeal(target, amount) {
  if (target.hp <= 0) return 0;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  return target.hp - before;
}
```

**Step 4: Run tests**

Run: `node --test tests/unit/combat-effects.test.js`
Expected: All pass

**Step 5: Commit**

```bash
git add src/game/combat/effects.js tests/unit/combat-effects.test.js
git commit -m "feat: add combat effects system (poison tick, heal, apply poison)"
```

---

### Task 5: Implement heal ultimate

**Files:**
- Modify: `src/game/services/robot-combat-service.js` (replace `processHealUltimate` stub)
- Modify: `tests/unit/robot-combat-service.test.js`

**Step 1: Write the failing test**

```javascript
describe('Robot Combat - Heal Ultimate', () => {
  it('heals single ally with lowest HP%', () => {
    const healer = instantiateRobot('sizzlit');
    healer.ultimate.type = 'heal';
    healer.ultimate.target = 'single_ally';
    healer.ultimate.power = 40;
    healer.ultimate.charges = healer.ultimate.chargesRequired;

    const injured = instantiateRobot('drizzlet');
    injured.hp = 30; // 30% HP

    const healthy = instantiateRobot('petalia');
    healthy.hp = 90; // 90% HP

    const party = { active: [healer, injured, healthy], reserves: [] };
    const enemies = [instantiateRobot('shimra')];
    const result = processUltimate(healer, enemies, null, party);

    assert.ok(result.success);
    assert.strictEqual(result.type, 'heal');
    assert.ok(injured.hp > 30, 'injured ally should be healed');
    assert.strictEqual(healthy.hp, 90, 'healthy ally should not be healed');
    assert.strictEqual(healer.ultimate.charges, 0, 'charges should reset');
  });

  it('heal all_allies heals every alive ally', () => {
    const healer = instantiateRobot('sizzlit');
    healer.ultimate.type = 'heal';
    healer.ultimate.target = 'all_allies';
    healer.ultimate.power = 30;
    healer.ultimate.charges = healer.ultimate.chargesRequired;

    const ally1 = instantiateRobot('drizzlet');
    ally1.hp = 50;
    const ally2 = instantiateRobot('petalia');
    ally2.hp = 60;

    const party = { active: [healer, ally1, ally2], reserves: [] };
    const enemies = [instantiateRobot('shimra')];
    const result = processUltimate(healer, enemies, null, party);

    assert.ok(result.success);
    assert.ok(ally1.hp > 50, 'ally1 should be healed');
    assert.ok(ally2.hp > 60, 'ally2 should be healed');
  });
});
```

**Step 2: Run to verify it fails**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: FAIL — heal stub doesn't actually heal

**Step 3: Implement `processHealUltimate`**

In `src/game/services/robot-combat-service.js`, add import and replace stub:

```javascript
import { applyHeal } from '../combat/effects.js';

function processHealUltimate(robot, enemies, itemBuffs, robotParty) {
  const ultTarget = robot.ultimate.target || 'single_ally';
  const healEvents = [];

  // Determine heal targets
  let targets;
  if (ultTarget === 'all_allies' && robotParty) {
    targets = robotParty.active.filter(r => r && r.hp > 0);
  } else if (robotParty) {
    // single_ally — pick ally with lowest HP%
    const alive = robotParty.active.filter(r => r && r.hp > 0 && r.hp < r.maxHp);
    if (alive.length > 0) {
      alive.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
      targets = [alive[0]];
    } else {
      targets = [];
    }
  } else {
    targets = [];
  }

  // Calculate heal amount: same formula as damage but applied as healing
  const variance = rollVariance();
  const healPower = robot.ultimate.power || 40;
  const healAmount = Math.max(1, Math.floor((robot.attack / 10) * healPower * variance));

  for (const target of targets) {
    const actualHealed = applyHeal(target, healAmount);
    healEvents.push({
      targetId: target.id,
      targetName: target.nameEn,
      healAmount: actualHealed,
      targetHp: target.hp,
      targetMaxHp: target.maxHp
    });
  }

  robot.ultimate.charges = 0;

  return {
    success: true,
    type: 'heal',
    robotId: robot.id,
    robotName: robot.nameEn,
    ultimateName: robot.ultimate.nameEn,
    healEvents,
    hits: [],
    xpEvents: [],
    allEnemiesDefeated: false
  };
}
```

Note: update the `processUltimate` delegation to pass all params:
```javascript
if (ultType === 'heal') {
  return processHealUltimate(robot, enemies, itemBuffs, robotParty);
}
```

**Step 4: Run tests**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: All pass

**Step 5: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/unit/robot-combat-service.test.js
git commit -m "feat: implement heal ultimate for Tank/Healer archetype"
```

---

### Task 6: Implement poison ultimate

**Files:**
- Modify: `src/game/services/robot-combat-service.js` (replace `processPoisonUltimate` stub)
- Modify: `tests/unit/robot-combat-service.test.js`

**Step 1: Write the failing test**

```javascript
describe('Robot Combat - Poison Ultimate', () => {
  it('applies poison effect to single enemy', () => {
    const trickster = instantiateRobot('sizzlit');
    trickster.ultimate.type = 'poison';
    trickster.ultimate.target = 'single_enemy';
    trickster.ultimate.power = 30;
    trickster.ultimate.charges = trickster.ultimate.chargesRequired;

    const enemies = [instantiateRobot('drizzlet'), instantiateRobot('petalia')];
    const party = { active: [trickster], reserves: [] };
    const result = processUltimate(trickster, enemies, null, party);

    assert.ok(result.success);
    assert.strictEqual(result.type, 'poison');
    // One enemy should have activeEffects with poison
    const poisoned = enemies.filter(e => e.activeEffects && e.activeEffects.length > 0);
    assert.strictEqual(poisoned.length, 1, 'exactly one enemy should be poisoned');
    assert.strictEqual(poisoned[0].activeEffects[0].type, 'poison');
    assert.strictEqual(poisoned[0].activeEffects[0].remainingTurns, 3);
  });

  it('deals small immediate damage alongside poison', () => {
    const trickster = instantiateRobot('sizzlit');
    trickster.ultimate.type = 'poison';
    trickster.ultimate.target = 'single_enemy';
    trickster.ultimate.power = 30;
    trickster.ultimate.charges = trickster.ultimate.chargesRequired;

    const enemies = [instantiateRobot('drizzlet')];
    const startHp = enemies[0].hp;
    const party = { active: [trickster], reserves: [] };
    processUltimate(trickster, enemies, null, party);

    assert.ok(enemies[0].hp < startHp, 'should deal some immediate damage');
  });
});
```

**Step 2: Run to verify it fails**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: FAIL — poison stub doesn't apply effects

**Step 3: Implement `processPoisonUltimate`**

```javascript
import { applyPoison } from '../combat/effects.js';

function processPoisonUltimate(robot, enemies, itemBuffs, robotParty) {
  const ultTarget = robot.ultimate.target || 'single_enemy';
  const hits = [];
  const xpEvents = [];
  const defeatedEnemyIds = new Set();

  // Determine targets
  let targets;
  if (ultTarget === 'all_enemies') {
    targets = enemies.filter(e => e.hp > 0);
  } else {
    const target = selectTarget(robot, enemies.filter(e => e.hp > 0));
    targets = target ? [target] : [];
  }

  // Deal reduced immediate damage (half power) + apply poison
  const poisonPower = robot.ultimate.power || 30;
  const immediatePower = Math.floor(poisonPower * 0.5);
  const damagePerTurn = Math.max(1, Math.floor((robot.attack / 10) * poisonPower * 0.2));

  for (const enemy of targets) {
    // Immediate damage
    const elemMult = getElementMultiplier(robot.ultimate.element, enemy.element);
    const variance = rollVariance();
    const buffedAttack = itemBuffs ? getBuffedAttack(robot.attack, itemBuffs) : robot.attack;
    const damage = calculateRobotDamage(buffedAttack, immediatePower, elemMult, variance);
    enemy.hp = Math.max(0, enemy.hp - damage);
    const targetDefeated = enemy.hp <= 0;

    // Apply poison (only if still alive)
    if (!targetDefeated) {
      applyPoison(enemy, { damagePerTurn, duration: 3, sourceId: robot.id });
    }

    hits.push({
      targetId: enemy.id,
      targetName: enemy.nameEn,
      damage,
      elementMultiplier: elemMult,
      targetDefeated,
      poisonApplied: !targetDefeated
    });

    if (targetDefeated && !defeatedEnemyIds.has(enemy.id) && robotParty) {
      defeatedEnemyIds.add(enemy.id);
      const xpEvent = awardKillXp(robotParty, 50);
      xpEvents.push({ enemyId: enemy.id, enemyName: enemy.nameEn, ...xpEvent });
    }
  }

  robot.ultimate.charges = 0;

  return {
    success: true,
    type: 'poison',
    robotId: robot.id,
    robotName: robot.nameEn,
    ultimateName: robot.ultimate.nameEn,
    hits,
    xpEvents,
    allEnemiesDefeated: enemies.every(e => e.hp <= 0)
  };
}
```

**Step 4: Run tests**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: All pass

**Step 5: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/unit/robot-combat-service.test.js
git commit -m "feat: implement poison ultimate for Trickster archetype"
```

---

### Task 7: Integrate effect ticking into combat round

**Files:**
- Modify: `src/game/services/robot-combat-service.js`
- Modify: `tests/unit/robot-combat-service.test.js`

**Step 1: Write the failing test**

```javascript
import { tickAllEffects } from '../../src/game/services/robot-combat-service.js';

describe('Robot Combat - Effect Ticking', () => {
  it('tickAllEffects processes poison on all robots', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
    enemies[0].activeEffects = [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: 'test' }
    ];
    const startHp = enemies[0].hp;

    const events = tickAllEffects(allies, enemies);
    assert.ok(enemies[0].hp < startHp, 'poison should tick');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'poison');
  });

  it('ticks effects on allies too (enemy poison)', () => {
    const allies = [instantiateRobot('sizzlit')];
    allies[0].activeEffects = [
      { type: 'poison', remainingTurns: 1, damagePerTurn: 8, sourceId: 'enemy' }
    ];
    const startHp = allies[0].hp;

    const events = tickAllEffects(allies, []);
    assert.ok(allies[0].hp < startHp, 'ally poison should tick');
    assert.strictEqual(allies[0].activeEffects.length, 0, 'expired effect removed');
  });
});
```

**Step 2: Run to verify it fails**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: FAIL — `tickAllEffects` not exported

**Step 3: Implement `tickAllEffects`**

Add to `src/game/services/robot-combat-service.js`:

```javascript
import { tickEffects } from '../combat/effects.js';

export function tickAllEffects(allies, enemies) {
  const events = [];
  for (const robot of [...allies, ...enemies]) {
    if (robot && robot.hp > 0) {
      const robotEvents = tickEffects(robot);
      events.push(...robotEvents);
    }
  }
  return events;
}
```

**Step 4: Run tests**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: All pass

**Step 5: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/unit/robot-combat-service.test.js
git commit -m "feat: integrate effect ticking into combat round"
```

---

### Task 8: Wire effect ticking into `robotCombatCycle` in loop.js

**Files:**
- Modify: `src/game/loop.js` (the `robotCombatCycle` method)
- Modify: `src/routes/game/run.js` (if combat-cycle route returns tick events)

**Step 1: Read `robotCombatCycle` in loop.js to understand where ticking belongs**

The tick should happen at the START of each combat round, before either side attacks. This means at the top of `robotCombatCycle`, after `swapPhase = false`.

**Step 2: Add tick call to `robotCombatCycle`**

In `src/game/loop.js`, inside `robotCombatCycle`, after `this.combat.swapPhase = false` and before the attack/defend/befriend branching:

```javascript
// Tick active effects at start of round
const effectEvents = tickAllEffects(this.combat.allies, this.combat.enemies);
```

Import `tickAllEffects` from robot-combat-service at the top of loop.js.

**Step 3: Add effectEvents to the return value**

The return value of `robotCombatCycle` needs a new `effectEvents` field so the frontend can display poison ticks.

```javascript
return {
  effectEvents,
  playerAttacks,
  enemyAttacks,
  // ... rest of existing fields
};
```

**Step 4: Update the route handler**

In the run routes file that handles `POST /api/game/robot-combat-cycle`, ensure `effectEvents` is included in the response JSON.

**Step 5: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`

**Step 6: Run unit tests**

Run: `npm run test:unit`
Expected: All existing tests pass (this is a wiring change, not logic)

**Step 7: Commit**

```bash
git add src/game/loop.js src/routes/game/run.js
git commit -m "feat: tick active effects at start of each combat round"
```

---

## Layer 3: Chip Removal

### Task 9: Remove backend chip code

**Files to modify/delete:**
- Modify: `src/game/combat/mechanics.js` — remove chip damage comments/logic
- Modify: `src/routes/game/economy.js` — remove sell-chip route
- Modify: `src/routes/game/misc.js` — remove debug-chips route
- Modify: `src/game/state.js` — remove chips from player state
- Modify: `src/game/loop.js` — remove any chip shop delegation
- Modify: `server.js` — remove chip route documentation

**Step 1: Search and audit**

Grep for "chip" (case-insensitive) across all `src/` and `server.js` files. List every reference. Categorize as: delete (chip-only code), modify (shared code referencing chips), or keep (Chippy the NPC companion — different feature).

IMPORTANT: "Chippy" is the NPC companion character (door hint feature). Do NOT delete Chippy-related code. Only delete chip *combat pipeline* code.

**Step 2: Remove chip references from backend files**

For each file:
1. Read the file
2. Remove chip-specific code blocks
3. Syntax check: `node --check <file> && echo "OK"`

**Step 3: Run unit tests**

Run: `npm run test:unit`
Expected: Chip-dependent tests fail, everything else passes

**Step 4: Commit**

```bash
git add -A src/ server.js
git commit -m "refactor: remove chip combat pipeline from backend"
```

---

### Task 10: Remove frontend chip code

**Files to modify:**
- Modify: `public/game.html` — rename `#chip-row` to something more generic, or keep it (it already holds robot slots)
- Modify: `public/game.css` — remove chip-specific styles (keep `.robot-slot` styles)
- Modify: `public/js/dom.js` — remove `chipPopup` getter (popup is used for robot info — may need to keep but rename)
- Modify: `public/js/ui/combat-effects.js` — remove `fireChipEffect()`, update `playerHitEffect()` to not reference chipRowEl
- Modify: `public/js/ui/combat-loop.js` — remove chip pipeline references in comments
- Modify: `public/js/audio.js` — remove chip sound effects from SFX list (keep audio files for now)

**Step 1: Audit each file**

Read each file, identify chip-specific vs shared code. The `#chip-row` div and `.robot-slot` CSS are used for robot display — keep those, just remove chip-pipeline-specific animations.

IMPORTANT: `#chip-row` is referenced throughout the codebase as the container for robot slots. Renaming it would cause massive churn. Keep the ID but remove chip-specific behavior.

**Step 2: Remove chip-specific code**

For each file:
1. Read the file
2. Remove chip-only code (e.g., `fireChipEffect`, chip comments, chip sounds)
3. Syntax check: `node --check <file> && echo "OK"` (for .js files)

**Step 3: Commit**

```bash
git add public/
git commit -m "refactor: remove chip combat pipeline from frontend"
```

---

### Task 11: Remove chip tests

**Files:**
- Delete contents of: `tests/integration/pipeline-chip-effects.test.js`
- Check for chip references in other test files

**Step 1: Remove chip test file**

Either delete `tests/integration/pipeline-chip-effects.test.js` or replace its contents with an empty describe block:

```javascript
// Chip pipeline tests removed — chip system replaced by archetype combat
```

**Step 2: Run all tests**

Run: `npm run test:unit && npm run test:integration`
Expected: All pass (no chip test failures)

**Step 3: Commit**

```bash
git add tests/
git commit -m "refactor: remove chip pipeline integration tests"
```

---

## Layer 4: UI Polish

### Task 12: Display heal effects in combat UI

**Files:**
- Modify: `public/js/ui/combat-effects.js` — add `healEffect()` function
- Modify: `public/js/ui/combat-loop.js` or `public/game.js` — handle `type: 'heal'` in ultimate response
- Modify: `public/game.css` — add `.heal-number` style (green, floats up)

**Step 1: Add healEffect to combat-effects.js**

```javascript
export async function healEffect(robotSlotEl, healAmount) {
  // Green heal number floating up
  const popup = document.createElement('div');
  popup.className = 'heal-number';
  popup.textContent = `+${healAmount}`;
  robotSlotEl.appendChild(popup);

  // Flash green
  flashElement(robotSlotEl.querySelector('.robot-icon'), 1);
  spawnParticles(robotSlotEl, 8, '#4CAF50');

  await delay(1200);
  popup.remove();
}
```

**Step 2: Add CSS for heal number**

In `public/game.css`:

```css
.heal-number {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  color: #4CAF50;
  font-weight: bold;
  font-size: 1.2rem;
  text-shadow: 0 0 4px rgba(76, 175, 80, 0.8);
  animation: float-up 1.2s ease-out forwards;
  pointer-events: none;
  z-index: 100;
}
```

**Step 3: Handle heal response in ultimate handler**

In `public/game.js` `handleUseRobotUltimate`, after receiving the API response:

```javascript
if (result.type === 'heal' && result.healEvents) {
  for (const heal of result.healEvents) {
    // Find the robot slot for the healed ally
    const slots = document.querySelectorAll('#chip-row .robot-slot');
    const targetIdx = gameState.run.robotParty.active.findIndex(r => r.id === heal.targetId);
    if (targetIdx >= 0 && slots[targetIdx]) {
      await healEffect(slots[targetIdx], heal.healAmount);
    }
  }
  // Update HP bars
  updateRobotHpBars(result.robotParty.active, /* build allyHpMap */);
}
```

**Step 4: Syntax check**

Run: `node --check public/game.js && node --check public/js/ui/combat-effects.js && echo "OK"`

**Step 5: Commit**

```bash
git add public/game.js public/js/ui/combat-effects.js public/game.css
git commit -m "feat: display green heal numbers for Tank/Healer ultimates"
```

---

### Task 13: Display poison effects in combat UI

**Files:**
- Modify: `public/js/ui/combat-effects.js` — add `poisonApplyEffect()` and `poisonTickEffect()`
- Modify: `public/js/ui/combat-loop.js` or `public/game.js` — handle effectEvents from combat cycle
- Modify: `public/game.css` — add `.poisoned` indicator style

**Step 1: Add poison effects to combat-effects.js**

```javascript
export async function poisonApplyEffect(targetEl) {
  // Purple flash on poisoned target
  const overlay = document.createElement('div');
  overlay.className = 'poison-overlay';
  targetEl.appendChild(overlay);
  targetEl.classList.add('poisoned');

  spawnParticles(targetEl, 6, '#9C27B0');
  await delay(400);
  overlay.remove();
}

export async function poisonTickEffect(targetEl, damage) {
  const popup = document.createElement('div');
  popup.className = 'poison-tick-number';
  popup.textContent = `-${damage}`;
  targetEl.appendChild(popup);

  targetEl.classList.add('poison-pulse');
  await delay(600);
  targetEl.classList.remove('poison-pulse');
  popup.remove();
}
```

**Step 2: Add CSS**

```css
.poisoned .robot-hp-fill {
  filter: hue-rotate(270deg);
}

.poison-tick-number {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  color: #9C27B0;
  font-weight: bold;
  font-size: 0.9rem;
  text-shadow: 0 0 4px rgba(156, 39, 176, 0.8);
  animation: float-up 0.8s ease-out forwards;
  pointer-events: none;
  z-index: 100;
}

.poison-pulse {
  animation: poison-flash 0.3s ease-in-out;
}

@keyframes poison-flash {
  50% { filter: brightness(0.6) hue-rotate(270deg); }
}
```

**Step 3: Handle effectEvents in combat cycle response**

In the frontend combat cycle handler, before processing attacks:

```javascript
if (result.effectEvents) {
  for (const event of result.effectEvents) {
    if (event.type === 'poison') {
      // Find the target element (ally or enemy)
      const targetEl = findCombatTargetElement(event.targetId);
      if (targetEl) await poisonTickEffect(targetEl, event.damage);
    }
  }
}
```

**Step 4: Handle poison applied from ultimate**

In the ultimate handler, check `hits[].poisonApplied`:

```javascript
for (const hit of result.hits) {
  if (hit.poisonApplied) {
    const enemyEl = findEnemyElement(hit.targetId);
    if (enemyEl) await poisonApplyEffect(enemyEl);
  }
}
```

**Step 5: Syntax check + Commit**

```bash
node --check public/game.js && node --check public/js/ui/combat-effects.js && echo "OK"
git add public/
git commit -m "feat: display poison application and tick effects in combat UI"
```

---

### Task 14: Show archetype in creature info popup

**Files:**
- Modify: `public/js/ui/robot-row.js` — add archetype to popup HTML
- Modify: `public/game.css` — style archetype badge

**Step 1: Update robot popup HTML**

In `public/js/ui/robot-row.js`, in the popup rendering section, add archetype line after the element line:

```javascript
const archetypeLabel = robot.archetype || 'Fighter';
// Add after element line:
`<div class="robot-popup-archetype">${archetypeLabel}</div>`
```

**Step 2: Add CSS for archetype badge**

```css
.robot-popup-archetype {
  font-size: 0.75rem;
  color: var(--text-secondary, #aaa);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.25rem;
}
```

**Step 3: Syntax check**

Run: `node --check public/js/ui/robot-row.js && echo "OK"`

**Step 4: Commit**

```bash
git add public/js/ui/robot-row.js public/game.css
git commit -m "feat: show archetype in creature info popup"
```

---

## Post-Implementation

### Task 15: Update lorebook with concrete decisions

**Files:**
- Modify: `docs/creature-archetype-lorebook.md`

**Step 1: Fix the "only Mages get AoE" claim**

Update the Fighter section to note that Rare+ Fighters may have AoE ultimates. Update the Mage section to clarify they have the *strongest* AoE, not exclusive access.

**Step 2: Pin concrete formulas**

Replace ranges with the formula: "Forge picks specific values within range. Game code reads per-creature stats."

**Step 3: Add implementation status section**

Note which skill types are implemented (damage, heal, poison) and which are deferred (sleep, confuse, stun, buff, shield, taunt, haste).

**Step 4: Commit**

```bash
git add docs/creature-archetype-lorebook.md
git commit -m "docs: update lorebook with concrete formulas and implementation status"
```

---

### Task 16: Final integration test — manual playtest

**No code changes.** Start the server, open in Playwright browser, verify:

1. Creatures display with correct archetype-differentiated stats
2. Single-target ultimate hits one enemy
3. AoE ultimate hits all enemies
4. Heal ultimate shows green numbers and restores HP
5. Poison ultimate shows purple indicator and ticks damage each round
6. Creature info popup shows archetype
7. Level-up uses correct per-creature base stats
8. No chip-related UI or errors remain

```bash
npm start &
# Wait for server
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Open Playwright browser and playtest
```
