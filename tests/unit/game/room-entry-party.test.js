import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRoomEntryPartyRecovery } from '../../../src/game/room-entry-party.js';

test('heals living creatures without reviving and clears combat effects', () => {
  const run = {
    partySkills: [{ id: 'hpMaster', level: 2 }],
    creatureParty: {
      active: [
        { id: 'hi', hp: 40, maxHp: 80, statStages: { atk: 2, def: -1, dex: 3 }, activeEffects: [{ type: 'poison' }] },
        { id: 'ko', hp: 0, maxHp: 80, statStages: { atk: -2, def: 1, dex: 0 }, activeEffects: [{ type: 'sleep' }] },
      ],
      reserves: [
        { id: 'reserve', hp: 79, maxHp: 80, statStages: { atk: 1, def: 1, dex: 1 }, activeEffects: [{ type: 'stun' }] },
      ],
    },
  };

  applyRoomEntryPartyRecovery(run);

  assert.equal(run.creatureParty.active[0].maxHp, 100);
  assert.equal(run.creatureParty.active[0].hp, 60);
  assert.equal(run.creatureParty.active[1].maxHp, 100);
  assert.equal(run.creatureParty.active[1].hp, 0);
  assert.equal(run.creatureParty.reserves[0].maxHp, 100);
  assert.equal(run.creatureParty.reserves[0].hp, 100);
  for (const creature of [...run.creatureParty.active, ...run.creatureParty.reserves]) {
    assert.deepEqual(creature.statStages, { atk: 0, def: 0, dex: 0 });
    assert.deepEqual(creature.activeEffects, []);
  }
});
