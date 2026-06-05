import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { createRoom } from '../../../src/game/rooms.js';
import { PARTY_SKILL_TREE_IDS } from '../../../src/game/party-skills.js';

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

function makeGmWithInitialSkillPick({ partySkills = [], meta = {} } = {}) {
  const gm = {
    run: {
      rooms: [],
      currentRoom: 0,
      initialSkillPick: { offered: null, chosenId: null },
      partySkills
    },
    meta,
    emitState() {}
  };
  const svc = new ExplorationService(gm);
  return { gm, svc };
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

  it('getSkillMasterOffers returns next-level tree offers and excludes maxed trees', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.99;
    try {
      const { svc } = makeGmWithSkillMasterRoom({
        partySkills: [{ id: 'arcStrike', level: 2 }, { id: 'hpMaster', level: 5 }]
      });
      const { offered } = svc.getSkillMasterOffers();
      assert.equal(offered.some(o => o.id === 'hpMaster'), false);
      assert.equal(offered.find(o => o.id === 'arcStrike')?.level, 3);
      assert.ok(offered.every(o => PARTY_SKILL_TREE_IDS.includes(o.id)));
      assert.ok(offered.every(o => / - Lvl\. \d$/.test(o.title)));
    } finally {
      Math.random = originalRandom;
    }
  });

  it('chooseSkillMasterOffer increments existing tree levels', () => {
    const { gm, room, svc } = makeGmWithSkillMasterRoom({
      partySkills: [{ id: 'arcStrike', level: 1 }]
    });
    room.skillMaster = {
      offered: [{ id: 'arcStrike', level: 2 }, { id: 'counterMaster', level: 1 }],
      chosenId: null,
      completed: false
    };

    const firstChoose = svc.chooseSkillMasterOffer('arcStrike');
    assert.strictEqual(firstChoose.chosenId, 'arcStrike');
    assert.deepEqual(gm.run.partySkills, [{ id: 'arcStrike', level: 2 }]);
    assert.strictEqual(room.skillMaster.chosenId, 'arcStrike');
    assert.strictEqual(room.skillMaster.completed, true);
    assert.strictEqual(room.interacted, true);
  });

  it('room-entry recovery doubles with HP Master level 2', () => {
    const creature = { id: 'hi', hp: 50, maxHp: 100, partySkillBaseMaxHp: 80, partySkillHpMultiplier: 1.25 };
    const { svc } = makeGmWithSkillMasterRoom({
      partySkills: [{ id: 'hpMaster', level: 2 }]
    });
    svc.gm.run.creatureParty = { active: [creature], reserves: [] };

    svc._healAllLivingCreaturesForRoomEntry();
    assert.equal(creature.hp, 60);
  });

  it('getSkillMasterOffers derives stored legacy offer levels from owned trees', () => {
    const { gm, room, svc } = makeGmWithSkillMasterRoom({
      partySkills: [{ id: 'buffMaster', level: 1 }]
    });
    room.skillMaster = {
      offered: ['momentum'],
      chosenId: null,
      completed: false
    };

    const { offered } = svc.getSkillMasterOffers();
    assert.deepEqual(offered.map(offer => ({ id: offer.id, level: offer.level, title: offer.title })), [
      { id: 'buffMaster', level: 2, title: 'Buff Master - Lvl. 2' }
    ]);

    const firstChoose = svc.chooseSkillMasterOffer('buffMaster');
    assert.strictEqual(firstChoose.chosenId, 'buffMaster');
    assert.deepEqual(gm.run.partySkills, [{ id: 'buffMaster', level: 2 }]);
  });

  it('tutorial Skill Master offers display as canonical tree offers', () => {
    const { svc } = makeGmWithInitialSkillPick({ meta: { tutorialStep: 0 } });
    const { offered } = svc.getSkillMasterOffers();
    assert.deepEqual(offered.map(offer => offer.id), ['counterMaster', 'arcStrike', 'buffMaster']);
    assert.deepEqual(offered.map(offer => offer.level), [1, 1, 1]);
    assert.ok(offered.every(offer => PARTY_SKILL_TREE_IDS.includes(offer.id)));
  });

  it('chooseSkillMasterOffer accepts tutorial tree and legacy ids for canonical acquisition', () => {
    const treeChoice = makeGmWithInitialSkillPick({ meta: { tutorialStep: 0 } });
    treeChoice.svc.getSkillMasterOffers();
    const firstChoose = treeChoice.svc.chooseSkillMasterOffer('counterMaster');
    assert.strictEqual(firstChoose.chosenId, 'counterMaster');
    assert.deepEqual(treeChoice.gm.run.partySkills, [{ id: 'counterMaster', level: 1 }]);
    assert.strictEqual(treeChoice.gm.run.initialSkillPick.chosenId, 'counterMaster');

    const legacyChoice = makeGmWithInitialSkillPick({ meta: { tutorialStep: 0 } });
    legacyChoice.svc.getSkillMasterOffers();
    const secondChoose = legacyChoice.svc.chooseSkillMasterOffer('retaliationStrike');
    assert.strictEqual(secondChoose.chosenId, 'counterMaster');
    assert.deepEqual(legacyChoice.gm.run.partySkills, [{ id: 'counterMaster', level: 1 }]);
    assert.strictEqual(legacyChoice.gm.run.initialSkillPick.chosenId, 'counterMaster');
  });
});
