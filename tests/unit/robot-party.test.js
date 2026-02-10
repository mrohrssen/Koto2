import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createNewRun, createCombatState, createNewPlayer } from '../../src/game/state.js';

describe('Robot Party in Run State', () => {
  it('run has robotParty with active, reserves, maxTotal', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);
    assert.ok(run.robotParty);
    assert.deepStrictEqual(run.robotParty.active, []);
    assert.deepStrictEqual(run.robotParty.reserves, []);
    assert.strictEqual(run.robotParty.maxTotal, 6);
  });
});

describe('Combat State with Robot Arrays', () => {
  it('combat state has allies and enemies arrays', () => {
    const combat = createCombatState({ hp: 100, maxHp: 100 });
    assert.ok(Array.isArray(combat.allies));
    assert.ok(Array.isArray(combat.enemies));
  });
});
