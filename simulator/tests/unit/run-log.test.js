import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRunLogRows } from '../../routes/run-log.js';

describe('run log result rows', () => {
  it('normalizes run_summary events into run-log rows', () => {
    const rows = buildRunLogRows([
      {
        id: 1,
        day: 1,
        run: 1,
        room: 0,
        event_type: 'run_summary',
        data: {
          areaId: 'wild-plains',
          areaName: 'Wild Plains',
          areaNameJa: '野原',
          completed: true,
          wiped: false,
          creaturesBefriended: 1,
          itemsCollected: 2,
          wordsMastered: [{ word: '猫', meaning: 'cat', exposures: 4 }],
          combatCount: 5,
          avgCombatRounds: 3.2,
          maxCombatRounds: 6,
          bossCombatRounds: 9,
          furthestRoomReached: 10
        }
      }
    ]);

    assert.deepEqual(rows, [{
      day: 1,
      run: 1,
      areaId: 'wild-plains',
      areaName: 'Wild Plains',
      areaNameJa: '野原',
      completed: true,
      wiped: false,
      creaturesBefriended: 1,
      itemsCollected: 2,
      wordsMastered: [{ word: '猫', meaning: 'cat', exposures: 4 }],
      wordsMasteredCount: 1,
      combatCount: 5,
      avgCombatRounds: 3.2,
      maxCombatRounds: 6,
      bossCombatRounds: 9,
      furthestRoomReached: 10
    }]);
  });

  it('derives regular, boss, and furthest room metrics from room_entered events when summary fields are missing', () => {
    const rows = buildRunLogRows([
      { id: 1, day: 1, run: 1, room: 1, event_type: 'room_entered', data: { roomType: 'encounter', outcome: 'cleared', rounds: 2 } },
      { id: 2, day: 1, run: 1, room: 2, event_type: 'room_entered', data: { roomType: 'npcBattle', outcome: 'cleared', rounds: 4 } },
      { id: 3, day: 1, run: 1, room: 9, event_type: 'room_entered', data: { roomType: 'boss', outcome: 'cleared', rounds: 8 } },
      { id: 4, day: 1, run: 1, room: 0, event_type: 'run_summary', data: { completed: true, areaName: 'Wild Plains' } }
    ]);

    assert.equal(rows[0].combatCount, 2);
    assert.equal(rows[0].avgCombatRounds, 3);
    assert.equal(rows[0].maxCombatRounds, 4);
    assert.equal(rows[0].bossCombatRounds, 8);
    assert.equal(rows[0].furthestRoomReached, 10);
  });

  it('uses room_entered fallback when summary furthest room is zero', () => {
    const rows = buildRunLogRows([
      { id: 1, day: 1, run: 1, room: 0, event_type: 'room_entered', data: { roomType: 'encounter', outcome: 'cleared', rounds: 2 } },
      { id: 2, day: 1, run: 1, room: 4, event_type: 'room_entered', data: { roomType: 'friendlyNpc', outcome: 'cleared' } },
      { id: 3, day: 1, run: 1, room: 0, event_type: 'run_summary', data: { completed: true, furthestRoomReached: 0 } }
    ]);

    assert.equal(rows[0].furthestRoomReached, 5);
  });

  it('uses null boss rounds when a run does not reach a boss', () => {
    const rows = buildRunLogRows([
      { id: 1, day: 2, run: 1, room: 1, event_type: 'room_entered', data: { roomType: 'encounter', outcome: 'wiped', rounds: 7 } },
      { id: 2, day: 2, run: 1, room: 0, event_type: 'run_summary', data: { wiped: true } }
    ]);

    assert.equal(rows[0].combatCount, 1);
    assert.equal(rows[0].avgCombatRounds, 7);
    assert.equal(rows[0].maxCombatRounds, 7);
    assert.equal(rows[0].bossCombatRounds, null);
    assert.equal(rows[0].furthestRoomReached, 2);
  });

  it('defaults missing collection and word fields safely', () => {
    const rows = buildRunLogRows([
      { id: 1, day: 3, run: 2, room: 0, event_type: 'run_summary', data: {} }
    ]);

    assert.equal(rows[0].areaName, 'Unknown');
    assert.equal(rows[0].creaturesBefriended, 0);
    assert.equal(rows[0].itemsCollected, 0);
    assert.deepEqual(rows[0].wordsMastered, []);
    assert.equal(rows[0].wordsMasteredCount, 0);
    assert.equal(rows[0].combatCount, 0);
    assert.equal(rows[0].avgCombatRounds, 0);
    assert.equal(rows[0].maxCombatRounds, 0);
    assert.equal(rows[0].bossCombatRounds, null);
    assert.equal(rows[0].furthestRoomReached, 0);
  });
});
