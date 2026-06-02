import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSeededRng } from '../../../src/shared/deterministic-rng.js';
import {
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

describe('PvE combat rng injection', () => {
  it('enemy move and target selection are deterministic with the same rng seed', () => {
    const enemyA = creature({ id: 'mizu', element: 'water' });
    const enemyB = creature({ id: 'mizu', element: 'water' });
    const allies = [creature()];
    const enemies = [enemyA];

    const rngA = createSeededRng('turn-seed');
    const rngB = createSeededRng('turn-seed');

    const moveA = pickEnemyMoveChoice(enemyA, allies, enemies, rngA);
    const moveB = pickEnemyMoveChoice(enemyB, allies, [enemyB], rngB);
    const targetA = pickEnemyTarget(enemyA, moveA.move, moveA.mode, allies, enemies, rngA);
    const targetB = pickEnemyTarget(enemyB, moveB.move, moveB.mode, allies, [enemyB], rngB);

    assert.deepEqual(moveA, moveB);
    assert.deepEqual(targetA.targetSide, targetB.targetSide);
    assert.deepEqual(targetA.target?.id, targetB.target?.id);
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
});
