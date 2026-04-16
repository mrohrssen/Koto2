import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeSlotMoveTurn } from '../../../src/game/services/creature-combat-service.js';

function makeCreature(overrides = {}) {
  return {
    id: `c-${Math.random().toString(36).slice(2, 6)}`,
    name: 'テスト', nameEn: 'Test',
    element: 'neutral', level: 5,
    hp: 100, maxHp: 100, mp: 20, maxMp: 20,
    attack: 15, defense: 5,
    baseWord: '試す', baseReading: 'ためす', baseMeaning: 'test',
    activeEffects: [], statStages: { atk: 0, def: 0 },
    itemBuffs: null,
    moves: [{
      id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
      element: 'neutral', category: 'damage', power: 40,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }],
    ...overrides
  };
}

describe('executeSlotMoveTurn options-based API', () => {
  it('works with options object (new API)', () => {
    const allies = [makeCreature()];
    const enemies = [makeCreature({ hp: 500, maxHp: 500 })];
    const choices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];

    const { attacks } = executeSlotMoveTurn(allies, enemies, 0, choices, {
      itemBuffs: null,
      hastedSlots: null,
      defeatedIndices: new Set()
    });

    assert.ok(attacks.length > 0, 'should produce at least one attack');
    assert.strictEqual(attacks[0].attackerIndex, 0);
  });

  it('onAttack callback is called for each attack', () => {
    const allies = [makeCreature()];
    const enemies = [makeCreature({ hp: 500, maxHp: 500 })];
    const choices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const received = [];

    executeSlotMoveTurn(allies, enemies, 0, choices, {
      onAttack(atk) { received.push(atk); }
    });

    assert.ok(received.length > 0, 'onAttack should have been called');
    assert.strictEqual(received.length, 1);
  });

  it('onAttack returning false stops execution (no haste follow-up)', () => {
    const allies = [makeCreature()];
    const enemies = [makeCreature({ hp: 500, maxHp: 500 })];
    const choices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const hastedSlots = new Set([0]);

    const { attacks } = executeSlotMoveTurn(allies, enemies, 0, choices, {
      hastedSlots,
      onAttack() { return false; }
    });

    assert.strictEqual(attacks.length, 1, 'should stop after first attack when onAttack returns false');
  });

  it('creature.hp <= 0 between haste strikes stops execution', () => {
    const allies = [makeCreature()];
    const enemies = [makeCreature({ hp: 500, maxHp: 500 })];
    const choices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const hastedSlots = new Set([0]);

    const { attacks } = executeSlotMoveTurn(allies, enemies, 0, choices, {
      hastedSlots,
      onAttack(atk) {
        allies[0].hp = 0;
        return true;
      }
    });

    assert.strictEqual(attacks.length, 1, 'should stop after first attack when creature hp <= 0');
  });
});
