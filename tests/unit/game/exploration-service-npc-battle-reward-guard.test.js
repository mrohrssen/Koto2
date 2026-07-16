import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { createRoom } from '../../../src/game/rooms.js';

function makeGmWithRooms(rooms) {
  return {
    run: {
      active: true,
      rooms,
      currentRoom: 0,
      roomsExplored: 1,
      totalEncounters: 1,
      stats: { roomsExplored: 0, areasCleared: 0 },
      areasCompleted: 0,
      areasToWin: 99,
      areaPath: [],
      currentArea: { id: 'okunomori', nameEn: 'Okunomori' },
      background: null,
      areaCleared: false,
      areaSelectionRequired: false,
      player: { credits: 0 }
    },
    narrate() {},
    emitState() {}
  };
}

describe('ExplorationService proceedToNextRoom guard (NPC Battle reward)', () => {
  it('throws and does not advance when the npcBattle skill reward is still pending', () => {
    // After an npcBattle victory the room is marked interacted (combat done) and
    // skillSelectionPending is set so the player can pick a party skill. Advancing
    // here would strand the reward — the phase machine only offers npc_skill_selection
    // while currentRoom still points at the npcBattle room.
    const npcRoom = createRoom('npcBattle', 'okunomori', 1, 2);
    npcRoom.interacted = true;
    npcRoom.npcBattle = {
      skillSelectionPending: true,
      npc: { id: 'otokonoko', nameEn: 'Boy' }
    };
    const nextRoom = createRoom('encounter', 'okunomori', 2, 2);
    const gm = makeGmWithRooms([npcRoom, nextRoom]);
    const svc = new ExplorationService(gm);

    assert.throws(
      () => svc.proceedToNextRoom(),
      /Must claim NPC battle reward before proceeding/
    );
    assert.strictEqual(gm.run.currentRoom, 0);
  });

  it('does not throw once the npcBattle skill reward has been claimed', () => {
    const npcRoom = createRoom('npcBattle', 'okunomori', 1, 2);
    npcRoom.interacted = true;
    npcRoom.npcBattle = { skillSelectionPending: false, chosenSkillId: 'arcStrike' };
    const nextRoom = createRoom('encounter', 'okunomori', 2, 2);
    nextRoom.interacted = true;
    const gm = makeGmWithRooms([npcRoom, nextRoom]);
    const svc = new ExplorationService(gm);

    assert.doesNotThrow(() => svc.proceedToNextRoom());
    assert.strictEqual(gm.run.currentRoom, 1);
  });

  it('allows a canonically resolved reward despite a stale pending marker', () => {
    const npcRoom = createRoom('npcBattle', 'okunomori', 1, 2);
    npcRoom.interacted = true;
    npcRoom.npcBattle = {
      rewardResolved: true,
      skillSelectionPending: true,
      offered: [{ id: 'hpMaster', level: 1 }],
    };
    const nextRoom = createRoom('encounter', 'okunomori', 2, 2);
    const gm = makeGmWithRooms([npcRoom, nextRoom]);
    const svc = new ExplorationService(gm);

    assert.doesNotThrow(() => svc.proceedToNextRoom());
    assert.strictEqual(gm.run.currentRoom, 1);
  });

  it('blocks an explicitly unresolved reward despite a stale cleared pending marker', () => {
    const npcRoom = createRoom('npcBattle', 'okunomori', 1, 2);
    npcRoom.interacted = true;
    npcRoom.npcBattle = {
      rewardResolved: false,
      skillSelectionPending: false,
    };
    const nextRoom = createRoom('encounter', 'okunomori', 2, 2);
    const gm = makeGmWithRooms([npcRoom, nextRoom]);
    const svc = new ExplorationService(gm);

    assert.throws(
      () => svc.proceedToNextRoom(),
      /Must resolve NPC battle reward before proceeding/,
    );
    assert.strictEqual(gm.run.currentRoom, 0);
  });

  it('rejects a second choice when canonical resolution conflicts with stale pending', () => {
    const npcRoom = createRoom('npcBattle', 'okunomori', 1, 1);
    npcRoom.interacted = true;
    npcRoom.npcBattle = {
      rewardResolved: true,
      skillSelectionPending: true,
      offered: [{ id: 'hpMaster', level: 1 }],
    };
    const gm = makeGmWithRooms([npcRoom]);
    gm.run.partySkills = [];
    const svc = new ExplorationService(gm);

    assert.throws(
      () => svc.applyNpcBattleSkillChoose({ skillId: 'hpMaster' }),
      /already resolved/,
    );
    assert.deepEqual(gm.run.partySkills, []);
  });

  it('canonicalizes an inferred resolved reward with stale pending and offers', () => {
    const npcRoom = createRoom('npcBattle', 'okunomori', 1, 1);
    npcRoom.interacted = true;
    npcRoom.npcBattle = {
      rewardResolved: true,
      skillSelectionPending: true,
      offered: [{ id: 'hpMaster', level: 1 }],
    };
    const gm = makeGmWithRooms([npcRoom]);
    gm.run.partySkills = [];
    const svc = new ExplorationService(gm);

    assert.deepEqual(
      svc.ensureNpcBattleSkillOffers(npcRoom),
      { offered: [], rewardResolved: true },
    );
    assert.equal(npcRoom.npcBattle.skillSelectionPending, false);
    assert.equal(npcRoom.npcBattle.rewardResolved, true);
    assert.equal(npcRoom.interacted, true);
  });

  it('canonically resolves stale NPC reward offers that no longer display', () => {
    const npcRoom = createRoom('npcBattle', 'okunomori', 1, 2);
    npcRoom.interacted = true;
    npcRoom.npcBattle = {
      skillSelectionPending: true,
      rewardResolved: false,
      offered: [{ id: 'retiredPartySkill', level: 1 }],
    };
    const gm = makeGmWithRooms([npcRoom]);
    gm.run.partySkills = [];
    const svc = new ExplorationService(gm);

    const result = svc.ensureNpcBattleSkillOffers(npcRoom);

    assert.deepEqual(result, { offered: [], rewardResolved: true });
    assert.equal(npcRoom.interacted, true);
    assert.equal(npcRoom.npcBattle.skillSelectionPending, false);
    assert.equal(npcRoom.npcBattle.rewardResolved, true);
  });

  it('canonically resolves a persisted offer that is now maxed', () => {
    const npcRoom = createRoom('npcBattle', 'okunomori', 1, 1);
    npcRoom.interacted = true;
    npcRoom.npcBattle = {
      skillSelectionPending: true,
      rewardResolved: false,
      offered: [{ id: 'hpMaster', level: 1 }],
    };
    const gm = makeGmWithRooms([npcRoom]);
    gm.run.partySkills = [{ id: 'hpMaster', level: 5 }];
    const svc = new ExplorationService(gm);

    assert.deepEqual(
      svc.ensureNpcBattleSkillOffers(npcRoom),
      { offered: [], rewardResolved: true },
    );
    assert.equal(npcRoom.npcBattle.skillSelectionPending, false);
    assert.equal(npcRoom.npcBattle.rewardResolved, true);
  });
});
