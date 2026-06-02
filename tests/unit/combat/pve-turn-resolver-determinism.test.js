import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSeededRng } from '../../../src/shared/deterministic-rng.js';
import { createPveTurnSnapshot } from '../../../src/shared/combat/pve-turn-snapshot.js';
import { resolvePveTurn } from '../../../src/shared/combat/pve-turn-resolver.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { rollNpcSkill } from '../../../src/game/services/npc-service.js';
import {
  executeNpcSkill,
  pickEnemyMoveChoice,
  pickEnemyTarget,
  processInterleavedPvERound,
} from '../../../src/game/services/creature-combat-service.js';

function creature(overrides = {}) {
  return {
    id: 'hi',
    name: '火',
    nameEn: 'Fire',
    reading: 'ひ',
    element: 'fire',
    level: 3,
    attack: 10,
    defense: 5,
    hp: 30,
    maxHp: 30,
    mp: 10,
    maxMp: 10,
    moves: [{
      id: 'honoo',
      name: '炎',
      nameEn: 'Flame',
      reading: 'ほのお',
      element: 'fire',
      category: 'damage',
      target: 'single_enemy',
      power: 30,
      mpCost: 0,
    }],
    ...overrides,
  };
}

function sequenceRng(values) {
  let index = 0;
  return () => {
    if (index >= values.length) return values[values.length - 1] ?? 0;
    return values[index++];
  };
}

function constantRng(value) {
  return () => value;
}

function withMockRandom(value, fn) {
  const original = Math.random;
  Math.random = typeof value === 'function' ? value : () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function makeNpcCycleGameManager() {
  const playerMove = {
    id: 'tap',
    name: '叩く',
    nameEn: 'Tap',
    reading: 'たたく',
    element: 'neutral',
    category: 'damage',
    target: 'single_enemy',
    power: 5,
    mpCost: 0,
  };
  const enemyMove = {
    id: 'poke',
    name: '突く',
    nameEn: 'Poke',
    reading: 'つく',
    element: 'neutral',
    category: 'damage',
    target: 'single_enemy',
    power: 5,
    mpCost: 0,
  };
  const allies = [creature({ id: 'hi', hp: 120, maxHp: 120, dex: 30, moves: [playerMove] })];
  const enemies = [
    creature({ id: 'e0', hp: 120, maxHp: 120, dex: 20, moves: [enemyMove] }),
    creature({ id: 'e1', hp: 120, maxHp: 120, dex: 10, moves: [enemyMove] }),
    creature({ id: 'e2', hp: 120, maxHp: 120, dex: 5, moves: [enemyMove] }),
  ];

  return {
    combat: {
      active: true,
      allies,
      enemies,
      npcId: 'senpai',
      npcData: { id: 'senpai' },
      turnCount: 0,
      actionCount: 0,
      isBoss: true,
    },
    run: {
      active: true,
      player: { credits: 0 },
      creatureParty: { active: allies, reserves: [], pendingCaptures: [] },
      partySkills: [],
      itemBuffs: null,
      crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
    },
    meta: {},
    emitState() {},
    narrate() {},
  };
}

function makeCursorGameManager() {
  const slash = {
    id: 'slash',
    name: '斬る',
    nameEn: 'Slash',
    reading: 'きる',
    element: 'neutral',
    category: 'damage',
    target: 'single_enemy',
    power: 18,
    mpCost: 0,
  };
  const spark = {
    id: 'spark',
    name: '火花',
    nameEn: 'Spark',
    reading: 'ひばな',
    element: 'fire',
    category: 'damage',
    target: 'single_enemy',
    power: 10,
    mpCost: 0,
  };
  const wave = {
    id: 'wave',
    name: '波',
    nameEn: 'Wave',
    reading: 'なみ',
    element: 'water',
    category: 'damage',
    target: 'single_enemy',
    power: 25,
    mpCost: 0,
  };

  const allies = [
    creature({ id: 'hi', dex: 40, moves: [slash], hp: 80, maxHp: 80 }),
    creature({ id: 'ki', element: 'wood', dex: 10, hp: 80, maxHp: 80 }),
  ];
  const enemies = [
    creature({ id: 'mizu-a', element: 'water', dex: 30, hp: 120, maxHp: 120, moves: [spark, wave] }),
    creature({ id: 'mizu-b', element: 'water', dex: 20, hp: 120, maxHp: 120, moves: [wave, spark] }),
    creature({ id: 'mizu-c', element: 'water', dex: 5, hp: 120, maxHp: 120, moves: [spark, wave] }),
  ];

  return {
    combat: {
      active: true,
      allies,
      enemies,
      actionCursor: { side: 'ally', index: 0, opening: true },
      actionCount: 0,
      turnCount: 0,
      isBoss: true,
    },
    run: {
      active: true,
      player: { credits: 0 },
      creatureParty: { active: allies, reserves: [], pendingCaptures: [] },
      partySkills: ['arcStrike'],
      itemBuffs: null,
      crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
    },
    meta: {},
    emitState() {},
    narrate() {},
  };
}

function makeDefendGameManager() {
  const jab = {
    id: 'jab',
    name: '突く',
    nameEn: 'Jab',
    reading: 'つく',
    element: 'neutral',
    category: 'damage',
    target: 'single_enemy',
    power: 10,
    mpCost: 0,
  };
  const smash = {
    id: 'smash',
    name: '壊す',
    nameEn: 'Break',
    reading: 'こわす',
    element: 'earth',
    category: 'damage',
    target: 'single_enemy',
    power: 30,
    mpCost: 0,
  };
  const allies = [
    creature({ id: 'hi', hp: 120, maxHp: 120, dex: 10 }),
    creature({ id: 'ki', hp: 120, maxHp: 120, dex: 20 }),
  ];
  const enemies = [
    creature({ id: 'kage', hp: 120, maxHp: 120, dex: 10, moves: [jab, smash] }),
  ];

  return {
    combat: {
      active: true,
      allies,
      enemies,
      actionCount: 0,
      turnCount: 0,
      isBoss: true,
    },
    run: {
      active: true,
      player: { credits: 0 },
      creatureParty: { active: allies, reserves: [], pendingCaptures: [] },
      partySkills: [],
      itemBuffs: null,
      crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
    },
    meta: {},
    emitState() {},
    narrate() {},
  };
}

describe('shared PvE turn resolver', () => {
  it('is browser-safe at import level', () => {
    const resolverSource = readFileSync(
      new URL('../../../src/shared/combat/pve-turn-resolver.js', import.meta.url),
      'utf8',
    );
    const snapshotSource = readFileSync(
      new URL('../../../src/shared/combat/pve-turn-snapshot.js', import.meta.url),
      'utf8',
    );
    const coreSource = readFileSync(
      new URL('../../../src/shared/combat/pve-turn-core.js', import.meta.url),
      'utf8',
    );

    for (const source of [resolverSource, snapshotSource, coreSource]) {
      assert.equal(source.includes('game/services/creature-combat-service.js'), false);
      assert.equal(source.includes('game/services/item-service.js'), false);
      assert.equal(source.includes('game/creatures.js'), false);
      assert.equal(source.includes("from 'fs'"), false);
      assert.equal(source.includes("from 'node:fs'"), false);
      assert.equal(source.includes("from 'path'"), false);
      assert.equal(source.includes("from 'node:path'"), false);
    }
  });

  it('resolves attack deterministically from hand-built snapshots without data loaders', () => {
    const makeSnapshot = () => createPveTurnSnapshot({
      allies: [creature({ id: 'hi', dex: 40, hp: 80, maxHp: 80 })],
      enemies: [creature({ id: 'mizu', element: 'water', dex: 10, hp: 90, maxHp: 90 })],
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      runPartySkills: [],
      combat: { actionCount: 0 },
      itemBuffs: null,
    });

    const resultA = resolvePveTurn(makeSnapshot(), {
      actionType: 'attack',
      seed: 'shared-attack-seed',
    });
    const resultB = resolvePveTurn(makeSnapshot(), {
      actionType: 'attack',
      seed: 'shared-attack-seed',
    });

    assert.deepEqual(resultA, resultB);
    assert.equal(resultA.transcript.actionType, 'attack');
    assert.equal(resultA.transcript.playerAttacks.length, 1);
    assert.equal(
      resultA.nextCombat.enemies[0].hp,
      Math.max(0, 90 - resultA.transcript.playerAttacks[0].damage),
    );
  });

  it('accepts the plan envelope shape with nested combat/run snapshot', () => {
    const ally = creature({ id: 'hi', dex: 40, hp: 80, maxHp: 80 });
    const enemy = creature({ id: 'mizu', element: 'water', dex: 10, hp: 90, maxHp: 90 });
    const result = resolvePveTurn({
      snapshot: {
        combat: {
          active: true,
          allies: [ally],
          enemies: [enemy],
          actionCount: 0,
        },
        run: {
          partySkills: [],
          itemBuffs: null,
          creatureParty: { active: [ally], reserves: [] },
          crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
        },
      },
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      seed: 'plan-envelope-seed',
    });

    assert.equal(result.transcript.actionType, 'attack');
    assert.equal(result.transcript.playerAttacks.length, 1);
    assert.ok(result.nextCombat.enemies[0].hp < 90);
  });

  it('resolves defend deterministically with the supplied seed', () => {
    const slash = {
      id: 'slash',
      name: '斬る',
      nameEn: 'Slash',
      reading: 'きる',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 20,
      mpCost: 0,
    };
    const makeSnapshot = () => createPveTurnSnapshot({
      allies: [creature({ id: 'hi', hp: 100, maxHp: 100 })],
      enemies: [creature({ id: 'kage', hp: 100, maxHp: 100, dex: 10, moves: [slash] })],
      itemBuffs: null,
    });

    const resultA = resolvePveTurn(makeSnapshot(), {
      actionType: 'defend',
      seed: 'shared-defend-seed',
    });
    const resultB = resolvePveTurn(makeSnapshot(), {
      actionType: 'defend',
      seed: 'shared-defend-seed',
    });

    assert.deepEqual(resultA, resultB);
    assert.equal(resultA.transcript.actionType, 'defend');
    assert.equal(resultA.transcript.enemyAttacks.length, 1);
    assert.equal(resultA.transcript.mpRegens[0]?.regen, 1);
  });

  it('includes start effects, round-start skills, and enemy mp state in the transcript', () => {
    const enemy = creature({
      id: 'mizu',
      element: 'water',
      hp: 90,
      maxHp: 90,
      statStages: { atk: -1 },
      activeEffects: [{ type: 'poison', damagePerTurn: 7, remainingTurns: 2, sourceId: 'hi' }],
    });
    const result = resolvePveTurn({
      allies: [creature({ id: 'hi', dex: 40, hp: 80, maxHp: 80 })],
      enemies: [enemy],
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      runPartySkills: ['erosion'],
      combat: {},
      itemBuffs: null,
    }, {
      actionType: 'attack',
      seed: 'start-effects-seed',
    });

    assert.equal(result.transcript.effectEvents[0]?.type, 'poison');
    assert.equal(result.transcript.roundStartEvents[0]?.type, 'erosion');
    assert.equal(result.transcript.enemyMpRegens[0]?.side, 'enemy');
    assert.equal(result.transcript.stateSummary.enemies[0].statStages.atk, -2);
    assert.ok(result.nextCombat.enemies[0].hp < 90);
  });

  it('includes defend counters and KO swap/removal metadata', () => {
    const strike = {
      id: 'strike',
      name: '打つ',
      nameEn: 'Strike',
      reading: 'うつ',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 10,
      mpCost: 0,
    };
    const counterResult = resolvePveTurn({
      allies: [creature({ id: 'hi', hp: 100, maxHp: 100, attack: 40 })],
      enemies: [creature({ id: 'kage', hp: 100, maxHp: 100, attack: 10, moves: [strike] })],
      runPartySkills: ['retaliationStrike'],
      creatureParty: { active: [creature({ id: 'hi', hp: 100, maxHp: 100, attack: 40 })], reserves: [] },
      combat: {},
    }, {
      actionType: 'defend',
      rng: constantRng(0),
    });

    assert.equal(counterResult.transcript.counterAttacks.length, 1);
    assert.equal(counterResult.transcript.counterAttacks[0].type, 'counter');

    const weakAlly = creature({ id: 'hi', hp: 1, maxHp: 100, defense: 1 });
    const reserve = creature({ id: 'ki', hp: 50, maxHp: 50 });
    const koResult = resolvePveTurn({
      allies: [weakAlly],
      enemies: [creature({ id: 'kage', hp: 100, maxHp: 100, attack: 100, moves: [strike] })],
      creatureParty: { active: [weakAlly], reserves: [reserve] },
      combat: {},
    }, {
      actionType: 'defend',
      rng: constantRng(0.5),
    });

    assert.equal(koResult.transcript.koSwaps.length, 1);
    assert.equal(koResult.transcript.koSwaps[0].replacement, 'Fire');
    assert.equal(koResult.nextCombat.allies[0].id, 'ki');
  });

  it('defaults KO swap processing for defend envelope inputs', () => {
    const strike = {
      id: 'strike',
      name: '打つ',
      nameEn: 'Strike',
      reading: 'うつ',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 10,
      mpCost: 0,
    };
    const weakAlly = creature({ id: 'hi', hp: 1, maxHp: 100, defense: 1 });
    const reserve = creature({ id: 'ki', hp: 50, maxHp: 50 });
    const result = resolvePveTurn({
      snapshot: {
        combat: {
          allies: [weakAlly],
          enemies: [creature({ id: 'kage', hp: 100, maxHp: 100, attack: 100, moves: [strike] })],
        },
        run: {
          creatureParty: { active: [weakAlly], reserves: [reserve] },
          partySkills: [],
          itemBuffs: null,
        },
      },
      actionType: 'defend',
      seed: 'defend-envelope-ko',
    });

    assert.equal(result.transcript.koSwaps.length, 1);
    assert.equal(result.nextCombat.allies[0].id, 'ki');
  });
});

describe('PvE combat rng injection', () => {
  it('enemy move and target selection are deterministic with the same rng seed', () => {
    const enemyMoves = [
      {
        id: 'awa',
        name: '泡',
        nameEn: 'Bubble',
        reading: 'あわ',
        element: 'water',
        category: 'damage',
        target: 'single_enemy',
        power: 10,
        mpCost: 0,
      },
      {
        id: 'nami',
        name: '波',
        nameEn: 'Wave',
        reading: 'なみ',
        element: 'water',
        category: 'damage',
        target: 'single_enemy',
        power: 20,
        mpCost: 0,
      },
    ];
    const enemyA = creature({ id: 'mizu', element: 'water', moves: enemyMoves });
    const enemyB = creature({ id: 'mizu', element: 'water', moves: enemyMoves });
    const allies = [creature(), creature({ id: 'ki', element: 'wood' })];
    const enemies = [enemyA];

    const rngA = sequenceRng([0.9, 0.75, 0.6]);
    const rngB = sequenceRng([0.9, 0.75, 0.6]);

    const moveA = pickEnemyMoveChoice(enemyA, allies, enemies, rngA);
    const moveB = pickEnemyMoveChoice(enemyB, allies, [enemyB], rngB);
    const targetA = pickEnemyTarget(enemyA, moveA.move, moveA.mode, allies, enemies, rngA);
    const targetB = pickEnemyTarget(enemyB, moveB.move, moveB.mode, allies, [enemyB], rngB);

    assert.deepEqual(moveA, moveB);
    assert.equal(moveA.mode, 'random');
    assert.equal(moveA.move.id, 'nami');
    assert.deepEqual(targetA.targetSide, targetB.targetSide);
    assert.deepEqual(targetA.target?.id, targetB.target?.id);
    assert.equal(targetA.target?.id, 'ki');
  });

  it('interleaved PvE round produces identical transcripts for identical seed and snapshot', () => {
    const makeSnapshot = () => ({
      allies: [creature()],
      enemies: [creature({ id: 'mizu', element: 'water' })],
      runPartySkills: [],
      combat: { actionCount: 0 },
      creatureParty: { active: [], reserves: [] },
    });

    const left = makeSnapshot();
    const right = makeSnapshot();
    const choices = [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }];

    const resultA = processInterleavedPvERound(left.allies, left.enemies, choices, {
      runPartySkills: left.runPartySkills,
      combat: left.combat,
      creatureParty: left.creatureParty,
      rng: createSeededRng('same-turn-seed'),
    });
    const resultB = processInterleavedPvERound(right.allies, right.enemies, choices, {
      runPartySkills: right.runPartySkills,
      combat: right.combat,
      creatureParty: right.creatureParty,
      rng: createSeededRng('same-turn-seed'),
    });

    assert.deepEqual(resultA, resultB);
  });

  it('active PvE cursor path produces identical transcripts with the same explicit rng', () => {
    const run = randomValue => withMockRandom(randomValue, () => {
      const gm = makeCursorGameManager();
      const service = new CombatCycleService(gm);
      const result = service._handleCreatureActionCursorTurn(
        [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }],
        { rng: createSeededRng('cursor-seed') },
      );
      return {
        actionSegments: result.actionSegments,
        playerAttacks: result.playerAttacks,
        enemyAttacks: result.enemyAttacks,
        actionCursor: gm.combat.actionCursor,
        enemyHp: gm.combat.enemies.map(enemy => enemy.hp),
        allyHp: gm.combat.allies.map(ally => ally.hp),
      };
    });

    assert.deepEqual(run(0.99), run(0.01));
  });

  it('NPC skill rolling and single-ally target selection use explicit rng when provided', () => {
    const npc = { id: 'test-npc', skills: ['asobu', 'hataraku'] };
    const skill = withMockRandom(0.99, () => rollNpcSkill(npc, sequenceRng([0.1, 0.75])));
    assert.equal(skill?.id, 'hataraku');

    const npcData = {
      id: 'senpai',
      name: '先輩',
      nameEn: 'Older Student',
      attack: 15,
      element: 'neutral',
      reading: 'せんぱい',
      meaning: 'senior',
    };
    const buffSkill = {
      id: 'oboeru',
      name: '覚える',
      nameEn: 'Memorize',
      element: 'neutral',
      category: 'buff',
      target: 'single_ally',
      power: 0,
      mpCost: 0,
      statChanges: { atk: 2 },
      statusEffect: null,
      statusChance: 0,
      statusDuration: 0,
    };
    const makeTeams = () => ({
      allies: [creature({ id: 'a0', element: 'water' })],
      enemies: [
        creature({ id: 'e0', element: 'fire' }),
        creature({ id: 'e1', element: 'fire' }),
        creature({ id: 'e2', element: 'fire' }),
      ],
    });

    const runSkill = randomValue => withMockRandom(randomValue, () => {
      const { allies, enemies } = makeTeams();
      const result = executeNpcSkill(npcData, buffSkill, allies, enemies, sequenceRng([0.8]));
      return {
        targetIndex: result.attacks[0]?.targetIndex,
        enemyStages: enemies.map(enemy => enemy.statStages?.atk || 0),
      };
    });

    assert.deepEqual(runSkill(0), runSkill(0.99));
  });

  it('combat-cycle NPC skill phase is deterministic with the same explicit rng', () => {
    const runCycle = randomValue => withMockRandom(randomValue, () => {
      const gm = makeNpcCycleGameManager();
      const service = new CombatCycleService(gm);
      const result = service._handleCreatureAttackTurn(
        [],
        [{ creatureIndex: 0, moveId: 'tap', targetIndex: 0 }],
        { rng: constantRng(0.1) },
      );
      return {
        npcSkillAttacks: result.npcSkillAttacks,
        npcSkillUsed: result.npcSkillUsed,
        enemyStages: gm.combat.enemies.map(enemy => enemy.statStages?.atk || 0),
        enemyHp: gm.combat.enemies.map(enemy => enemy.hp),
        allyHp: gm.combat.allies.map(ally => ally.hp),
      };
    });

    assert.deepEqual(runCycle(0.99), runCycle(0));
  });

  it('combat-cycle defend turn uses explicit rng when provided', () => {
    const runCycle = randomValue => withMockRandom(randomValue, () => {
      const gm = makeDefendGameManager();
      const service = new CombatCycleService(gm);
      const result = service._handleCreatureDefendTurn([], { rng: sequenceRng([0.9, 0.75, 0.2, 0.9]) });
      return {
        enemyAttacks: result.enemyAttacks,
        allyHp: gm.combat.allies.map(ally => ally.hp),
        enemyMp: gm.combat.enemies.map(enemy => enemy.mp),
      };
    });

    assert.deepEqual(runCycle(0), runCycle(0.99));
  });
});
