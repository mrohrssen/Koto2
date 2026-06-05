import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTurnOrder,
  resolveOpeningActions,
  resolvePvpCursorAction,
  resolveRound
} from '../../../src/pvp/pvp-combat.js';

function makeCreature(overrides = {}) {
  return {
    // Include uid so fixtures match the production contract — every live
    // creature has a unique per-instance uid.
    uid: crypto.randomUUID(),
    id: `creature-${Math.random().toString(36).slice(2, 6)}`,
    name: 'テスト', nameEn: 'Test',
    element: 'neutral', level: 5,
    hp: 100, maxHp: 100, mp: 20, maxMp: 20,
    attack: 15, defense: 5, dex: 10,
    statStages: { atk: 0, def: 0, dex: 0 },
    reading: 'ためす', meaning: 'test',
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
  it('sorts by effective dex descending before level', () => {
    const a1 = makeCreature({ level: 99, dex: 5, statStages: { atk: 0, def: 0, dex: 0 } });
    const a2 = makeCreature({ level: 7, dex: 12, statStages: { atk: 0, def: 0, dex: 1 } });
    const b1 = makeCreature({ level: 5, dex: 15, statStages: { atk: 0, def: 0, dex: 0 } });

    const order = buildTurnOrder([a1, a2], [b1]);

    assert.strictEqual(order.length, 3);
    assert.strictEqual(order[0].creature, a2, 'dex 12 at +1 becomes effective dex 18');
    assert.strictEqual(order[1].creature, b1, 'dex 15 goes second');
    assert.strictEqual(order[2].creature, a1, 'higher level loses to lower dex');
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

  it('prevents a PvP creature killed by Arc Strike before its initiative slot from attacking', () => {
    sideA[0] = makeCreature({ id: 'a1', level: 50, hp: 500, maxHp: 500, attack: 999, mp: 20, maxMp: 20 });
    sideA[0].moves = [{
      id: 'arc-primer', name: '弧撃', nameEn: 'Arc Primer', reading: 'こげき',
      element: 'neutral', category: 'damage', power: 200,
      target: 'single_enemy', mpCost: 0, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];

    sideB = [
      makeCreature({ id: 'b-primary', level: 1, hp: 500, maxHp: 500, moves: [] }),
      makeCreature({ id: 'b-chain-victim', level: 1, hp: 1, maxHp: 1 })
    ];
    movesA = [{ creatureIndex: 0, moveId: 'arc-primer', targetIndex: 0 }];
    movesB = [{ creatureIndex: 1, moveId: 'slash', targetIndex: 0 }];

    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsA: ['arcStrike'],
      combatA: { chainHitsThisTurn: 0 }
    });

    assert.strictEqual(sideB[1].hp, 0, 'Arc Strike should kill side B slot 1');
    assert.strictEqual(
      result.attacks.some(atk => atk.side === 'sideB' && atk.attackerIndex === 1),
      false,
      'PvP creature killed by Arc Strike before its turn should not attack'
    );
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

  it('returns roundStartEvents and counterAttacks arrays (even empty)', () => {
    const result = resolveRound(sideA, sideB, movesA, movesB);

    assert.ok(Array.isArray(result.roundStartEvents), 'roundStartEvents should be an array');
    assert.ok(Array.isArray(result.counterAttacks), 'counterAttacks should be an array (empty for backward compat)');
  });

  it('applies Buff Master round-start skill for side A', () => {
    const combatA = {};

    const origRandom = Math.random;
    Math.random = () => 0.01;
    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsA: [{ id: 'buffMaster', level: 4 }],
      combatA
    });
    Math.random = origRandom;

    assert.equal(sideA[0].statStages.atk, 1, 'Buff Master should buff side A ally atk');
    const buffEvents = result.roundStartEvents.filter(e => e.type === 'buffMaster');
    assert.ok(buffEvents.length > 0, 'should produce Buff Master events');
  });

  it('applies Debuff Master hit debuff for side B', () => {
    const combatB = {};

    const origRandom = Math.random;
    Math.random = () => 0.01;
    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsB: [{ id: 'debuffMaster', level: 4 }],
      combatB
    });
    Math.random = origRandom;

    assert.equal(sideA[0].statStages.atk, -1, 'Debuff Master should debuff side A target atk');
    const debuffProcs = result.attacks.flatMap(a => a.partySkillProcs || []).filter(p => p.skillId === 'debuffMaster');
    assert.ok(debuffProcs.length > 0, 'should produce Debuff Master procs');
  });

  it('applies Debuff Master self-sabotage from opposing party skills', () => {
    sideA.push(makeCreature({ id: 'a2', level: 5, hp: 100, maxHp: 100, mp: 20, maxMp: 20 }));

    const origRandom = Math.random;
    Math.random = () => 0.01;
    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsB: [{ id: 'debuffMaster', level: 5 }]
    });
    Math.random = origRandom;

    const sabotage = result.attacks.find(a => a.type === 'debuffMasterSelfSabotage');
    assert.ok(sabotage, 'should produce a self-sabotage playback event');
    assert.equal(sabotage.side, 'sideA', 'side A actor should sabotage side A');
    assert.equal(sabotage.targetIndex, 1, 'acting creature should debuff another ally');
    assert.equal(sideA[1].statStages.atk, -1, 'self-sabotage should debuff side A ally atk');
    assert.ok(typeof sabotage.playbackIndex === 'number', 'self-sabotage should preserve playback ordering');
  });

  it('applies round-start skills for both sides simultaneously', () => {
    const combatA = {};
    const combatB = {};

    const origRandom = Math.random;
    Math.random = () => 0.01;
    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsA: [{ id: 'buffMaster', level: 4 }],
      partySkillsB: [{ id: 'buffMaster', level: 4 }],
      combatA,
      combatB
    });
    Math.random = origRandom;

    assert.equal(sideA[0].statStages.atk, 1, 'Side A Buff Master should buff side A');
    assert.equal(sideB[0].statStages.atk, 1, 'Side B Buff Master should buff side B');
    assert.equal(result.roundStartEvents.filter(e => e.type === 'buffMaster').length, 2);
  });

  it('applies Counter Master counter attacks in PvP', () => {
    const combatA = {};
    sideA[0].attack = 30;
    sideB[0].hp = 500;
    sideB[0].maxHp = 500;

    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = resolveRound(sideA, sideB, movesA, movesB, {
        partySkillsA: [{ id: 'counterMaster', level: 1 }],
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

    const origRandom = Math.random;
    Math.random = () => 0.01;
    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsA: [{ id: 'buffMaster', level: 4 }],
      combatA
    });
    Math.random = origRandom;

    const buffEvents = result.roundStartEvents.filter(e => e.type === 'buffMaster');
    for (const ev of buffEvents) {
      assert.ok(ev.pvpSide === 'sideA' || ev.pvpSide === 'sideB', 'pvpSide should be set');
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

describe('PvP action cursor resolution', () => {
  it('resolves opening actions by dex and stops if first action wins', () => {
    const sideA = [makeCreature({ id: 'a-fast', dex: 50, attack: 999 })];
    const sideB = [makeCreature({ id: 'b-slow', dex: 5, hp: 1, maxHp: 1 })];

    const result = resolveOpeningActions({
      sideA,
      sideB,
      actionA: { creatureIndex: 0, moveId: 'slash', targetIndex: 0 },
      actionB: { creatureIndex: 0, moveId: 'slash', targetIndex: 0 }
    });

    assert.equal(result.actionSegments.length, 1);
    assert.equal(result.winner, 'sideA');
  });

  it('resolves one sequential PvP action and advances cursor', () => {
    const sideA = [makeCreature({ id: 'a', dex: 20 })];
    const sideB = [makeCreature({ id: 'b', dex: 10 })];

    const result = resolvePvpCursorAction({
      sideA,
      sideB,
      cursor: { side: 'sideA', index: 0, opening: false },
      action: { creatureIndex: 0, moveId: 'slash', targetIndex: 0 }
    });

    assert.equal(result.actionSegments.length, 1);
    assert.equal(result.actionSegments[0].actor.side, 'sideA');
    assert.deepEqual(result.nextCursor, { side: 'sideB', index: 0, opening: false });
  });

  it('ticks actor poison only after that actor action', () => {
    const sideA = [makeCreature({
      id: 'a',
      activeEffects: [{ type: 'poison', damagePerTurn: 5, remainingTurns: 2, sourceId: 'b' }]
    })];
    const sideB = [makeCreature({
      id: 'b',
      activeEffects: [{ type: 'poison', damagePerTurn: 5, remainingTurns: 2, sourceId: 'a' }]
    })];

    const result = resolvePvpCursorAction({
      sideA,
      sideB,
      cursor: { side: 'sideA', index: 0, opening: false },
      action: { creatureIndex: 0, moveId: 'slash', targetIndex: 0 }
    });

    assert.equal(sideA[0].activeEffects[0].remainingTurns, 1);
    assert.equal(sideB[0].activeEffects[0].remainingTurns, 2);
    assert.equal(result.effectEvents.length, 1);
  });
});
