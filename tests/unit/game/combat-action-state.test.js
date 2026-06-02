import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCombatState } from '../../../src/game/state.js';

describe('combat action state', () => {
  it('initializes action cursor fields', () => {
    const combat = createCombatState({ id: 'enemy', hp: 10, maxHp: 10 });

    assert.equal(combat.actionCursor, null);
    assert.equal(combat.actionCount, 0);
    assert.equal(combat.cycleCount, 0);
    assert.equal(combat.openingResolved, false);
    assert.equal(combat.optimistic, null);
  });
});
