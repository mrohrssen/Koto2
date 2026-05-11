import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';

function makeGmWithRoomsAndParty({ rooms, creatureParty }) {
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
      player: { credits: 0 },
      runStats: { roomsCleared: 0 },
      creatureParty
    },
    narrate() {},
    emitState() {}
  };
}

describe('ExplorationService room heal (5% per room entry)', () => {
  it('finalizes the first random room before emitting area entry state', () => {
    const gm = {
      meta: {},
      run: {
        active: true,
        currentArea: { id: 'wild-plains', nameEn: 'Wild Plains' },
        creatureParty: { active: [], reserves: [] },
        stats: { roomsExplored: 0, areasCleared: 0 },
        runStats: { roomsCleared: 0 },
        totalEncounters: 0
      },
      narrate() {},
      emitState() {}
    };
    const service = new ExplorationService(gm);

    service.enterArea();

    assert.notEqual(gm.run.rooms[0].type, ROOM_TYPES.randomRoom);
  });

  it('assigns an NPC when the first random room finalizes to a friendly NPC shop', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.6;
    const gm = {
      meta: {},
      run: {
        active: true,
        currentArea: { id: 'wild-plains', nameEn: 'Wild Plains' },
        areaPath: ['wild-plains'],
        creatureParty: { active: [], reserves: [] },
        stats: { roomsExplored: 0, areasCleared: 0 },
        runStats: { roomsCleared: 0 },
        totalEncounters: 0
      },
      narrate() {},
      emitState() {}
    };
    const service = new ExplorationService(gm);

    try {
      service.enterArea();
    } finally {
      Math.random = originalRandom;
    }

    assert.equal(gm.run.rooms[0].type, ROOM_TYPES.friendlyNpc);
    assert.ok(gm.run.rooms[0].npc, 'friendly NPC shops should have a visible NPC');
  });

  it('heals all living creatures and never revives KO creatures', () => {
    const room1 = createRoom('friendlyNpc', 'okunomori', 1, 2);
    const room2 = createRoom('friendlyNpc', 'okunomori', 2, 2);
    const aliveA = { id: 'a', hp: 50, maxHp: 100 };
    const aliveB = { id: 'b', hp: 10, maxHp: 200 };
    const deadC = { id: 'c', hp: 0, maxHp: 120 };

    const gm = makeGmWithRoomsAndParty({
      rooms: [room1, room2],
      creatureParty: {
        active: [aliveA, deadC],
        reserves: [aliveB]
      }
    });

    const svc = new ExplorationService(gm);
    svc.proceedToNextRoom();

    assert.strictEqual(aliveA.hp, 55); // +5% of 100 = 5
    assert.strictEqual(aliveB.hp, 20); // +5% of 200 = 10
    assert.strictEqual(deadC.hp, 0, "KO creatures must remain KO'd between rooms");
  });

  it('caps healing at maxHp', () => {
    const room1 = createRoom('friendlyNpc', 'okunomori', 1, 2);
    const room2 = createRoom('friendlyNpc', 'okunomori', 2, 2);
    const nearMax = { id: 'a', hp: 98, maxHp: 100 }; // heal would be +5 -> cap at 100

    const gm = makeGmWithRoomsAndParty({
      rooms: [room1, room2],
      creatureParty: {
        active: [nearMax],
        reserves: []
      }
    });

    const svc = new ExplorationService(gm);
    svc.proceedToNextRoom();

    assert.strictEqual(nearMax.hp, 100);
  });

  it('clears dex stages on room entry with other combat buffs', () => {
    const creature = {
      id: 'a',
      hp: 50,
      maxHp: 100,
      statStages: { atk: 1, def: -1, dex: 3 },
      activeEffects: [{ type: 'poison', remainingTurns: 2 }]
    };
    const gm = makeGmWithRoomsAndParty({
      rooms: [
        createRoom('friendlyNpc', 'okunomori', 1, 2),
        createRoom('friendlyNpc', 'okunomori', 2, 2)
      ],
      creatureParty: { active: [creature], reserves: [] }
    });
    const service = new ExplorationService(gm);

    service.proceedToNextRoom();

    assert.deepStrictEqual(creature.statStages, { atk: 0, def: 0, dex: 0 });
    assert.deepStrictEqual(creature.activeEffects, []);
  });
});

