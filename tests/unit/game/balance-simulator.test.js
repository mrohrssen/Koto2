import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseAiMovesForSide,
  createBalanceSimulationManager,
  createInitialBalanceResults,
  recordBattleOutcome,
  runBalanceBattle,
  sampleUniqueCreatureIds
} from '../../../src/game/balance-simulator.js';

function creature(id, overrides = {}) {
  return {
    uid: crypto.randomUUID(),
    id,
    name: id,
    nameEn: id,
    rarity: 'common',
    element: 'neutral',
    level: 5,
    hp: 100,
    maxHp: 100,
    mp: 100,
    maxMp: 100,
    attack: 20,
    defense: 5,
    activeEffects: [],
    moves: [{
      id: 'hit',
      name: '打つ',
      nameEn: 'Hit',
      reading: 'うつ',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 20,
      mpCost: 0,
      statusEffect: null,
      statusChance: 0,
      statusDuration: 0
    }],
    ...overrides
  };
}

describe('sampleUniqueCreatureIds', () => {
  it('samples 6 unique creature IDs', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const picked = sampleUniqueCreatureIds(ids, () => 0);

    assert.equal(picked.length, 6);
    assert.equal(new Set(picked).size, 6);
  });

  it('rejects rosters with fewer than 6 creatures', () => {
    assert.throws(
      () => sampleUniqueCreatureIds(['a', 'b', 'c', 'd', 'e']),
      /at least 6 creatures/
    );
  });
});

describe('recordBattleOutcome', () => {
  it('applies wins to every winner and losses to every loser', () => {
    const rows = createInitialBalanceResults([
      { id: 'a', name: 'A', nameEn: 'A', rarity: 'common' },
      { id: 'b', name: 'B', nameEn: 'B', rarity: 'rare' },
      { id: 'c', name: 'C', nameEn: 'C', rarity: 'epic' },
      { id: 'd', name: 'D', nameEn: 'D', rarity: 'common' },
      { id: 'e', name: 'E', nameEn: 'E', rarity: 'common' },
      { id: 'f', name: 'F', nameEn: 'F', rarity: 'common' }
    ]);

    recordBattleOutcome(rows, ['a', 'b', 'c'], ['d', 'e', 'f'], 'sideA');

    assert.equal(rows.get('a').appearances, 1);
    assert.equal(rows.get('a').wins, 1);
    assert.equal(rows.get('b').wins, 1);
    assert.equal(rows.get('c').wins, 1);
    assert.equal(rows.get('d').losses, 1);
    assert.equal(rows.get('e').losses, 1);
    assert.equal(rows.get('f').losses, 1);
  });

  it('records draws without wins or losses', () => {
    const rows = createInitialBalanceResults([
      { id: 'a', name: 'A', nameEn: 'A', rarity: 'common' },
      { id: 'b', name: 'B', nameEn: 'B', rarity: 'common' },
      { id: 'c', name: 'C', nameEn: 'C', rarity: 'common' },
      { id: 'd', name: 'D', nameEn: 'D', rarity: 'common' },
      { id: 'e', name: 'E', nameEn: 'E', rarity: 'common' },
      { id: 'f', name: 'F', nameEn: 'F', rarity: 'common' }
    ]);

    recordBattleOutcome(rows, ['a', 'b', 'c'], ['d', 'e', 'f'], 'draw');

    assert.equal(rows.get('a').appearances, 1);
    assert.equal(rows.get('a').draws, 1);
    assert.equal(rows.get('a').wins, 0);
    assert.equal(rows.get('a').losses, 0);
  });
});

describe('chooseAiMovesForSide', () => {
  it('uses production enemy AI helpers to build PvP move choices', () => {
    const sideA = [creature('a')];
    const sideB = [creature('b')];

    const moves = chooseAiMovesForSide(sideA, sideB);

    assert.deepEqual(moves, [{ creatureIndex: 0, moveId: 'hit', targetIndex: 0 }]);
  });
});

describe('runBalanceBattle', () => {
  it('returns sideA when sideB is fully dead', () => {
    const sideA = [creature('a', { attack: 1000 }), creature('b', { attack: 1000 }), creature('c', { attack: 1000 })];
    const sideB = [creature('d', { hp: 1, maxHp: 1 }), creature('e', { hp: 1, maxHp: 1 }), creature('f', { hp: 1, maxHp: 1 })];

    const result = runBalanceBattle(sideA, sideB, { maxRounds: 10 });

    assert.equal(result.winner, 'sideA');
    assert.ok(result.rounds >= 1);
  });

  it('returns draw on max-round cap', () => {
    const sideA = [creature('a', { moves: [] }), creature('b', { moves: [] }), creature('c', { moves: [] })];
    const sideB = [creature('d', { moves: [] }), creature('e', { moves: [] }), creature('f', { moves: [] })];

    const result = runBalanceBattle(sideA, sideB, { maxRounds: 1 });

    assert.equal(result.winner, 'draw');
    assert.equal(result.reason, 'max_rounds');
  });
});

describe('createBalanceSimulationManager', () => {
  it('rejects a second active job and serializes aggregate-only results', async () => {
    const manager = createBalanceSimulationManager({
      runSimulation: async ({ job }) => {
        job.completedBattles = job.battleCount;
        job.status = 'completed';
        job.completedAt = '2026-05-05T00:00:00.000Z';
      }
    });

    const first = manager.start({ battleCount: 1, creatureLevel: 5 });
    assert.equal(first.status, 'running');

    assert.throws(
      () => manager.start({ battleCount: 1, creatureLevel: 5 }),
      /already running/
    );

    await manager.waitForIdle();
    const current = manager.current();

    assert.equal(current.status, 'completed');
    assert.equal(current.battleCount, 1);
    assert.equal('battles' in current, false);
  });

  it('marks an active job cancelled', () => {
    const manager = createBalanceSimulationManager({
      runSimulation: async () => new Promise(() => {})
    });

    manager.start({ battleCount: 10, creatureLevel: 5 });
    const cancelled = manager.cancel();

    assert.equal(cancelled.status, 'cancelled');
  });
});
