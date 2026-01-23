import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createNewRun, createNewPlayer } from '../../src/game/state.js';

describe('Chip State in Run', () => {
  it('should initialize _chipCharges as empty object', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);
    assert.deepStrictEqual(run.player._chipCharges, {});
  });

  it('should initialize _chipLevels as empty object', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);
    assert.deepStrictEqual(run.player._chipLevels, {});
  });

  it('should initialize _activeBuffs as empty array', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);
    assert.deepStrictEqual(run.player._activeBuffs, []);
  });
});
