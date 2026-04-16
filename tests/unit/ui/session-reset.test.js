import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetClientSessionState } from '../../../public/js/ui/session-reset.js';

describe('resetClientSessionState', () => {
  it('clears stale combat session state and transient UI hooks', () => {
    const calls = [];
    const state = {
      player: { id: 'p1' },
      run: { active: true, currentRoom: 3 },
      combat: { enemies: [{ hp: 10 }] },
      phase: 'combat',
      meta: { tutorialStep: 2 },
      wordDictionary: { 叩く: { reading: 'たたく' } },
    };

    const next = resetClientSessionState(state, {
      cleanupCombat: () => calls.push('cleanupCombat'),
      clearActions: () => calls.push('clearActions'),
      hideNarration: () => calls.push('hideNarration'),
      hideEnemies: () => calls.push('hideEnemies'),
      hidePlayerFormation: () => calls.push('hidePlayerFormation'),
      resetFlags: () => calls.push('resetFlags'),
    });

    assert.deepEqual(calls, [
      'cleanupCombat',
      'clearActions',
      'hideNarration',
      'hideEnemies',
      'hidePlayerFormation',
      'resetFlags',
    ]);
    assert.equal(next.player, null);
    assert.equal(next.run, null);
    assert.equal(next.combat, null);
    assert.equal(next.phase, 'no_save');
    assert.deepEqual(next.meta, {});
    assert.deepEqual(next.wordDictionary, {});
  });
});
