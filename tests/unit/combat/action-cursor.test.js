import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActionOrder,
  createPveOpeningCursor,
  createPvpOpeningCursors,
  getNextActionCursor,
  isCursorActorAlive
} from '../../../src/game/combat/action-cursor.js';

function creature(id, overrides = {}) {
  return {
    id,
    hp: 100,
    maxHp: 100,
    level: 5,
    dex: 10,
    statStages: { atk: 0, def: 0, dex: 0 },
    moves: [{ id: 'hit', category: 'damage', target: 'single_enemy', mpCost: 0 }],
    ...overrides
  };
}

describe('action cursor helpers', () => {
  it('sorts eligible actors by effective dex then level', () => {
    const allies = [
      creature('slow-high-level', { level: 99, dex: 5 }),
      creature('fast-low-level', { level: 5, dex: 30 })
    ];
    const enemies = [creature('middle', { level: 5, dex: 20 })];

    const order = buildActionOrder({ allies, enemies });

    assert.deepEqual(order.map(a => `${a.side}:${a.index}`), [
      'ally:1',
      'enemy:0',
      'ally:0'
    ]);
  });

  it('creates PvE opening cursor for highest-dex ally even when enemy is faster', () => {
    const allies = [creature('ally-a', { dex: 8 }), creature('ally-b', { dex: 12 })];
    const enemies = [creature('enemy-a', { dex: 50 })];

    assert.deepEqual(createPveOpeningCursor({ allies, enemies }), {
      side: 'ally',
      index: 1,
      opening: true
    });
  });

  it('creates one PvP opening cursor per side using each side highest-dex creature', () => {
    const sideA = [creature('a0', { dex: 20 }), creature('a1', { dex: 10 })];
    const sideB = [creature('b0', { dex: 7 }), creature('b1', { dex: 30 })];

    assert.deepEqual(createPvpOpeningCursors({ sideA, sideB }), {
      sideA: { side: 'sideA', index: 0, opening: true },
      sideB: { side: 'sideB', index: 1, opening: true }
    });
  });

  it('advances to next living eligible actor after current actor', () => {
    const allies = [creature('ally-a', { dex: 30 }), creature('ally-b', { dex: 10 })];
    const enemies = [creature('enemy-a', { dex: 20 })];

    const next = getNextActionCursor({
      allies,
      enemies,
      previousCursor: { side: 'ally', index: 0, opening: false }
    });

    assert.deepEqual(next, { side: 'enemy', index: 0, opening: false });
  });

  it('reports dead cursor actor as not alive', () => {
    const allies = [creature('ally-a', { hp: 0 })];
    const enemies = [creature('enemy-a')];

    assert.equal(
      isCursorActorAlive({ allies, enemies, cursor: { side: 'ally', index: 0 } }),
      false
    );
  });
});
