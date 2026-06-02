import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOptimisticCombatTurn,
  canRunOptimisticPveTurn,
} from '../../../public/js/ui/optimistic-combat-turn.js';

function createCombatant(overrides = {}) {
  return {
    id: 'hi',
    name: '火',
    nameEn: 'Fire',
    reading: 'ひ',
    element: 'fire',
    level: 3,
    attack: 10,
    defense: 5,
    hp: 100,
    maxHp: 100,
    mp: 10,
    maxMp: 10,
    moves: [{
      id: 'honoo',
      name: '炎',
      nameEn: 'Flame',
      reading: 'ほのお',
      element: 'fire',
      category: 'damage',
      target: 'single_enemy',
      power: 30,
      mpCost: 0,
    }],
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    combat: {
      active: true,
      allies: [createCombatant()],
      enemies: [createCombatant({ id: 'mizu', name: '水', nameEn: 'Water', reading: 'みず', element: 'water' })],
      optimistic: { combatId: 'cmb_test', stateVersion: 0, nextTurnSeed: 'turn-seed' },
      ...overrides.combat,
    },
    run: {
      partySkills: [],
      creatureParty: { active: [], reserves: [] },
      ...overrides.run,
    },
  };
}

describe('optimistic combat turn client', () => {
  it('builds a real local transcript and server envelope', () => {
    const result = buildOptimisticCombatTurn({
      state: state(),
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_test',
    });

    assert.equal(result.localTranscript.actionType, 'attack');
    assert.equal(result.envelope.actionId, 'act_test');
    assert.equal(result.envelope.combatId, 'cmb_test');
    assert.equal(result.envelope.stateVersion, 0);
    assert.equal(result.envelope.seed, 'turn-seed');
    assert.equal(result.envelope.payload.moveChoices[0].moveId, 'honoo');
    assert.equal(result.envelope.payload.predictionMode, 'shared-pve-turn-v1');
    assert.equal(typeof result.envelope.predictedHash, 'string');
    assert.equal(result.localTranscript.allies.length, 1);
    assert.equal(result.localTranscript.enemies.length, 1);
  });

  it('predicts ally action-cursor turns with cursor action segments', () => {
    const cursorState = state({
      combat: {
        actionCursor: { side: 'ally', index: 0, opening: false },
      },
    });

    assert.equal(canRunOptimisticPveTurn(cursorState, 'attack'), true);
    const result = buildOptimisticCombatTurn({
      state: cursorState,
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_cursor',
    });

    assert.equal(result.localTranscript.actionType, 'attack');
    assert.equal(result.localTranscript.actionSegments[0].actor.side, 'ally');
    assert.equal(result.localTranscript.actionSegments[0].actor.index, 0);
    assert.equal(result.localTranscript.playerAttacks.length, 1);
    assert.equal(result.localNextCombat.actionCursor.side, 'ally');
    assert.equal(result.envelope.payload.predictionMode, 'shared-pve-turn-v1');
  });

  it('predicts NPC battle action-cursor turns because live NPC battles use the same cursor flow', () => {
    const npcCursorState = state({
      combat: {
        actionCursor: { side: 'ally', index: 0, opening: false },
        npcId: 'kodomo',
        npcData: { id: 'kodomo', nameEn: 'Child' },
      },
    });

    assert.equal(canRunOptimisticPveTurn(npcCursorState, 'attack'), true);
    const result = buildOptimisticCombatTurn({
      state: npcCursorState,
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_npc_cursor',
    });

    assert.equal(result.localTranscript.actionSegments[0].actor.side, 'ally');
    assert.equal(result.envelope.payload.predictionMode, 'shared-pve-turn-v1');
  });

  it('does not predict turns with server-only KO feedback', () => {
    const koState = state({
      combat: {
        enemies: [
          createCombatant({ id: 'mizu', hp: 1, maxHp: 30 }),
          createCombatant({ id: 'kusa', hp: 100, maxHp: 100 }),
        ],
      },
    });
    const terminalState = state({
      combat: {
        enemies: [createCombatant({ id: 'mizu', hp: 1, maxHp: 30 })],
      },
    });
    const cursorKoState = state({
      combat: {
        actionCursor: { side: 'ally', index: 0, opening: false },
        enemies: [createCombatant({ id: 'mizu', hp: 1, maxHp: 30 })],
      },
    });

    assert.equal(buildOptimisticCombatTurn({
      state: koState,
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_ko',
    }), null);
    assert.equal(buildOptimisticCombatTurn({
      state: terminalState,
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_terminal',
    }), null);
    assert.equal(buildOptimisticCombatTurn({
      state: cursorKoState,
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_cursor_ko',
    }), null);
  });
});
