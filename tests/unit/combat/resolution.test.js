import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkAllDefeated } from '../../../src/game/combat/resolution.js';

describe('checkAllDefeated', () => {
  it('returns true for empty array', () => {
    assert.equal(checkAllDefeated([]), true);
  });

  it('returns true when all hp <= 0', () => {
    const creatures = [
      { hp: 0, maxHp: 50 },
      { hp: -5, maxHp: 50 }
    ];
    assert.equal(checkAllDefeated(creatures), true);
  });

  it('returns false when any creature alive', () => {
    const creatures = [
      { hp: 0, maxHp: 50 },
      { hp: 10, maxHp: 50 }
    ];
    assert.equal(checkAllDefeated(creatures), false);
  });

  it('returns true when all null', () => {
    assert.equal(checkAllDefeated([null, null]), true);
  });

  it('treats befriended enemies as defeated', () => {
    const creatures = [
      { hp: 30, maxHp: 50, befriended: true },
      { hp: 0, maxHp: 50 }
    ];
    assert.equal(checkAllDefeated(creatures), true);
  });
});
