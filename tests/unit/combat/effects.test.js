import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  tickEffects, applyPoison, applyHeal,
  applySleep, applyStun, applyConfuse,
  applyTaunt, applyCleanse,
  initStatStages, resetStatStages, applyStatChange, applyStatChanges, getStageMultiplier,
  isIncapacitated, isConfused,
  getAttackMultiplier, getDefenseMultiplier, getDexMultiplier, getEffectiveDex,
  computeCritChance, rollCritical, computeDexHitChance, rollDodge,
  getTauntTarget, breakSleep
} from '../../../src/game/combat/effects.js';

describe('Combat Effects - Tick', () => {
  it('poison deals damage and decrements remaining turns', () => {
    const creature = { id: 'test', nameEn: 'Test', hp: 100, maxHp: 100, activeEffects: [
      { type: 'poison', remainingTurns: 3, damagePerTurn: 5, sourceId: 'attacker' }
    ]};
    const events = tickEffects(creature);
    assert.strictEqual(creature.hp, 95);
    assert.strictEqual(creature.activeEffects[0].remainingTurns, 2);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'poison');
    assert.strictEqual(events[0].damage, 5);
  });

  it('removes expired effects', () => {
    const creature = { id: 'test', nameEn: 'Test', hp: 100, maxHp: 100, activeEffects: [
      { type: 'poison', remainingTurns: 1, damagePerTurn: 5, sourceId: 'attacker' }
    ]};
    tickEffects(creature);
    assert.strictEqual(creature.activeEffects.length, 0);
  });

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

  it('handles empty activeEffects array', () => {
    const creature = { hp: 100, maxHp: 100, activeEffects: [] };
    const events = tickEffects(creature);
    assert.strictEqual(events.length, 0);
  });

  it('handles missing activeEffects field', () => {
    const creature = { hp: 100, maxHp: 100 };
    const events = tickEffects(creature);
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
    const target = { hp: 50, maxHp: 100 };
    const healed = applyHeal(target, 30);
    assert.strictEqual(target.hp, 80);
    assert.strictEqual(healed, 30);
  });

  it('caps healing at maxHp', () => {
    const target = { hp: 90, maxHp: 100 };
    const healed = applyHeal(target, 30);
    assert.strictEqual(target.hp, 100);
    assert.strictEqual(healed, 10);
  });

  it('does not heal KOd creatures', () => {
    const target = { hp: 0, maxHp: 100 };
    const healed = applyHeal(target, 30);
    assert.strictEqual(target.hp, 0);
    assert.strictEqual(healed, 0);
  });
});

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

describe('Combat Effects - Stat Stages', () => {
  it('initStatStages sets all stats to 0', () => {
    const creature = {};
    initStatStages(creature);
    assert.deepStrictEqual(creature.statStages, { atk: 0, def: 0, dex: 0 });
  });

  it('initStatStages does not overwrite existing stages', () => {
    const creature = { statStages: { atk: 3, def: -1 } };
    initStatStages(creature);
    assert.deepStrictEqual(creature.statStages, { atk: 3, def: -1, dex: 0 });
  });

  it('resetStatStages clears all stages to 0', () => {
    const creature = { statStages: { atk: 3, def: -2 } };
    resetStatStages(creature);
    assert.deepStrictEqual(creature.statStages, { atk: 0, def: 0, dex: 0 });
  });

  it('applyStatChange accumulates stages', () => {
    const creature = { statStages: { atk: 1, def: 0 } };
    const actual = applyStatChange(creature, 'atk', 2);
    assert.strictEqual(creature.statStages.atk, 3);
    assert.strictEqual(actual, 2);
  });

  it('applyStatChange clamps at +6', () => {
    const creature = { statStages: { atk: 5, def: 0 } };
    const actual = applyStatChange(creature, 'atk', 3);
    assert.strictEqual(creature.statStages.atk, 6);
    assert.strictEqual(actual, 1);
  });

  it('applyStatChange clamps at -6', () => {
    const creature = { statStages: { atk: -5, def: 0 } };
    const actual = applyStatChange(creature, 'atk', -3);
    assert.strictEqual(creature.statStages.atk, -6);
    assert.strictEqual(actual, -1);
  });

  it('applyStatChange returns 0 when already at cap', () => {
    const creature = { statStages: { atk: 6, def: 0 } };
    const actual = applyStatChange(creature, 'atk', 1);
    assert.strictEqual(actual, 0);
    assert.strictEqual(creature.statStages.atk, 6);
  });

  it('applyStatChanges applies multiple stats', () => {
    const creature = { statStages: { atk: 0, def: 0 } };
    const results = applyStatChanges(creature, { atk: 1, def: -1 });
    assert.strictEqual(creature.statStages.atk, 1);
    assert.strictEqual(creature.statStages.def, -1);
    assert.deepStrictEqual(results, { atk: 1, def: -1 });
  });

  it('applyStatChange initializes statStages if missing', () => {
    const creature = {};
    applyStatChange(creature, 'atk', 2);
    assert.strictEqual(creature.statStages.atk, 2);
    assert.strictEqual(creature.statStages.def, 0);
  });

  it('getStageMultiplier returns correct values', () => {
    const creature = { statStages: { atk: 0, def: 0 } };
    assert.strictEqual(getStageMultiplier(creature, 'atk'), 1.0);

    creature.statStages.atk = 1;
    assert.strictEqual(getStageMultiplier(creature, 'atk'), 1.5);

    creature.statStages.atk = 2;
    assert.strictEqual(getStageMultiplier(creature, 'atk'), 2.0);

    creature.statStages.atk = 6;
    assert.strictEqual(getStageMultiplier(creature, 'atk'), 4.0);

    creature.statStages.atk = -1;
    assert.ok(Math.abs(getStageMultiplier(creature, 'atk') - 2/3) < 0.001);

    creature.statStages.atk = -2;
    assert.strictEqual(getStageMultiplier(creature, 'atk'), 0.5);

    creature.statStages.atk = -6;
    assert.strictEqual(getStageMultiplier(creature, 'atk'), 0.25);
  });

  it('getStageMultiplier returns 1.0 when statStages is missing', () => {
    const creature = {};
    assert.strictEqual(getStageMultiplier(creature, 'atk'), 1.0);
  });

  it('getAttackMultiplier delegates to stage system', () => {
    const creature = { statStages: { atk: 2, def: 0 } };
    assert.strictEqual(getAttackMultiplier(creature), 2.0);
  });

  it('getDefenseMultiplier delegates to stage system', () => {
    const creature = { statStages: { atk: 0, def: -2 } };
    assert.strictEqual(getDefenseMultiplier(creature), 0.5);
  });

  it('getAttackMultiplier returns 1 with no statStages', () => {
    const creature = {};
    assert.strictEqual(getAttackMultiplier(creature), 1);
  });

  it('getDefenseMultiplier returns 1 with no statStages', () => {
    const creature = {};
    assert.strictEqual(getDefenseMultiplier(creature), 1);
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

describe('Combat Effects - Query Helpers', () => {
  it('isIncapacitated returns true for sleep', () => {
    const creature = { activeEffects: [{ type: 'sleep', remainingTurns: 2 }] };
    assert.strictEqual(isIncapacitated(creature), true);
  });

  it('isIncapacitated returns true for stun', () => {
    const creature = { activeEffects: [{ type: 'stun', remainingTurns: 1 }] };
    assert.strictEqual(isIncapacitated(creature), true);
  });

  it('isIncapacitated returns false with no effects', () => {
    const creature = { activeEffects: [] };
    assert.strictEqual(isIncapacitated(creature), false);
  });

  it('isIncapacitated returns false when activeEffects is missing', () => {
    const creature = {};
    assert.strictEqual(isIncapacitated(creature), false);
  });

  it('isConfused returns true for confuse', () => {
    const creature = { activeEffects: [{ type: 'confuse', remainingTurns: 2 }] };
    assert.strictEqual(isConfused(creature), true);
  });

  it('isConfused returns false with no confuse', () => {
    const creature = { activeEffects: [] };
    assert.strictEqual(isConfused(creature), false);
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
    assert.ok(computeCritChance({ dex: 1, statStages: { dex: -6 } }) >= 0.03);
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

describe('Combat Effects - Tick expands to all types', () => {
  it('decrements sleep remainingTurns and removes when expired', () => {
    const creature = { id: 'r', nameEn: 'R', hp: 100, maxHp: 100, activeEffects: [
      { type: 'sleep', remainingTurns: 1, sourceId: 'x' }
    ]};
    const events = tickEffects(creature);
    assert.strictEqual(creature.activeEffects.length, 0);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'sleep_tick');
  });

});
