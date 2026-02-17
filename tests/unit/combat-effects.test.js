import { describe, it } from 'node:test';
import assert from 'node:assert';
import { tickEffects, applyPoison, applyHeal, applySleep, applyStun, applyConfuse } from '../../src/game/combat/effects.js';

describe('Combat Effects - Tick', () => {
  it('poison deals damage and decrements remaining turns', () => {
    const robot = { id: 'test', nameEn: 'Test', hp: 100, maxHp: 100, activeEffects: [
      { type: 'poison', remainingTurns: 3, damagePerTurn: 5, sourceId: 'attacker' }
    ]};
    const events = tickEffects(robot);
    assert.strictEqual(robot.hp, 95);
    assert.strictEqual(robot.activeEffects[0].remainingTurns, 2);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'poison');
    assert.strictEqual(events[0].damage, 5);
  });

  it('removes expired effects', () => {
    const robot = { id: 'test', nameEn: 'Test', hp: 100, maxHp: 100, activeEffects: [
      { type: 'poison', remainingTurns: 1, damagePerTurn: 5, sourceId: 'attacker' }
    ]};
    tickEffects(robot);
    assert.strictEqual(robot.activeEffects.length, 0);
  });

  it('does not reduce HP below 1 from poison', () => {
    const robot = { id: 'test', nameEn: 'Test', hp: 3, maxHp: 100, activeEffects: [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 10, sourceId: 'attacker' }
    ]};
    tickEffects(robot);
    assert.strictEqual(robot.hp, 1);
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

  it('does not heal KOd robots', () => {
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
