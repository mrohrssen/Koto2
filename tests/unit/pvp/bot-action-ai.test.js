import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { instantiateCreatureForCombat } from '../../../src/game/creatures.js';
import { chooseBotPvpAction } from '../../../src/pvp/bot-action-ai.js';

describe('bot-action-ai', () => {
  it('returns one action for the active bot cursor', () => {
    const botTeam = [instantiateCreatureForCombat('hi', 20)];
    const humanTeam = [instantiateCreatureForCombat('ki', 20)];
    const action = chooseBotPvpAction({
      botSide: 'sideB',
      cursor: { side: 'sideB', index: 0 },
      sideA: humanTeam,
      sideB: botTeam
    });
    assert.equal(action.creatureIndex, 0);
    assert.ok(action.moveId || action.action === 'rest');
    assert.equal(typeof action.targetIndex, 'number');
  });

  it('returns null when cursor belongs to the human', () => {
    const botTeam = [instantiateCreatureForCombat('hi', 20)];
    const humanTeam = [instantiateCreatureForCombat('ki', 20)];
    assert.equal(chooseBotPvpAction({
      botSide: 'sideB',
      cursor: { side: 'sideA', index: 0 },
      sideA: humanTeam,
      sideB: botTeam
    }), null);
  });
});
