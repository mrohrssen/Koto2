// tests/unit/routes/pvp.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { savePvpTeam } from '../../../src/routes/game/pvp.js';

// Helper to build a minimal GameManager-like object
function makeGm(overrides = {}) {
  return {
    meta: { pvpTeams: [null, null, null] },
    run: {
      creatureParty: {
        active: [
          { id: 'hikaribon', hp: 10, maxHp: 40, mp: 2, maxMp: 10, activeEffects: ['burn'] }
        ],
        reserves: [
          { id: 'hanatchi', hp: 5, maxHp: 30, mp: 0, maxMp: 8, activeEffects: [] }
        ]
      },
      partySkills: ['skill-a'],
      itemBuffs: { atk: 2 }
    },
    ...overrides
  };
}

describe('savePvpTeam', () => {
  it('snapshots the run team into the given slot', () => {
    const gm = makeGm();
    const result = savePvpTeam(gm, 0);
    assert.strictEqual(result, true);
    assert.ok(gm.meta.pvpTeams[0], 'slot 0 should be populated');
    assert.deepStrictEqual(gm.meta.pvpTeams[1], null);
    assert.deepStrictEqual(gm.meta.pvpTeams[2], null);
  });

  it('restores full HP and MP on all saved creatures', () => {
    const gm = makeGm();
    savePvpTeam(gm, 1);
    const slot = gm.meta.pvpTeams[1];
    const active = slot.creatureParty.active[0];
    const reserve = slot.creatureParty.reserves[0];

    assert.strictEqual(active.hp, active.maxHp, 'active creature hp should equal maxHp');
    assert.strictEqual(active.mp, active.maxMp, 'active creature mp should equal maxMp');
    assert.strictEqual(reserve.hp, reserve.maxHp, 'reserve creature hp should equal maxHp');
    assert.strictEqual(reserve.mp, reserve.maxMp, 'reserve creature mp should equal maxMp');
  });

  it('clears activeEffects on all saved creatures', () => {
    const gm = makeGm();
    savePvpTeam(gm, 2);
    const slot = gm.meta.pvpTeams[2];
    const active = slot.creatureParty.active[0];
    assert.deepStrictEqual(active.activeEffects, [], 'activeEffects should be cleared');
  });

  it('deep-clones so mutations to run do not affect the snapshot', () => {
    const gm = makeGm();
    savePvpTeam(gm, 0);
    // Mutate the live run after saving
    gm.run.creatureParty.active[0].hp = 1;
    // Snapshot should still show full HP
    const snapshot = gm.meta.pvpTeams[0];
    assert.strictEqual(snapshot.creatureParty.active[0].hp, 40);
  });

  it('includes savedAt timestamp', () => {
    const gm = makeGm();
    const before = Date.now();
    savePvpTeam(gm, 0);
    const after = Date.now();
    const { savedAt } = gm.meta.pvpTeams[0];
    assert.ok(savedAt >= before && savedAt <= after, 'savedAt should be a recent timestamp');
  });

  it('rejects slot index below 0', () => {
    const gm = makeGm();
    const result = savePvpTeam(gm, -1);
    assert.strictEqual(result, false);
  });

  it('rejects slot index above 2', () => {
    const gm = makeGm();
    const result = savePvpTeam(gm, 3);
    assert.strictEqual(result, false);
  });

  it('rejects when there is no active run', () => {
    const gm = makeGm({ run: null });
    const result = savePvpTeam(gm, 0);
    assert.strictEqual(result, false);
  });

  it('rejects when run has no creatureParty', () => {
    const gm = makeGm({ run: {} });
    const result = savePvpTeam(gm, 0);
    assert.strictEqual(result, false);
  });

  it('initialises pvpTeams array if missing from meta', () => {
    const gm = makeGm();
    delete gm.meta.pvpTeams;
    savePvpTeam(gm, 0);
    assert.ok(Array.isArray(gm.meta.pvpTeams));
    assert.ok(gm.meta.pvpTeams[0]);
  });
});
