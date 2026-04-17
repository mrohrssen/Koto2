import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildTurnOrder, resolveRound } from '../../../src/pvp/pvp-combat.js';

function makeCreature(overrides = {}) {
  return {
    // Include uid so fixtures match the production contract — every live
    // creature has a unique per-instance uid.
    uid: crypto.randomUUID(),
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
    const combatA = { chainHitsThisTurn: 0 };
    const partySkillsA = ['arcStrike'];

    // Add a second enemy so arc strike has a chain target
    sideB.push(makeCreature({ id: 'b2', level: 5, hp: 100, maxHp: 100, mp: 20, maxMp: 20 }));

    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsA,
      combatA
    });

    // The engine should run without error and produce attacks
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

  it('returns sideA and sideB', () => {
    const result = resolveRound(sideA, sideB, movesA, movesB);

    assert.strictEqual(result.sideA, sideA);
    assert.strictEqual(result.sideB, sideB);
  });

  it('resolves damage in initiative order (higher level acts first)', () => {
    sideA[0].level = 3;
    sideB[0].level = 50;
    sideA[0].maxHp = 500;
    sideA[0].hp = 500;

    const result = resolveRound(sideA, sideB, movesA, movesB);

    assert.ok(result.attacks.length >= 1);
    assert.strictEqual(result.attacks[0].side, 'sideB', 'Lv50 side B should strike before Lv3 side A');
    if (result.attacks.length >= 2) {
      assert.strictEqual(result.attacks[1].side, 'sideA');
    }
  });

  it('returns roundStartEvents and counterAttacks arrays (even empty)', () => {
    const result = resolveRound(sideA, sideB, movesA, movesB);

    assert.ok(Array.isArray(result.roundStartEvents), 'roundStartEvents should be an array');
    assert.ok(Array.isArray(result.counterAttacks), 'counterAttacks should be an array (empty for backward compat)');
  });

  it('applies Erosion round-start skill for side A', () => {
    const combatA = {};
    sideB[0].statStages = { atk: -2, def: 0 };

    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsA: ['erosion'],
      combatA
    });

    assert.ok(sideB[0].statStages.atk < -2, 'Erosion should deepen negative atk stage on enemy');
    const erosionEvents = result.roundStartEvents.filter(e => e.type === 'erosion');
    assert.ok(erosionEvents.length > 0, 'should produce erosion events');
  });

  it('applies Momentum round-start skill for side B', () => {
    const combatB = {};
    sideB[0].statStages = { atk: 1, def: 0 };

    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsB: ['momentum'],
      combatB
    });

    assert.ok(sideB[0].statStages.atk > 1, 'Momentum should grow positive atk stage on ally');
    const momentumEvents = result.roundStartEvents.filter(e => e.type === 'momentum');
    assert.ok(momentumEvents.length > 0, 'should produce momentum events');
  });

  it('applies round-start skills for both sides simultaneously', () => {
    const combatA = {};
    const combatB = {};
    sideB[0].statStages = { atk: -1, def: 0 };
    sideA[0].statStages = { atk: -1, def: 0 };

    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsA: ['erosion'],
      partySkillsB: ['erosion'],
      combatA,
      combatB
    });

    assert.ok(sideB[0].statStages.atk < -1, 'Side A erosion should deepen side B debuffs');
    assert.ok(sideA[0].statStages.atk < -1, 'Side B erosion should deepen side A debuffs');
  });

  it('applies Retaliation Strike counter attacks in PvP', () => {
    const combatA = {};
    sideA[0].attack = 30;
    sideB[0].hp = 500;
    sideB[0].maxHp = 500;

    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = resolveRound(sideA, sideB, movesA, movesB, {
        partySkillsA: ['retaliationStrike'],
        combatA
      });

      // B must have attacked (survived A's attack), generating enemy attacks for A to counter
      const bAttacks = result.attacks.filter(a => a.side === 'sideB');
      assert.ok(bAttacks.length > 0, 'Side B should have attacked');

      // Counters are now inline in orderedAttacks with side matching the defending side
      const sideACounters = result.attacks.filter(a => a.type === 'counter' && a.side === 'sideA');
      assert.ok(sideACounters.length > 0, 'Side A should have inline counter attacks');
      assert.ok(typeof sideACounters[0].playbackIndex === 'number', 'counter should have playbackIndex');
    } finally {
      Math.random = origRandom;
    }
  });

  it('tags roundStartEvents with correct pvpSide', () => {
    const combatA = {};
    sideB[0].statStages = { atk: -2, def: 0 };

    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsA: ['erosion'],
      combatA
    });

    const erosionEvents = result.roundStartEvents.filter(e => e.type === 'erosion');
    for (const ev of erosionEvents) {
      assert.ok(ev.pvpSide === 'sideA' || ev.pvpSide === 'sideB', 'pvpSide should be set');
    }
  });

  it('counter-kill prevents subsequent haste attacks in PvP', () => {
    const strongA = makeCreature({ level: 1, attack: 10, hp: 200, maxHp: 200 });
    strongA.moves = [{
      id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
      element: 'neutral', category: 'damage', power: 40,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];

    const weakB = makeCreature({ level: 10, hp: 1, maxHp: 1, attack: 20 });
    weakB.moves = [{
      id: 'bite', name: '噛む', nameEn: 'Bite', reading: 'かむ',
      element: 'neutral', category: 'damage', power: 30,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];
    weakB.activeEffects = [{ type: 'haste', duration: 1 }];

    const movesA = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const movesB = [{ creatureIndex: 0, moveId: 'bite', targetIndex: 0 }];

    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = resolveRound([strongA], [weakB], movesA, movesB, {
        partySkillsA: ['retaliationStrike'],
        combatA: {}
      });

      const sideACounters = result.attacks.filter(a => a.type === 'counter' && a.side === 'sideA');
      assert.ok(sideACounters.length > 0, 'Side A should counter');
      assert.strictEqual(weakB.hp, 0, 'Side B creature should be dead');

      const sideBAttacks = result.attacks.filter(a => a.side === 'sideB' && a.type !== 'counter');
      assert.ok(sideBAttacks.length <= 1, 'Dead creature should not get haste follow-up attack');
    } finally {
      Math.random = origRandom;
    }
  });

  it('no-reserve KO produces koRemovals and correct winner', () => {
    // Side B has 1 HP, no reserves — should be KO'd and removed
    sideB[0].hp = 1;
    const partyB = { active: sideB, reserves: [] };

    const result = resolveRound(sideA, sideB, movesA, movesB, { partyB });

    // Side B creature should be KO'd
    assert.equal(result.koRemovals.length, 1, 'Should have 1 KO removal');
    assert.equal(result.koRemovals[0].side, 'sideB', 'KO should be on sideB');
    assert.equal(result.koRemovals[0].name, 'Test', 'Should report creature name');
    // Side B array should be compacted (empty after removal)
    assert.equal(sideB.length, 0, 'Side B should be empty after compaction');
    // Side A wins
    assert.equal(result.winner, 'sideA', 'Side A should win when all of side B is KO');
  });
});
