import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GameManager } from '../../../src/game/loop.js';

describe('area unlock progression', () => {
  it('unlocks Wild Plains after a fresh save clears Starting Meadow', () => {
    const gm = new GameManager();
    gm.initMeta();
    gm.createPlayer('Tester');

    gm.startRun(null, null, ['hi', 'mizu', 'ki']);
    gm.selectArea('hajimari-no-hiroba');
    gm.run.areasCompleted = 1;
    gm.run.stats.areasCleared = 1;

    gm.forfeitRun(true);

    assert.equal(gm.meta.levels.highestUnlocked, 2);

    const nextRun = gm.startRun(null, null, ['hi', 'mizu', 'ki']);
    assert.deepEqual(
      nextRun.areaOptions.map(area => area.id),
      ['hajimari-no-hiroba', 'wild-plains']
    );
  });
});
