import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../../src/game/loop.js', {
  exports: {
    applyDebugSuperAttack: () => {}
  }
});

const { CombatCycleService } = await import('../../../src/game/services/combat-cycle-service.js');

function makeServiceWithPendingCapture() {
  const captured = {
    id: 'hi',
    name: '火',
    nameEn: 'Hi',
    element: 'fire',
    rarity: 'common',
    hp: 10,
    maxHp: 10,
    temporary: false
  };

  const gm = {
    run: {
      crestMults: {},
      runSummary: { creaturesBefriended: 0 },
      creatureParty: {
        active: [],
        reserves: [],
        pendingCaptures: [captured],
        maxTotal: 6
      }
    },
    meta: {
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      befriendCount: { hi: 1 }
    }
  };

  return { service: new CombatCycleService(gm), gm };
}

describe('creature capture counts', () => {
  it('increments spendable copies and lifetime befriend count for duplicate captures', () => {
    const { service, gm } = makeServiceWithPendingCapture();

    const additions = service._flushPendingCaptures();

    assert.deepEqual(additions, []);
    assert.equal(gm.meta.creatureCounts.hi, 2);
    assert.equal(gm.meta.befriendCount.hi, 2);
    assert.equal(gm.run.runSummary.creaturesBefriended, 1);
    assert.equal(gm.run.creatureParty.active.length, 1);
    assert.equal(gm.run.creatureParty.pendingCaptures.length, 0);
  });
});
