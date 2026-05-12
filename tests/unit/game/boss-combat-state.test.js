import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCombatState } from '../../../src/game/state.js';
import { GameManager } from '../../../src/game/loop.js';

describe('boss combat state', () => {
  it('GameManager.getState exposes boss encounters to the client', () => {
    const gm = new GameManager();
    gm.combat = createCombatState({ uid: 'boss-1', id: 'hinoneko', hp: 10, maxHp: 10 });
    gm.combat.isBoss = true;

    const state = gm.getState();

    assert.equal(state.combat.isBoss, true);
  });
});
