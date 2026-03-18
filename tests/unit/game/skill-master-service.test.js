import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { createRoom } from '../../../src/game/rooms.js';
import { PARTY_SKILLS_CATALOG } from '../../../src/game/party-skills.js';

function makeGmWithSkillMasterRoom({ partySkills = [] } = {}) {
  const room = createRoom('skillMaster', 'okunomori', 1, 1);
  const gm = {
    run: {
      rooms: [room],
      currentRoom: 0,
      partySkills
    },
    emitState() {}
  };
  const svc = new ExplorationService(gm);
  return { gm, room, svc };
}

describe('Skill Master service', () => {
  it('getSkillMasterOffers is idempotent within a room', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.12345;
    try {
      const { room, svc } = makeGmWithSkillMasterRoom();
      const first = svc.getSkillMasterOffers();
      const firstOfferedIds = [...(room.skillMaster.offered || [])];
      const second = svc.getSkillMasterOffers();
      assert.deepStrictEqual(room.skillMaster.offered, firstOfferedIds, 'offered ids should persist');
      assert.deepStrictEqual(second, first, 'second call should return same offers');
    } finally {
      Math.random = originalRandom;
    }
  });

  it('getSkillMasterOffers excludes already-owned ids', () => {
    const allIds = Object.keys(PARTY_SKILLS_CATALOG);
    const ownedId = allIds[0];
    const { svc } = makeGmWithSkillMasterRoom({ partySkills: [{ id: ownedId }] });
    const { offered } = svc.getSkillMasterOffers();
    const offeredIds = offered.map(o => o.id);
    assert.ok(!offeredIds.includes(ownedId));
  });

  it('chooseSkillMasterOffer validates offer membership and dedupes owned', () => {
    const { gm, room, svc } = makeGmWithSkillMasterRoom();
    const { offered } = svc.getSkillMasterOffers();
    assert.ok(offered.length > 0);

    assert.throws(() => svc.chooseSkillMasterOffer('not-a-real-skill'), /Invalid Skill Master offer/);

    const pickId = offered[0].id;
    const firstChoose = svc.chooseSkillMasterOffer(pickId);
    assert.strictEqual(firstChoose.chosenId, pickId);
    assert.ok(Array.isArray(firstChoose.partySkills));
    assert.strictEqual(firstChoose.partySkills.filter(s => s.id === pickId).length, 1);
    assert.strictEqual(room.skillMaster.chosenId, pickId);
    assert.strictEqual(room.skillMaster.completed, true);
    assert.strictEqual(room.interacted, true);

    // Choosing again should not add duplicates (even if room already completed)
    const secondChoose = svc.chooseSkillMasterOffer(pickId);
    assert.strictEqual(secondChoose.partySkills.filter(s => s.id === pickId).length, 1);
    assert.strictEqual(gm.run.partySkills.filter(s => s.id === pickId).length, 1);
  });
});

