import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentAreaDialogueEntityIds } from '../../../src/routes/game/run.js';

describe('run dialogue prewarm helpers', () => {
  it('returns current area creature ids plus boss creature id', () => {
    const ids = getCurrentAreaDialogueEntityIds({
      currentArea: {
        creatures: ['hi', 'mizu', 'hi'],
        bossCreatureId: 'hinoneko'
      }
    });

    assert.deepEqual(ids, ['hi', 'mizu', 'hinoneko']);
  });

  it('returns an empty list when no current area creature pool exists', () => {
    assert.deepEqual(getCurrentAreaDialogueEntityIds({}), []);
    assert.deepEqual(getCurrentAreaDialogueEntityIds({ currentArea: {} }), []);
  });
});
