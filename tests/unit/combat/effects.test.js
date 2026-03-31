import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  tickEffects, applyPoison, applyHeal,
  applySleep, applyStun, applyConfuse,
  applyHaste, applyShield, applyTeamShield, applyTaunt,
  initStatStages, resetStatStages, applyStatChange, applyStatChanges, getStageMultiplier,
  isIncapacitated, isConfused, hasHaste, consumeHaste,
  getAttackMultiplier, getDefenseMultiplier, getDamageReduction, getTauntTarget, breakSleep,
  applyTempAttackFlat, getFlatAttackBonus
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

  it('does not reduce HP below 1 from poison', () => {
    const creature = { id: 'test', nameEn: 'Test', hp: 3, maxHp: 100, activeEffects: [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 10, sourceId: 'attacker' }
    ]};
    tickEffects(creature);
    assert.strictEqual(creature.hp, 1);
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
    assert.deepStrictEqual(creature.statStages, { atk: 0, def: 0 });
  });

  it('initStatStages does not overwrite existing stages', () => {
    const creature = { statStages: { atk: 3, def: -1 } };
    initStatStages(creature);
    assert.deepStrictEqual(creature.statStages, { atk: 3, def: -1 });
  });

  it('resetStatStages clears all stages to 0', () => {
    const creature = { statStages: { atk: 3, def: -2 } };
    resetStatStages(creature);
    assert.deepStrictEqual(creature.statStages, { atk: 0, def: 0 });
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

  it('hasHaste returns true when haste effect present', () => {
    const creature = { activeEffects: [{ type: 'haste', sourceId: 'x' }] };
    assert.strictEqual(hasHaste(creature), true);
  });

  it('consumeHaste removes the haste effect', () => {
    const creature = { activeEffects: [{ type: 'haste', sourceId: 'x' }, { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: 'y' }] };
    consumeHaste(creature);
    assert.strictEqual(hasHaste(creature), false);
    assert.strictEqual(creature.activeEffects.length, 1);
  });

  it('getDamageReduction returns 0 with no shields', () => {
    const creature = { activeEffects: [] };
    assert.strictEqual(getDamageReduction(creature), 0);
  });

  it('getDamageReduction combines shield and team_shield', () => {
    const creature = { activeEffects: [
      { type: 'shield', percent: 30, remainingTurns: 2 },
      { type: 'team_shield', percent: 20, remainingTurns: 2 }
    ]};
    assert.strictEqual(getDamageReduction(creature), 50);
  });

  it('getDamageReduction caps at 90', () => {
    const creature = { activeEffects: [
      { type: 'shield', percent: 60, remainingTurns: 2 },
      { type: 'team_shield', percent: 50, remainingTurns: 2 }
    ]};
    assert.strictEqual(getDamageReduction(creature), 90);
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
    const creature = { id: 'r', nameEn: 'R', hp: 100, maxHp: 100, activeEffects: [
      { type: 'sleep', remainingTurns: 1, sourceId: 'x' }
    ]};
    const events = tickEffects(creature);
    assert.strictEqual(creature.activeEffects.length, 0);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'sleep_tick');
  });

  it('does not tick haste (no remainingTurns)', () => {
    const creature = { id: 'r', nameEn: 'R', hp: 100, maxHp: 100, activeEffects: [
      { type: 'haste', sourceId: 'x' }
    ]};
    tickEffects(creature);
    assert.strictEqual(creature.activeEffects.length, 1, 'haste should persist through ticks');
  });
});

describe('Combat Effects - Temp Attack Flat', () => {
  it('adds temp_attack_flat effect to creature', () => {
    const target = { hp: 100, maxHp: 100, activeEffects: [] };
    applyTempAttackFlat(target, { value: 3, duration: 5, sourceId: 'miso' });
    assert.strictEqual(target.activeEffects.length, 1);
    assert.strictEqual(target.activeEffects[0].type, 'temp_attack_flat');
    assert.strictEqual(target.activeEffects[0].value, 3);
    assert.strictEqual(target.activeEffects[0].remainingTurns, 5);
  });

  it('stacks additively (two separate effects)', () => {
    const target = { hp: 100, maxHp: 100, activeEffects: [] };
    applyTempAttackFlat(target, { value: 3, duration: 5, sourceId: 'miso' });
    applyTempAttackFlat(target, { value: 5, duration: 5, sourceId: 'takoyaki' });
    assert.strictEqual(target.activeEffects.length, 2);
  });

  it('initializes activeEffects if missing', () => {
    const target = { hp: 100, maxHp: 100 };
    applyTempAttackFlat(target, { value: 3, duration: 5, sourceId: 'miso' });
    assert.strictEqual(target.activeEffects.length, 1);
  });
});

describe('Combat Effects - getFlatAttackBonus', () => {
  it('returns 0 with no effects', () => {
    assert.strictEqual(getFlatAttackBonus({ activeEffects: [] }), 0);
  });

  it('returns 0 when activeEffects is missing', () => {
    assert.strictEqual(getFlatAttackBonus({}), 0);
  });

  it('sums multiple temp_attack_flat effects', () => {
    const creature = { activeEffects: [
      { type: 'temp_attack_flat', value: 3, remainingTurns: 5 },
      { type: 'temp_attack_flat', value: 5, remainingTurns: 3 }
    ]};
    assert.strictEqual(getFlatAttackBonus(creature), 8);
  });

  it('ignores other effect types', () => {
    const creature = { activeEffects: [
      { type: 'temp_attack_flat', value: 3, remainingTurns: 5 },
      { type: 'poison', damagePerTurn: 5, remainingTurns: 2, sourceId: 'x' }
    ]};
    assert.strictEqual(getFlatAttackBonus(creature), 3);
  });
});

describe('Combat Effects - Tick temp_attack_flat', () => {
  it('decrements remainingTurns each tick', () => {
    const creature = { id: 'r', nameEn: 'R', hp: 100, maxHp: 100, activeEffects: [
      { type: 'temp_attack_flat', value: 3, remainingTurns: 3 }
    ]};
    tickEffects(creature);
    assert.strictEqual(creature.activeEffects[0].remainingTurns, 2);
  });

  it('removes effect when remainingTurns hits 0', () => {
    const creature = { id: 'r', nameEn: 'R', hp: 100, maxHp: 100, activeEffects: [
      { type: 'temp_attack_flat', value: 3, remainingTurns: 1 }
    ]};
    tickEffects(creature);
    assert.strictEqual(creature.activeEffects.length, 0);
  });
});
