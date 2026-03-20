import { describe, it } from 'node:test';
import assert from 'node:assert';
import { derivePhase, PHASES } from '../../../src/game/phase-machine.js';

describe('derivePhase – boss rooms', () => {
  it('returns ROOM_ENCOUNTER for uninteracted boss room', () => {
    const state = {
      player: {},
      run: {
        active: true,
        areaComplete: false,
        rooms: [{ type: 'boss', interacted: false, boss: { creatureId: 'tetsu' } }],
        currentRoom: 0,
        creatureParty: { active: [{ hp: 10 }] }
      }
    };
    assert.strictEqual(derivePhase(state), PHASES.ROOM_ENCOUNTER);
  });

  it('returns ROOM for already-interacted boss room', () => {
    const state = {
      player: {},
      run: {
        active: true,
        areaComplete: false,
        rooms: [{ type: 'boss', interacted: true, boss: { creatureId: 'tetsu' } }],
        currentRoom: 0,
        creatureParty: { active: [{ hp: 10 }] }
      }
    };
    assert.strictEqual(derivePhase(state), PHASES.ROOM);
  });

  it('still returns ROOM_ENCOUNTER for regular encounter rooms', () => {
    const state = {
      player: {},
      run: {
        active: true,
        areaComplete: false,
        rooms: [{ type: 'encounter', interacted: false }],
        currentRoom: 0,
        creatureParty: { active: [{ hp: 10 }] }
      }
    };
    assert.strictEqual(derivePhase(state), PHASES.ROOM_ENCOUNTER);
  });
});
