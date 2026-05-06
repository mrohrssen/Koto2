import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_TYPES, createRoom, generateAreaRooms, getRoomActions } from '../../../src/game/rooms.js';
import { derivePhase } from '../../../src/game/phase-machine.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';

describe('Shrine Room', () => {
  it('createRoom creates modern shrine state', () => {
    const room = createRoom(ROOM_TYPES.shrine, 'hajimari-no-hiroba', 3, 10);

    assert.equal(room.type, ROOM_TYPES.shrine);
    assert.deepEqual(room.shrine, {
      used: false,
      completed: false,
      chosenReward: null,
      greeting: null
    });
  });

  it('uses the 5% shrine branch without replacing fixed npcBattle or boss slots', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.01;
    try {
      const rooms = generateAreaRooms('wild-plains');
      assert.equal(rooms[5].type, ROOM_TYPES.npcBattle);
      assert.equal(rooms[11].type, ROOM_TYPES.npcBattle);
      assert.equal(rooms[17].type, ROOM_TYPES.npcBattle);
      assert.equal(rooms[23].type, ROOM_TYPES.npcBattle);
      assert.equal(rooms[29].type, ROOM_TYPES.boss);

      const fixed = new Set([5, 11, 17, 23, 29]);
      const generatedRooms = rooms.filter((_, index) => !fixed.has(index));
      assert.ok(generatedRooms.every(room => room.type === ROOM_TYPES.shrine));
    } finally {
      Math.random = originalRandom;
    }
  });

  it('shows shrine action before completion and proceed after completion', () => {
    const active = createRoom(ROOM_TYPES.shrine, 'hajimari-no-hiroba', 2, 10);
    assert.ok(getRoomActions(active).find(action => action.id === 'shrine_reward'));
    assert.equal(getRoomActions(active).find(action => action.id === 'proceed'), undefined);

    const complete = createRoom(ROOM_TYPES.shrine, 'hajimari-no-hiroba', 2, 10);
    complete.interacted = true;
    complete.shrine.completed = true;
    complete.shrine.used = true;
    assert.ok(getRoomActions(complete).find(action => action.id === 'proceed'));
    assert.equal(getRoomActions(complete).find(action => action.id === 'shrine_reward'), undefined);
  });

  it('derives shrine phase only while the shrine is unfinished', () => {
    assert.equal(derivePhase({
      player: { id: 'player-1' },
      run: {
        active: true,
        currentRoom: 0,
        rooms: [{ type: ROOM_TYPES.shrine, interacted: false, shrine: { completed: false, used: false } }]
      }
    }), 'shrine');

    assert.equal(derivePhase({
      player: { id: 'player-1' },
      run: {
        active: true,
        currentRoom: 0,
        rooms: [{ type: ROOM_TYPES.shrine, interacted: true, shrine: { completed: true, used: true } }]
      }
    }), 'room');
  });
});

function makeShrineService(creatureParty) {
  const room = createRoom(ROOM_TYPES.shrine, 'hajimari-no-hiroba', 2, 10);
  const gm = {
    run: {
      currentRoom: 0,
      rooms: [room],
      creatureParty,
      itemBuffs: {}
    },
    narrate: () => {},
    emitState: () => {}
  };
  return { room, service: new ExplorationService(gm) };
}

describe('Shrine Reward Service', () => {
  it('heal_all heals active and reserve living creatures by 50% without reviving fainted creatures', () => {
    const active = { id: 'hi', uid: 'active-hi', nameEn: 'Hi', hp: 10, maxHp: 40, mp: 1, maxMp: 10, level: 2, attack: 5 };
    const reserve = { id: 'mizu', uid: 'reserve-mizu', nameEn: 'Mizu', hp: 5, maxHp: 30, mp: 2, maxMp: 10, level: 2, attack: 4 };
    const fainted = { id: 'ki', uid: 'reserve-ki', nameEn: 'Ki', hp: 0, maxHp: 50, mp: 0, maxMp: 12, level: 2, attack: 4 };
    const { room, service } = makeShrineService({ active: [active], reserves: [reserve, fainted] });

    const result = service.useShrineReward('heal_all');

    assert.equal(active.hp, 30);
    assert.equal(reserve.hp, 20);
    assert.equal(fainted.hp, 0);
    assert.equal(room.interacted, true);
    assert.equal(room.shrine.completed, true);
    assert.equal(room.shrine.used, true);
    assert.equal(room.shrine.chosenReward, 'heal_all');
    assert.deepEqual(result.affectedCreatures.map(c => c.creatureKey), ['active-hi', 'reserve-mizu']);
  });

  it('restore_mp_all restores active and reserve living creatures to max MP only', () => {
    const active = { id: 'hi', uid: 'active-hi', nameEn: 'Hi', hp: 10, maxHp: 40, mp: 1, maxMp: 10, level: 2, attack: 5 };
    const reserve = { id: 'mizu', uid: 'reserve-mizu', nameEn: 'Mizu', hp: 5, maxHp: 30, mp: 2, maxMp: 18, level: 2, attack: 4 };
    const fainted = { id: 'ki', uid: 'reserve-ki', nameEn: 'Ki', hp: 0, maxHp: 50, mp: 0, maxMp: 12, level: 2, attack: 4 };
    const { service } = makeShrineService({ active: [active], reserves: [reserve, fainted] });

    service.useShrineReward('restore_mp_all');

    assert.equal(active.mp, 10);
    assert.equal(reserve.mp, 18);
    assert.equal(fainted.mp, 0);
  });

  it('level_up levels one living active or reserve creature by key', () => {
    const active = { id: 'hi', uid: 'active-hi', nameEn: 'Hi', hp: 10, maxHp: 40, mp: 1, maxMp: 10, level: 2, xp: 0, attack: 5 };
    const reserve = { id: 'mizu', uid: 'reserve-mizu', nameEn: 'Mizu', hp: 5, maxHp: 30, mp: 2, maxMp: 18, level: 4, xp: 0, attack: 4 };
    const { service } = makeShrineService({ active: [active], reserves: [reserve] });

    const result = service.useShrineReward('level_up', 'reserve-mizu');

    assert.equal(active.level, 2);
    assert.equal(reserve.level, 5);
    assert.equal(result.levelUp.creatureKey, 'reserve-mizu');
    assert.equal(result.levelUp.oldLevel, 4);
    assert.equal(result.levelUp.newLevel, 5);
  });

  it('rejects level_up for fainted creatures and does not complete the shrine', () => {
    const fainted = { id: 'ki', uid: 'reserve-ki', nameEn: 'Ki', hp: 0, maxHp: 50, mp: 0, maxMp: 12, level: 2, xp: 0, attack: 4 };
    const { room, service } = makeShrineService({ active: [], reserves: [fainted] });

    assert.throws(() => service.useShrineReward('level_up', 'reserve-ki'), /Cannot use shrine on a fainted creature/);
    assert.equal(room.interacted, false);
    assert.equal(room.shrine.completed, false);
  });

  it('prevents claiming the same shrine twice', () => {
    const active = { id: 'hi', uid: 'active-hi', nameEn: 'Hi', hp: 10, maxHp: 40, mp: 1, maxMp: 10, level: 2, attack: 5 };
    const { service } = makeShrineService({ active: [active], reserves: [] });

    service.useShrineReward('heal_all');
    assert.throws(() => service.useShrineReward('restore_mp_all'), /Shrine already used/);
  });
});
