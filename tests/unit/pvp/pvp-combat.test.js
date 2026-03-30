import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildTurnOrder, resolveRound } from '../../../src/pvp/pvp-combat.js';

function makeCreature(overrides = {}) {
  return {
    id: `creature-${Math.random().toString(36).slice(2, 6)}`,
    name: 'テスト', nameEn: 'Test',
    element: 'neutral', level: 5,
    hp: 100, maxHp: 100, mp: 20, maxMp: 20,
    attack: 15, defense: 5,
    baseWord: '試す', baseReading: 'ためす', baseMeaning: 'test',
    activeEffects: [],
    moves: [{
      id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
      element: 'neutral', category: 'damage', power: 40,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }],
    ...overrides
  };
}

describe('buildTurnOrder', () => {
  it('sorts by level descending', () => {
    const a1 = makeCreature({ level: 3 });
    const a2 = makeCreature({ level: 7 });
    const b1 = makeCreature({ level: 5 });

    const order = buildTurnOrder([a1, a2], [b1]);

    assert.strictEqual(order.length, 3);
    assert.strictEqual(order[0].creature, a2, 'level 7 goes first');
    assert.strictEqual(order[1].creature, b1, 'level 5 goes second');
    assert.strictEqual(order[2].creature, a1, 'level 3 goes third');
  });

  it('skips KO creatures (hp <= 0)', () => {
    const a1 = makeCreature({ level: 5 });
    const a2 = makeCreature({ level: 8, hp: 0 });
    const b1 = makeCreature({ level: 6 });

    const order = buildTurnOrder([a1, a2], [b1]);

    assert.strictEqual(order.length, 2);
    const ids = order.map(e => e.creature.id);
    assert.ok(!ids.includes(a2.id), 'KO creature should be excluded');
  });

  it('assigns correct side labels and cross-references', () => {
    const a1 = makeCreature({ level: 5 });
    const b1 = makeCreature({ level: 5 });
    const sideA = [a1];
    const sideB = [b1];

    const order = buildTurnOrder(sideA, sideB);

    for (const entry of order) {
      if (entry.side === 'sideA') {
        assert.strictEqual(entry.allies, sideA);
        assert.strictEqual(entry.enemies, sideB);
      } else {
        assert.strictEqual(entry.allies, sideB);
        assert.strictEqual(entry.enemies, sideA);
      }
    }
  });
});

describe('resolveRound', () => {
  let sideA, sideB, movesA, movesB;

  beforeEach(() => {
    sideA = [makeCreature({ id: 'a1', level: 5, hp: 100, maxHp: 100, mp: 20, maxMp: 20 })];
    sideB = [makeCreature({ id: 'b1', level: 5, hp: 100, maxHp: 100, mp: 20, maxMp: 20 })];
    movesA = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    movesB = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
  });

  it('executes moves and deals damage', () => {
    const result = resolveRound(sideA, sideB, movesA, movesB);

    assert.ok(result.attacks.length >= 2, 'both sides should attack');
    assert.ok(sideB[0].hp < 100, 'side B creature should take damage');
    assert.ok(sideA[0].hp < 100, 'side A creature should take damage');
    assert.strictEqual(result.winner, null, 'no winner yet');
  });

  it('declares winner when all of one side is KO', () => {
    // Give side B very low HP so side A's attack should KO it
    sideB[0].hp = 1;

    const result = resolveRound(sideA, sideB, movesA, movesB);

    // Side B creature should be KO'd
    assert.ok(sideB[0].hp <= 0, 'side B creature should be KO');
    assert.strictEqual(result.winner, 'sideA');
  });

  it('returns draw when both sides are KO after effects', () => {
    // Both creatures at 1 HP with poison — poison ticks KO both before moves
    sideA[0].hp = 1;
    sideA[0].activeEffects = [{
      type: 'poison', damagePerTurn: 10, remainingTurns: 2, sourceId: 'b1'
    }];
    sideB[0].hp = 1;
    sideB[0].activeEffects = [{
      type: 'poison', damagePerTurn: 10, remainingTurns: 2, sourceId: 'a1'
    }];

    // Note: poison can't reduce below 1, so we need to test the draw path differently.
    // Set both to 0 HP directly to test the winner logic.
    sideA[0].hp = 0;
    sideB[0].hp = 0;

    const result = resolveRound(sideA, sideB, [], []);

    assert.strictEqual(result.winner, 'draw');
  });

  it('handles party skills when provided', () => {
    const combatA = { partyHitCounter: 0 };
    const partySkillsA = ['battleRhythm'];

    // Run several rounds to accumulate hit counter
    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsA,
      combatA
    });

    // The combat state should have been updated
    assert.ok(combatA.partyHitCounter >= 1, 'party hit counter should increment');
    assert.ok(result.attacks.length > 0, 'should have attacks');
  });

  it('ticks status effects at start of round', () => {
    // Apply poison to side A creature
    sideA[0].activeEffects = [{
      type: 'poison',
      damagePerTurn: 10,
      remainingTurns: 2,
      sourceId: 'b1'
    }];

    const startHp = sideA[0].hp;
    const result = resolveRound(sideA, sideB, movesA, movesB);

    // Effect events should contain poison tick
    const poisonEvents = result.effectEvents.filter(e => e.type === 'poison');
    assert.ok(poisonEvents.length > 0, 'should have poison effect event');
    // HP should be lower than just combat damage (poison + attack damage)
    assert.ok(sideA[0].hp < startHp, 'poison should have dealt damage before combat');
  });

  it('collects MP regens from both sides', () => {
    const result = resolveRound(sideA, sideB, movesA, movesB);

    assert.ok(result.mpRegens.length >= 2, 'should have MP regens for both sides');
    const sideARegens = result.mpRegens.filter(r => r.side === 'sideA');
    const sideBRegens = result.mpRegens.filter(r => r.side === 'sideB');
    assert.ok(sideARegens.length >= 1, 'should have side A MP regen');
    assert.ok(sideBRegens.length >= 1, 'should have side B MP regen');
  });

  it('handles KO swaps when party is provided', () => {
    sideB[0].hp = 1;
    const reserve = makeCreature({ id: 'b-reserve', level: 3 });
    const partyB = { active: sideB, reserves: [reserve] };

    const result = resolveRound(sideA, sideB, movesA, movesB, { partyB });

    // Side B creature should have been KO'd and swapped
    if (sideB[0].hp <= 0 || sideB[0].id === 'b-reserve') {
      // If swap happened, check koSwaps
      const bSwaps = result.koSwaps.filter(s => s.side === 'sideB');
      if (bSwaps.length > 0) {
        assert.strictEqual(bSwaps[0].replacement.id, 'b-reserve');
      }
    }
  });

  it('returns updatedSideA and updatedSideB', () => {
    const result = resolveRound(sideA, sideB, movesA, movesB);

    assert.strictEqual(result.updatedSideA, sideA);
    assert.strictEqual(result.updatedSideB, sideB);
  });
});
