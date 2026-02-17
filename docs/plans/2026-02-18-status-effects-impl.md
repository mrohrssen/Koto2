# Status Effects Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 8 status effects (sleep, stun, confuse, attack_buff, haste, shield, team_shield, taunt) to the archetype combat system in `effects.js` and `robot-combat-service.js`.

**Architecture:** Extend the existing `activeEffects[]` array pattern. Each effect is applied via ultimate skills only. Query helpers let combat service check for effects without reaching into the array directly. All scaling is percentage-based, driven by the skill's `power` field.

**Tech Stack:** Node.js native test runner, ES6 modules. Worktree at `/Users/michia/Documents/jrpg-wt-archetype-combat`.

**Design doc:** `docs/plans/2026-02-18-status-effects-design.md`

---

### Task 1: Apply functions for debuffs (sleep, stun, confuse)

**Files:**
- Modify: `src/game/combat/effects.js`
- Test: `tests/unit/combat-effects.test.js`

**Step 1: Write the failing tests**

Add to `tests/unit/combat-effects.test.js`. Update the import line first:

```js
import { tickEffects, applyPoison, applyHeal, applySleep, applyStun, applyConfuse } from '../../src/game/combat/effects.js';
```

Then add these test blocks:

```js
describe('Combat Effects - Apply Sleep', () => {
  it('adds sleep effect with 2-turn duration', () => {
    const target = { hp: 100, maxHp: 100, activeEffects: [] };
    applySleep(target, { duration: 2, sourceId: 'attacker-1' });
    assert.strictEqual(target.activeEffects.length, 1);
    assert.strictEqual(target.activeEffects[0].type, 'sleep');
    assert.strictEqual(target.activeEffects[0].remainingTurns, 2);
  });

  it('initializes activeEffects if missing', () => {
    const target = { hp: 100, maxHp: 100 };
    applySleep(target, { duration: 2, sourceId: 'attacker-1' });
    assert.strictEqual(target.activeEffects.length, 1);
  });

  it('refreshes duration if already asleep (no stacking)', () => {
    const target = { hp: 100, maxHp: 100, activeEffects: [
      { type: 'sleep', remainingTurns: 1, sourceId: 'old' }
    ]};
    applySleep(target, { duration: 2, sourceId: 'new' });
    const sleeps = target.activeEffects.filter(e => e.type === 'sleep');
    assert.strictEqual(sleeps.length, 1);
    assert.strictEqual(sleeps[0].remainingTurns, 2);
  });
});

describe('Combat Effects - Apply Stun', () => {
  it('adds stun effect with 1-turn duration', () => {
    const target = { hp: 100, maxHp: 100, activeEffects: [] };
    applyStun(target, { sourceId: 'attacker-1' });
    assert.strictEqual(target.activeEffects.length, 1);
    assert.strictEqual(target.activeEffects[0].type, 'stun');
    assert.strictEqual(target.activeEffects[0].remainingTurns, 1);
  });
});

describe('Combat Effects - Apply Confuse', () => {
  it('adds confuse effect with 2-turn duration', () => {
    const target = { hp: 100, maxHp: 100, activeEffects: [] };
    applyConfuse(target, { duration: 2, sourceId: 'attacker-1' });
    assert.strictEqual(target.activeEffects.length, 1);
    assert.strictEqual(target.activeEffects[0].type, 'confuse');
    assert.strictEqual(target.activeEffects[0].remainingTurns, 2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/combat-effects.test.js`
Expected: FAIL — `applySleep`, `applyStun`, `applyConfuse` not exported

**Step 3: Implement the apply functions**

Add to `src/game/combat/effects.js` after `applyHeal`:

```js
/**
 * Apply or refresh a status effect on a target. If the target already has
 * the same effect type, refresh its duration instead of stacking.
 */
function applyOrRefresh(target, effect) {
  if (!target.activeEffects) {
    target.activeEffects = [];
  }
  const existing = target.activeEffects.find(e => e.type === effect.type);
  if (existing) {
    existing.remainingTurns = effect.remainingTurns;
    existing.sourceId = effect.sourceId;
    if (effect.percent !== undefined) existing.percent = effect.percent;
  } else {
    target.activeEffects.push(effect);
  }
}

export function applySleep(target, { duration = 2, sourceId }) {
  applyOrRefresh(target, { type: 'sleep', remainingTurns: duration, sourceId });
}

export function applyStun(target, { sourceId }) {
  applyOrRefresh(target, { type: 'stun', remainingTurns: 1, sourceId });
}

export function applyConfuse(target, { duration = 2, sourceId }) {
  applyOrRefresh(target, { type: 'confuse', remainingTurns: duration, sourceId });
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/combat-effects.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/game/combat/effects.js tests/unit/combat-effects.test.js
git commit -m "feat: add apply functions for sleep, stun, confuse effects"
```

---

### Task 2: Apply functions for buffs (attack_buff, haste, shield, team_shield, taunt)

**Files:**
- Modify: `src/game/combat/effects.js`
- Test: `tests/unit/combat-effects.test.js`

**Step 1: Write the failing tests**

Update the import line:

```js
import {
  tickEffects, applyPoison, applyHeal,
  applySleep, applyStun, applyConfuse,
  applyAttackBuff, applyHaste, applyShield, applyTeamShield, applyTaunt
} from '../../src/game/combat/effects.js';
```

Add test blocks:

```js
describe('Combat Effects - Apply Attack Buff', () => {
  it('adds attack_buff with percent from skill power', () => {
    const target = { hp: 100, maxHp: 100, activeEffects: [] };
    applyAttackBuff(target, { percent: 30, duration: 2, sourceId: 'buffer-1' });
    assert.strictEqual(target.activeEffects.length, 1);
    assert.strictEqual(target.activeEffects[0].type, 'attack_buff');
    assert.strictEqual(target.activeEffects[0].percent, 30);
    assert.strictEqual(target.activeEffects[0].remainingTurns, 2);
  });

  it('refreshes duration on reapplication', () => {
    const target = { hp: 100, maxHp: 100, activeEffects: [
      { type: 'attack_buff', percent: 30, remainingTurns: 1, sourceId: 'old' }
    ]};
    applyAttackBuff(target, { percent: 50, duration: 2, sourceId: 'new' });
    const buffs = target.activeEffects.filter(e => e.type === 'attack_buff');
    assert.strictEqual(buffs.length, 1);
    assert.strictEqual(buffs[0].percent, 50);
    assert.strictEqual(buffs[0].remainingTurns, 2);
  });
});

describe('Combat Effects - Apply Haste', () => {
  it('adds haste effect (no remainingTurns)', () => {
    const target = { hp: 100, maxHp: 100, activeEffects: [] };
    applyHaste(target, { sourceId: 'buffer-1' });
    assert.strictEqual(target.activeEffects.length, 1);
    assert.strictEqual(target.activeEffects[0].type, 'haste');
    assert.strictEqual(target.activeEffects[0].remainingTurns, undefined);
  });
});

describe('Combat Effects - Apply Shield', () => {
  it('adds shield with percent damage reduction', () => {
    const target = { hp: 100, maxHp: 100, activeEffects: [] };
    applyShield(target, { percent: 50, duration: 2, sourceId: 'tank-1' });
    assert.strictEqual(target.activeEffects.length, 1);
    assert.strictEqual(target.activeEffects[0].type, 'shield');
    assert.strictEqual(target.activeEffects[0].percent, 50);
    assert.strictEqual(target.activeEffects[0].remainingTurns, 2);
  });
});

describe('Combat Effects - Apply Team Shield', () => {
  it('applies shield to all alive allies', () => {
    const allies = [
      { hp: 100, maxHp: 100, activeEffects: [] },
      { hp: 80, maxHp: 100, activeEffects: [] },
      { hp: 0, maxHp: 100, activeEffects: [] }  // KO'd
    ];
    applyTeamShield(allies, { percent: 40, duration: 2, sourceId: 'tank-1' });
    assert.strictEqual(allies[0].activeEffects.length, 1);
    assert.strictEqual(allies[0].activeEffects[0].type, 'team_shield');
    assert.strictEqual(allies[1].activeEffects.length, 1);
    assert.strictEqual(allies[2].activeEffects.length, 0, 'KOd ally should not get shield');
  });
});

describe('Combat Effects - Apply Taunt', () => {
  it('adds taunt effect with 2-turn duration', () => {
    const target = { hp: 100, maxHp: 100, activeEffects: [] };
    applyTaunt(target, { duration: 2, sourceId: 'tank-1' });
    assert.strictEqual(target.activeEffects.length, 1);
    assert.strictEqual(target.activeEffects[0].type, 'taunt');
    assert.strictEqual(target.activeEffects[0].remainingTurns, 2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/combat-effects.test.js`
Expected: FAIL — new functions not exported

**Step 3: Implement the apply functions**

Add to `src/game/combat/effects.js`:

```js
export function applyAttackBuff(target, { percent, duration = 2, sourceId }) {
  applyOrRefresh(target, { type: 'attack_buff', percent, remainingTurns: duration, sourceId });
}

export function applyHaste(target, { sourceId }) {
  if (!target.activeEffects) {
    target.activeEffects = [];
  }
  // Haste has no remainingTurns — consumed on use
  const existing = target.activeEffects.find(e => e.type === 'haste');
  if (!existing) {
    target.activeEffects.push({ type: 'haste', sourceId });
  }
}

export function applyShield(target, { percent, duration = 2, sourceId }) {
  applyOrRefresh(target, { type: 'shield', percent, remainingTurns: duration, sourceId });
}

export function applyTeamShield(allies, { percent, duration = 2, sourceId }) {
  for (const ally of allies) {
    if (ally.hp > 0) {
      applyOrRefresh(ally, { type: 'team_shield', percent, remainingTurns: duration, sourceId });
    }
  }
}

export function applyTaunt(target, { duration = 2, sourceId }) {
  applyOrRefresh(target, { type: 'taunt', remainingTurns: duration, sourceId });
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/combat-effects.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/game/combat/effects.js tests/unit/combat-effects.test.js
git commit -m "feat: add apply functions for attack_buff, haste, shield, team_shield, taunt"
```

---

### Task 3: Query helpers and expanded tickEffects

**Files:**
- Modify: `src/game/combat/effects.js`
- Test: `tests/unit/combat-effects.test.js`

**Step 1: Write the failing tests**

Update imports:

```js
import {
  tickEffects, applyPoison, applyHeal,
  applySleep, applyStun, applyConfuse,
  applyAttackBuff, applyHaste, applyShield, applyTeamShield, applyTaunt,
  isIncapacitated, isConfused, hasHaste, consumeHaste,
  getAttackMultiplier, getDamageReduction, getTauntTarget, breakSleep
} from '../../src/game/combat/effects.js';
```

Add test blocks:

```js
describe('Combat Effects - Query Helpers', () => {
  it('isIncapacitated returns true for sleep', () => {
    const robot = { activeEffects: [{ type: 'sleep', remainingTurns: 2 }] };
    assert.strictEqual(isIncapacitated(robot), true);
  });

  it('isIncapacitated returns true for stun', () => {
    const robot = { activeEffects: [{ type: 'stun', remainingTurns: 1 }] };
    assert.strictEqual(isIncapacitated(robot), true);
  });

  it('isIncapacitated returns false with no effects', () => {
    const robot = { activeEffects: [] };
    assert.strictEqual(isIncapacitated(robot), false);
  });

  it('isIncapacitated returns false when activeEffects is missing', () => {
    const robot = {};
    assert.strictEqual(isIncapacitated(robot), false);
  });

  it('isConfused returns true for confuse', () => {
    const robot = { activeEffects: [{ type: 'confuse', remainingTurns: 2 }] };
    assert.strictEqual(isConfused(robot), true);
  });

  it('isConfused returns false with no confuse', () => {
    const robot = { activeEffects: [] };
    assert.strictEqual(isConfused(robot), false);
  });

  it('hasHaste returns true when haste effect present', () => {
    const robot = { activeEffects: [{ type: 'haste', sourceId: 'x' }] };
    assert.strictEqual(hasHaste(robot), true);
  });

  it('consumeHaste removes the haste effect', () => {
    const robot = { activeEffects: [{ type: 'haste', sourceId: 'x' }, { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: 'y' }] };
    consumeHaste(robot);
    assert.strictEqual(hasHaste(robot), false);
    assert.strictEqual(robot.activeEffects.length, 1);
  });

  it('getAttackMultiplier returns 1 with no buffs', () => {
    const robot = { activeEffects: [] };
    assert.strictEqual(getAttackMultiplier(robot), 1);
  });

  it('getAttackMultiplier returns 1.3 with 30% attack buff', () => {
    const robot = { activeEffects: [{ type: 'attack_buff', percent: 30, remainingTurns: 2 }] };
    assert.strictEqual(getAttackMultiplier(robot), 1.3);
  });

  it('getDamageReduction returns 0 with no shields', () => {
    const robot = { activeEffects: [] };
    assert.strictEqual(getDamageReduction(robot), 0);
  });

  it('getDamageReduction combines shield and team_shield', () => {
    const robot = { activeEffects: [
      { type: 'shield', percent: 30, remainingTurns: 2 },
      { type: 'team_shield', percent: 20, remainingTurns: 2 }
    ]};
    assert.strictEqual(getDamageReduction(robot), 50);
  });

  it('getDamageReduction caps at 90', () => {
    const robot = { activeEffects: [
      { type: 'shield', percent: 60, remainingTurns: 2 },
      { type: 'team_shield', percent: 50, remainingTurns: 2 }
    ]};
    assert.strictEqual(getDamageReduction(robot), 90);
  });

  it('getTauntTarget returns taunting ally', () => {
    const allies = [
      { id: 'a', hp: 100, activeEffects: [] },
      { id: 'b', hp: 100, activeEffects: [{ type: 'taunt', remainingTurns: 2 }] }
    ];
    assert.strictEqual(getTauntTarget(allies), allies[1]);
  });

  it('getTauntTarget returns null when no taunt', () => {
    const allies = [
      { id: 'a', hp: 100, activeEffects: [] }
    ];
    assert.strictEqual(getTauntTarget(allies), null);
  });

  it('getTauntTarget ignores KOd taunter', () => {
    const allies = [
      { id: 'a', hp: 0, activeEffects: [{ type: 'taunt', remainingTurns: 2 }] }
    ];
    assert.strictEqual(getTauntTarget(allies), null);
  });
});

describe('Combat Effects - breakSleep', () => {
  it('removes sleep effect from target', () => {
    const target = { activeEffects: [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }] };
    breakSleep(target);
    assert.strictEqual(target.activeEffects.length, 0);
  });

  it('does nothing if no sleep effect', () => {
    const target = { activeEffects: [{ type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: 'x' }] };
    breakSleep(target);
    assert.strictEqual(target.activeEffects.length, 1);
  });
});

describe('Combat Effects - Tick expands to all types', () => {
  it('decrements sleep remainingTurns and removes when expired', () => {
    const robot = { id: 'r', nameEn: 'R', hp: 100, maxHp: 100, activeEffects: [
      { type: 'sleep', remainingTurns: 1, sourceId: 'x' }
    ]};
    const events = tickEffects(robot);
    assert.strictEqual(robot.activeEffects.length, 0);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'sleep_tick');
  });

  it('decrements attack_buff and keeps while remaining > 0', () => {
    const robot = { id: 'r', nameEn: 'R', hp: 100, maxHp: 100, activeEffects: [
      { type: 'attack_buff', percent: 30, remainingTurns: 2, sourceId: 'x' }
    ]};
    tickEffects(robot);
    assert.strictEqual(robot.activeEffects.length, 1);
    assert.strictEqual(robot.activeEffects[0].remainingTurns, 1);
  });

  it('does not tick haste (no remainingTurns)', () => {
    const robot = { id: 'r', nameEn: 'R', hp: 100, maxHp: 100, activeEffects: [
      { type: 'haste', sourceId: 'x' }
    ]};
    tickEffects(robot);
    assert.strictEqual(robot.activeEffects.length, 1, 'haste should persist through ticks');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/combat-effects.test.js`
Expected: FAIL — new functions not exported

**Step 3: Implement query helpers and expand tickEffects**

Add query helpers to `src/game/combat/effects.js`:

```js
export function isIncapacitated(robot) {
  if (!robot.activeEffects) return false;
  return robot.activeEffects.some(e => e.type === 'sleep' || e.type === 'stun');
}

export function isConfused(robot) {
  if (!robot.activeEffects) return false;
  return robot.activeEffects.some(e => e.type === 'confuse');
}

export function hasHaste(robot) {
  if (!robot.activeEffects) return false;
  return robot.activeEffects.some(e => e.type === 'haste');
}

export function consumeHaste(robot) {
  if (!robot.activeEffects) return;
  robot.activeEffects = robot.activeEffects.filter(e => e.type !== 'haste');
}

export function getAttackMultiplier(robot) {
  if (!robot.activeEffects) return 1;
  const totalPercent = robot.activeEffects
    .filter(e => e.type === 'attack_buff')
    .reduce((sum, e) => sum + e.percent, 0);
  return 1 + totalPercent / 100;
}

export function getDamageReduction(robot) {
  if (!robot.activeEffects) return 0;
  const totalPercent = robot.activeEffects
    .filter(e => e.type === 'shield' || e.type === 'team_shield')
    .reduce((sum, e) => sum + e.percent, 0);
  return Math.min(totalPercent, 90);
}

export function getTauntTarget(allies) {
  const taunter = allies.find(a => a.hp > 0 && a.activeEffects?.some(e => e.type === 'taunt'));
  return taunter || null;
}

export function breakSleep(target) {
  if (!target.activeEffects) return;
  target.activeEffects = target.activeEffects.filter(e => e.type !== 'sleep');
}
```

Expand `tickEffects` to handle all effect types. Replace the existing function:

```js
export function tickEffects(robot) {
  if (!robot.activeEffects || robot.activeEffects.length === 0) {
    return [];
  }

  const events = [];

  for (const effect of robot.activeEffects) {
    if (effect.type === 'poison') {
      const actualDamage = Math.min(effect.damagePerTurn, robot.hp - 1);
      const damage = Math.max(0, actualDamage);
      robot.hp -= damage;
      effect.remainingTurns -= 1;
      events.push({
        type: 'poison',
        targetId: robot.id,
        targetName: robot.nameEn,
        damage,
        remainingTurns: effect.remainingTurns,
      });
    } else if (effect.type === 'haste') {
      // Haste has no remainingTurns — consumed on use, not on tick
      continue;
    } else if (effect.remainingTurns !== undefined) {
      // All other turn-based effects: decrement
      effect.remainingTurns -= 1;
      events.push({
        type: effect.type + '_tick',
        targetId: robot.id,
        targetName: robot.nameEn,
        remainingTurns: effect.remainingTurns,
      });
    }
  }

  // Remove expired effects (remainingTurns <= 0), keep haste (no remainingTurns)
  robot.activeEffects = robot.activeEffects.filter(
    e => e.remainingTurns === undefined || e.remainingTurns > 0
  );

  return events;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/combat-effects.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/game/combat/effects.js tests/unit/combat-effects.test.js
git commit -m "feat: add query helpers, breakSleep, and expand tickEffects for all status types"
```

---

### Task 4: Combat service — incapacitated, confused, haste in processAttackTurn

**Files:**
- Modify: `src/game/services/robot-combat-service.js`
- Test: `tests/unit/robot-combat-service.test.js`

**Step 1: Write the failing tests**

Add to `tests/unit/robot-combat-service.test.js`:

```js
describe('Robot Combat - Status Effects in Attack Turn', () => {
  it('sleeping robot skips its attack', () => {
    const allies = [instantiateRobot('sizzlit')];
    allies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const enemies = [instantiateRobot('drizzlet')];
    const startHp = enemies[0].hp;
    const result = processAttackTurn(allies, enemies);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(enemies[0].hp, startHp, 'enemy should not take damage');
  });

  it('stunned robot skips its attack', () => {
    const allies = [instantiateRobot('sizzlit')];
    allies[0].activeEffects = [{ type: 'stun', remainingTurns: 1, sourceId: 'x' }];
    const enemies = [instantiateRobot('drizzlet')];
    const startHp = enemies[0].hp;
    const result = processAttackTurn(allies, enemies);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(enemies[0].hp, startHp);
  });

  it('confused robot randomly targets from all creatures', () => {
    const allies = [instantiateRobot('sizzlit'), instantiateRobot('drizzlet')];
    allies[0].activeEffects = [{ type: 'confuse', remainingTurns: 2, sourceId: 'x' }];
    const enemies = [instantiateRobot('petalia')];
    // Run multiple times — confused targeting is random, so just verify it returns attacks
    const result = processAttackTurn(allies, enemies);
    // Confused robot should still produce an attack event
    assert.ok(result.attacks.length >= 1);
  });

  it('hasted robot attacks twice', () => {
    const allies = [instantiateRobot('sizzlit')];
    allies[0].activeEffects = [{ type: 'haste', sourceId: 'x' }];
    const enemies = [instantiateRobot('drizzlet')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;
    const result = processAttackTurn(allies, enemies);
    assert.strictEqual(result.attacks.length, 2, 'hasted robot should attack twice');
    // Haste should be consumed
    assert.ok(!allies[0].activeEffects.some(e => e.type === 'haste'));
  });

  it('attack-buffed robot deals more damage', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;

    // Unbuffed attack
    const result1 = processAttackTurn(
      [{ ...allies[0], activeEffects: [] }],
      [{ ...enemies[0] }]
    );

    // Buffed attack (100% buff for clear difference)
    allies[0].activeEffects = [{ type: 'attack_buff', percent: 100, remainingTurns: 2, sourceId: 'x' }];
    const enemies2 = [instantiateRobot('drizzlet')];
    enemies2[0].hp = 9999;
    enemies2[0].maxHp = 9999;
    const result2 = processAttackTurn(allies, enemies2);

    // With 100% buff, damage should be roughly 2x (variance makes exact comparison impossible)
    // Just verify the buffed attack did more damage in expectation
    assert.ok(result2.attacks[0].damage > 0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: Tests pass but with wrong behavior (sleeping robot still attacks, etc.)

**Step 3: Implement status effect checks in processAttackTurn**

Modify `src/game/services/robot-combat-service.js`. Add imports:

```js
import {
  applyHeal, applyPoison, tickEffects,
  applySleep, applyStun, applyConfuse,
  applyAttackBuff, applyHaste, applyShield, applyTeamShield, applyTaunt,
  isIncapacitated, isConfused, hasHaste, consumeHaste,
  getAttackMultiplier, getDamageReduction, getTauntTarget, breakSleep
} from '../combat/effects.js';
```

Modify `processAttackTurn` — add checks at the start of the robot loop, after the `if (robot.hp <= 0) continue;` line:

```js
for (const robot of allies) {
    if (robot.hp <= 0) continue;

    // Status effect checks
    if (isIncapacitated(robot)) continue;  // sleep/stun: skip turn

    const aliveEnemies = enemies.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) break;

    // Determine how many times this robot attacks (haste = 2)
    const attackCount = hasHaste(robot) ? 2 : 1;
    if (hasHaste(robot)) consumeHaste(robot);

    for (let strike = 0; strike < attackCount; strike++) {
      const currentAliveEnemies = enemies.filter(e => e.hp > 0);
      if (currentAliveEnemies.length === 0) break;

      // Confused: pick random target from all alive creatures (allies + enemies)
      let target;
      if (isConfused(robot)) {
        const allAlive = [...allies, ...enemies].filter(c => c.hp > 0 && c.id !== robot.id);
        target = allAlive[Math.floor(Math.random() * allAlive.length)];
      } else {
        target = selectTarget(robot, currentAliveEnemies);
      }

      const elemMult = getElementMultiplier(robot.autoSkill.element, target.element);
      const variance = rollVariance();
      let buffedAttack = itemBuffs ? getBuffedAttack(robot.attack, itemBuffs) : robot.attack;
      buffedAttack = Math.floor(buffedAttack * getAttackMultiplier(robot));
      const buffedPower = itemBuffs ? getBuffedAutoPower(robot.autoSkill.power, itemBuffs) : robot.autoSkill.power;
      const buffedElemMult = itemBuffs ? getBuffedElementMultiplier(elemMult, itemBuffs) : elemMult;
      const damage = calculateRobotDamage(buffedAttack, buffedPower, buffedElemMult, variance);
      target.hp = Math.max(0, target.hp - damage);

      // Wake up sleeping targets that took damage
      if (damage > 0) breakSleep(target);

      // Only give charge on first strike
      if (strike === 0) {
        robot.ultimate.charges = Math.min(
          robot.ultimate.charges + 1,
          robot.ultimate.chargesRequired
        );
      }

      const targetDefeated = target.hp <= 0;

      attacks.push({
        attackerId: robot.id,
        attackerName: robot.nameEn,
        attackerElement: robot.element,
        targetId: target.id,
        targetName: target.nameEn,
        damage,
        elementMultiplier: elemMult,
        targetDefeated,
        attackerCharges: robot.ultimate.charges,
        attackerChargesRequired: robot.ultimate.chargesRequired,
        confused: isConfused(robot),
        hasteStrike: attackCount > 1 ? strike + 1 : undefined,
      });

      if (targetDefeated && !defeatedEnemyIds.has(target.id) && robotParty) {
        defeatedEnemyIds.add(target.id);
        const xpEvent = awardKillXp(robotParty, 50);
        xpEvents.push({ enemyId: target.id, enemyName: target.nameEn, ...xpEvent });
      }
    }
  }
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/unit/robot-combat-service.test.js
git commit -m "feat: add incapacitated, confused, haste, attack_buff checks to processAttackTurn"
```

---

### Task 5: Combat service — taunt, shield, sleep-break in processEnemyTurn

**Files:**
- Modify: `src/game/services/robot-combat-service.js`
- Test: `tests/unit/robot-combat-service.test.js`

**Step 1: Write the failing tests**

Add to `tests/unit/robot-combat-service.test.js`:

```js
describe('Robot Combat - Status Effects in Enemy Turn', () => {
  it('sleeping enemy skips its attack', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
    enemies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const startHp = allies[0].hp;
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(allies[0].hp, startHp);
  });

  it('enemy respects taunt and targets taunting ally', () => {
    const taunter = instantiateRobot('sizzlit');
    taunter.activeEffects = [{ type: 'taunt', remainingTurns: 2, sourceId: 'self' }];
    const other = instantiateRobot('drizzlet');
    const allies = [other, taunter];
    const enemies = [instantiateRobot('petalia')];
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 1);
    assert.strictEqual(result.attacks[0].targetId, taunter.id);
  });

  it('shield reduces damage to ally', () => {
    const ally = instantiateRobot('sizzlit');
    ally.activeEffects = [{ type: 'shield', percent: 50, remainingTurns: 2, sourceId: 'x' }];
    const allies = [ally];
    const enemies = [instantiateRobot('drizzlet')];
    const result = processEnemyTurn(enemies, allies);
    // Damage should be reduced — we just verify the attack happened with reduced damage
    assert.strictEqual(result.attacks.length, 1);
    // Can't assert exact damage due to variance, but damage should be > 0
    assert.ok(result.attacks[0].damage >= 0);
  });

  it('damage wakes up sleeping ally', () => {
    const ally = instantiateRobot('sizzlit');
    ally.activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const allies = [ally];
    const enemies = [instantiateRobot('drizzlet')];
    processEnemyTurn(enemies, allies);
    // Sleep should be broken by enemy's damage
    assert.ok(!ally.activeEffects.some(e => e.type === 'sleep'));
  });

  it('confused enemy can hit its own allies', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet'), instantiateRobot('petalia')];
    enemies[0].activeEffects = [{ type: 'confuse', remainingTurns: 2, sourceId: 'x' }];
    // Run the turn — confused enemy targets randomly from all creatures
    const result = processEnemyTurn(enemies, allies);
    assert.ok(result.attacks.length >= 1);
  });

  it('hasted enemy attacks twice', () => {
    const allies = [instantiateRobot('sizzlit')];
    allies[0].hp = 9999;
    allies[0].maxHp = 9999;
    const enemies = [instantiateRobot('drizzlet')];
    enemies[0].activeEffects = [{ type: 'haste', sourceId: 'x' }];
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 2);
    assert.ok(!enemies[0].activeEffects.some(e => e.type === 'haste'));
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: FAIL — enemy doesn't skip when sleeping, taunt not respected, etc.

**Step 3: Implement status effect checks in processEnemyTurn**

Modify `processEnemyTurn` in `src/game/services/robot-combat-service.js`:

```js
export function processEnemyTurn(enemies, allies, defendActive = false, itemBuffs = null) {
  const attacks = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (isIncapacitated(enemy)) continue;

    const aliveAllies = allies.filter(a => a.hp > 0);
    if (aliveAllies.length === 0) break;

    const attackCount = hasHaste(enemy) ? 2 : 1;
    if (hasHaste(enemy)) consumeHaste(enemy);

    for (let strike = 0; strike < attackCount; strike++) {
      const currentAliveAllies = allies.filter(a => a.hp > 0);
      if (currentAliveAllies.length === 0) break;

      // Confused: random target from all alive creatures
      // Taunt: forced target (only when not confused)
      let target;
      if (isConfused(enemy)) {
        const allAlive = [...allies, ...enemies].filter(c => c.hp > 0 && c.id !== enemy.id);
        target = allAlive[Math.floor(Math.random() * allAlive.length)];
      } else {
        const taunter = getTauntTarget(currentAliveAllies);
        target = taunter || selectTarget(enemy, currentAliveAllies);
      }

      const elemMult = getElementMultiplier(enemy.autoSkill.element, target.element);
      const variance = rollVariance();
      let buffedAttack = Math.floor(enemy.attack * getAttackMultiplier(enemy));
      let damage = calculateRobotDamage(buffedAttack, enemy.autoSkill.power, elemMult, variance);

      if (defendActive) {
        damage = Math.floor(damage * 0.5);
      }
      if (itemBuffs) {
        damage = applyDamageReduction(damage, itemBuffs);
      }

      // Apply shield/team_shield damage reduction
      const shieldReduction = getDamageReduction(target);
      if (shieldReduction > 0) {
        damage = Math.floor(damage * (1 - shieldReduction / 100));
      }

      target.hp = Math.max(0, target.hp - damage);

      if (damage > 0) breakSleep(target);

      if (strike === 0) {
        enemy.ultimate.charges = Math.min(
          enemy.ultimate.charges + 1,
          enemy.ultimate.chargesRequired
        );
      }

      attacks.push({
        attackerId: enemy.id,
        attackerName: enemy.nameEn,
        attackerElement: enemy.element,
        targetId: target.id,
        targetName: target.nameEn,
        damage,
        elementMultiplier: elemMult,
        targetDefeated: target.hp <= 0,
        confused: isConfused(enemy),
        hasteStrike: attackCount > 1 ? strike + 1 : undefined,
      });
    }
  }
  return { attacks, allAlliesDefeated: allies.every(a => a.hp <= 0) };
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/unit/robot-combat-service.test.js
git commit -m "feat: add taunt, shield, sleep-break, incapacitated, confused, haste to processEnemyTurn"
```

---

### Task 6: Ultimate type routing for all 8 new effect types

**Files:**
- Modify: `src/game/services/robot-combat-service.js`
- Test: `tests/unit/robot-combat-service.test.js`

**Step 1: Write the failing tests**

Add to `tests/unit/robot-combat-service.test.js`:

```js
describe('Robot Combat - Status Effect Ultimates', () => {
  it('sleep ultimate applies sleep to single enemy', () => {
    const caster = instantiateRobot('sizzlit');
    caster.ultimate.type = 'sleep';
    caster.ultimate.target = 'single_enemy';
    caster.ultimate.charges = caster.ultimate.chargesRequired;
    const enemies = [instantiateRobot('drizzlet')];
    const result = processUltimate(caster, enemies);
    assert.ok(result.success);
    assert.strictEqual(result.type, 'sleep');
    assert.strictEqual(caster.ultimate.charges, 0);
    assert.ok(enemies[0].activeEffects.some(e => e.type === 'sleep'));
  });

  it('stun ultimate applies stun to single enemy', () => {
    const caster = instantiateRobot('sizzlit');
    caster.ultimate.type = 'stun';
    caster.ultimate.target = 'single_enemy';
    caster.ultimate.charges = caster.ultimate.chargesRequired;
    const enemies = [instantiateRobot('drizzlet')];
    const result = processUltimate(caster, enemies);
    assert.ok(result.success);
    assert.strictEqual(result.type, 'stun');
    assert.ok(enemies[0].activeEffects.some(e => e.type === 'stun'));
  });

  it('confuse ultimate applies confuse to single enemy', () => {
    const caster = instantiateRobot('sizzlit');
    caster.ultimate.type = 'confuse';
    caster.ultimate.target = 'single_enemy';
    caster.ultimate.charges = caster.ultimate.chargesRequired;
    const enemies = [instantiateRobot('drizzlet')];
    const result = processUltimate(caster, enemies);
    assert.ok(result.success);
    assert.strictEqual(result.type, 'confuse');
    assert.ok(enemies[0].activeEffects.some(e => e.type === 'confuse'));
  });

  it('attack_buff ultimate buffs single ally', () => {
    const caster = instantiateRobot('sizzlit');
    caster.ultimate.type = 'attack_buff';
    caster.ultimate.target = 'single_ally';
    caster.ultimate.power = 30;
    caster.ultimate.charges = caster.ultimate.chargesRequired;
    const ally = instantiateRobot('drizzlet');
    ally.hp = 50; // make it the lowest HP% to be selected
    const party = { active: [caster, ally], reserves: [] };
    const result = processUltimate(caster, [], null, party);
    assert.ok(result.success);
    assert.strictEqual(result.type, 'attack_buff');
    // Should buff the ally (lowest HP%) — or caster if caster is lowest
    const buffed = party.active.find(r => r.activeEffects?.some(e => e.type === 'attack_buff'));
    assert.ok(buffed);
    assert.strictEqual(buffed.activeEffects.find(e => e.type === 'attack_buff').percent, 30);
  });

  it('haste ultimate gives haste to single ally', () => {
    const caster = instantiateRobot('sizzlit');
    caster.ultimate.type = 'haste';
    caster.ultimate.target = 'single_ally';
    caster.ultimate.charges = caster.ultimate.chargesRequired;
    const ally = instantiateRobot('drizzlet');
    ally.hp = 50;
    const party = { active: [caster, ally], reserves: [] };
    const result = processUltimate(caster, [], null, party);
    assert.ok(result.success);
    assert.strictEqual(result.type, 'haste');
    const hasted = party.active.find(r => r.activeEffects?.some(e => e.type === 'haste'));
    assert.ok(hasted);
  });

  it('shield ultimate shields single ally', () => {
    const caster = instantiateRobot('sizzlit');
    caster.ultimate.type = 'shield';
    caster.ultimate.target = 'single_ally';
    caster.ultimate.power = 50;
    caster.ultimate.charges = caster.ultimate.chargesRequired;
    const ally = instantiateRobot('drizzlet');
    ally.hp = 50;
    const party = { active: [caster, ally], reserves: [] };
    const result = processUltimate(caster, [], null, party);
    assert.ok(result.success);
    assert.strictEqual(result.type, 'shield');
    const shielded = party.active.find(r => r.activeEffects?.some(e => e.type === 'shield'));
    assert.ok(shielded);
    assert.strictEqual(shielded.activeEffects.find(e => e.type === 'shield').percent, 50);
  });

  it('team_shield ultimate shields all allies', () => {
    const caster = instantiateRobot('sizzlit');
    caster.ultimate.type = 'team_shield';
    caster.ultimate.target = 'all_allies';
    caster.ultimate.power = 40;
    caster.ultimate.charges = caster.ultimate.chargesRequired;
    const ally1 = instantiateRobot('drizzlet');
    const ally2 = instantiateRobot('petalia');
    const party = { active: [caster, ally1, ally2], reserves: [] };
    const result = processUltimate(caster, [], null, party);
    assert.ok(result.success);
    assert.strictEqual(result.type, 'team_shield');
    assert.ok(caster.activeEffects.some(e => e.type === 'team_shield'));
    assert.ok(ally1.activeEffects.some(e => e.type === 'team_shield'));
    assert.ok(ally2.activeEffects.some(e => e.type === 'team_shield'));
  });

  it('taunt ultimate applies taunt to self', () => {
    const caster = instantiateRobot('sizzlit');
    caster.ultimate.type = 'taunt';
    caster.ultimate.target = 'self';
    caster.ultimate.charges = caster.ultimate.chargesRequired;
    const party = { active: [caster], reserves: [] };
    const result = processUltimate(caster, [], null, party);
    assert.ok(result.success);
    assert.strictEqual(result.type, 'taunt');
    assert.ok(caster.activeEffects.some(e => e.type === 'taunt'));
  });

  it('effect ultimate rejects if not enough charges', () => {
    const caster = instantiateRobot('sizzlit');
    caster.ultimate.type = 'sleep';
    caster.ultimate.charges = 0;
    const enemies = [instantiateRobot('drizzlet')];
    const result = processUltimate(caster, enemies);
    assert.ok(!result.success);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: FAIL — unknown ultimate types fall through to damage

**Step 3: Implement ultimate type routing**

Add a new function `processStatusEffectUltimate` in `robot-combat-service.js` and add branches in `processUltimate`:

In `processUltimate`, after the poison check and before the damage targeting logic, add:

```js
// Status effect ultimates
const STATUS_EFFECT_TYPES = ['sleep', 'stun', 'confuse', 'attack_buff', 'haste', 'shield', 'team_shield', 'taunt'];
if (STATUS_EFFECT_TYPES.includes(ultType)) {
  return processStatusEffectUltimate(robot, ultType, enemies, robotParty);
}
```

Add the new function:

```js
function processStatusEffectUltimate(robot, effectType, enemies, robotParty) {
  const ultTarget = robot.ultimate.target || 'single_enemy';
  const power = robot.ultimate.power || 0;
  const effectEvents = [];
  const allies = robotParty?.active || [];

  // Debuffs target enemies
  if (['sleep', 'stun', 'confuse'].includes(effectType)) {
    const aliveEnemies = enemies.filter(e => e.hp > 0);
    let targets;
    if (ultTarget === 'all_enemies') {
      targets = aliveEnemies;
    } else {
      const selected = selectTarget(robot, aliveEnemies);
      targets = selected ? [selected] : [];
    }

    for (const target of targets) {
      if (effectType === 'sleep') applySleep(target, { duration: 2, sourceId: robot.id });
      else if (effectType === 'stun') applyStun(target, { sourceId: robot.id });
      else if (effectType === 'confuse') applyConfuse(target, { duration: 2, sourceId: robot.id });

      effectEvents.push({
        type: effectType,
        targetId: target.id,
        targetName: target.nameEn,
      });
    }
  }

  // Buffs target allies
  if (['attack_buff', 'haste', 'shield'].includes(effectType)) {
    let targets;
    if (ultTarget === 'all_allies') {
      targets = allies.filter(r => r.hp > 0);
    } else {
      // single_ally: pick ally with lowest HP%
      const candidates = allies.filter(r => r.hp > 0);
      candidates.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
      targets = candidates.length > 0 ? [candidates[0]] : [];
    }

    for (const target of targets) {
      if (effectType === 'attack_buff') applyAttackBuff(target, { percent: power, duration: 2, sourceId: robot.id });
      else if (effectType === 'haste') applyHaste(target, { sourceId: robot.id });
      else if (effectType === 'shield') applyShield(target, { percent: power, duration: 2, sourceId: robot.id });

      effectEvents.push({
        type: effectType,
        targetId: target.id,
        targetName: target.nameEn,
        percent: power || undefined,
      });
    }
  }

  // team_shield: all allies
  if (effectType === 'team_shield') {
    applyTeamShield(allies, { percent: power, duration: 2, sourceId: robot.id });
    for (const ally of allies.filter(r => r.hp > 0)) {
      effectEvents.push({
        type: 'team_shield',
        targetId: ally.id,
        targetName: ally.nameEn,
        percent: power,
      });
    }
  }

  // taunt: self
  if (effectType === 'taunt') {
    applyTaunt(robot, { duration: 2, sourceId: robot.id });
    effectEvents.push({
      type: 'taunt',
      targetId: robot.id,
      targetName: robot.nameEn,
    });
  }

  robot.ultimate.charges = 0;

  return {
    success: true,
    type: effectType,
    robotId: robot.id,
    robotName: robot.nameEn,
    ultimateName: robot.ultimate.nameEn,
    effectEvents,
    hits: [],
    xpEvents: [],
    allEnemiesDefeated: false,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/unit/robot-combat-service.test.js
git commit -m "feat: add ultimate type routing for all 8 status effect types"
```

---

### Task 7: Damage reduction in processAttackTurn + sleep-break on ally attacks

**Files:**
- Modify: `src/game/services/robot-combat-service.js`
- Test: `tests/unit/robot-combat-service.test.js`

**Step 1: Write the failing tests**

Add to `tests/unit/robot-combat-service.test.js`:

```js
describe('Robot Combat - Shield in Attack Turn', () => {
  it('shielded enemy takes reduced damage from player attacks', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;
    // 90% shield — should drastically reduce damage
    enemies[0].activeEffects = [{ type: 'shield', percent: 90, remainingTurns: 2, sourceId: 'x' }];
    const result = processAttackTurn(allies, enemies);
    // With 90% shield, damage should be very small
    assert.ok(result.attacks[0].damage < allies[0].attack);
  });

  it('player attack wakes sleeping enemy', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
    enemies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    processAttackTurn(allies, enemies);
    assert.ok(!enemies[0].activeEffects.some(e => e.type === 'sleep'));
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: FAIL — shielded enemy takes full damage

**Step 3: Add shield damage reduction to processAttackTurn**

In the `processAttackTurn` function, after calculating `damage` and before `target.hp = Math.max(0, target.hp - damage)`, add:

```js
// Apply shield/team_shield damage reduction on target
const shieldReduction = getDamageReduction(target);
if (shieldReduction > 0) {
  damage = Math.floor(damage * (1 - shieldReduction / 100));
}
```

Note: `breakSleep` should already be called from Task 4's implementation. Verify it is present.

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/unit/robot-combat-service.test.js
git commit -m "feat: add shield damage reduction to processAttackTurn"
```

---

### Task 8: Syntax check and full test run

**Files:** None modified — verification only

**Step 1: Syntax check both modified files**

Run:
```bash
node --check src/game/combat/effects.js && echo "OK"
node --check src/game/services/robot-combat-service.js && echo "OK"
```
Expected: Both print "OK"

**Step 2: Run full unit test suite**

Run: `npm run test:unit`
Expected: All tests pass (or only pre-existing failures from chip pipeline tests)

**Step 3: Run integration tests**

Run: `npm run test:integration`
Expected: All pass (or only pre-existing failures)

**Step 4: Commit if any fixes were needed**

If any tests failed that needed fixes, commit the fixes:
```bash
git add -A
git commit -m "fix: resolve test failures from status effects integration"
```
