import test from 'node:test';
import assert from 'node:assert/strict';

import { derivePhase, PHASES } from './phase-machine.js';

function baseState(overrides = {}) {
  const { run: runOverrides = {}, ...rest } = overrides;
  return {
    player: { id: 'p1' },
    run: {
      active: true,
      areaSelectionRequired: false,
      pendingBranch: false,
      areaCleared: false,
      areasCompleted: 0,
      areasToWin: 1,
      currentRoom: 0,
      rooms: [{ type: 'encounter', interacted: true }],
      ...runOverrides,
    },
    combat: null,
    ...rest,
  };
}

test('derivePhase returns skillMaster when skillMaster room incomplete', () => {
  const state = baseState({
    run: {
      rooms: [{
        type: 'skillMaster',
        skillMaster: { completed: false },
      }],
    },
  });
  assert.equal(derivePhase(state), PHASES.SKILL_MASTER);
});

test('derivePhase returns room when skillMaster room completed', () => {
  const state = baseState({
    run: {
      rooms: [{
        type: 'skillMaster',
        skillMaster: { completed: true },
      }],
    },
  });
  assert.equal(derivePhase(state), PHASES.ROOM);
});

test('should derive friendlyNpc phase for uninteracted friendlyNpc room', () => {
  const state = baseState({
    run: {
      rooms: [{ type: 'friendlyNpc', interacted: false }],
    },
  });
  assert.equal(derivePhase(state), PHASES.FRIENDLY_NPC);
});

test('should derive room_encounter for uninteracted npcBattle room', () => {
  const state = baseState({
    run: {
      rooms: [{ type: 'npcBattle', interacted: false }],
    },
  });
  assert.equal(derivePhase(state), PHASES.ROOM_ENCOUNTER);
});

