import test from 'node:test';
import assert from 'node:assert/strict';

import {
  armNpcBattleReward,
  isNpcBattleRewardResolved,
  markNpcBattleRewardResolved,
} from '../../../src/game/npc-battle-reward.js';

test('recognizes explicit and inferred old-save NPC reward resolution', () => {
  assert.equal(isNpcBattleRewardResolved({
    type: 'npcBattle', interacted: false, npcBattle: { rewardResolved: true },
  }), true);
  assert.equal(isNpcBattleRewardResolved({
    type: 'npcBattle', interacted: true, npcBattle: { chosenSkillId: 'arcStrike' },
  }), true);
  assert.equal(isNpcBattleRewardResolved({
    type: 'npcBattle',
    interacted: true,
    npcBattle: { rewardResolved: false, chosenSkillId: 'arcStrike' },
  }), true);
  assert.equal(isNpcBattleRewardResolved({
    type: 'npcBattle', interacted: true, npcBattle: { skillSelectionPending: false },
  }), true);
  assert.equal(isNpcBattleRewardResolved({
    type: 'npcBattle', interacted: true, npcBattle: { skillSelectionPending: true },
  }), false);
});

test('keeps an explicitly unresolved NPC reward unresolved', () => {
  assert.equal(isNpcBattleRewardResolved({
    type: 'npcBattle',
    interacted: true,
    npcBattle: { rewardResolved: false },
  }), false);
  assert.equal(isNpcBattleRewardResolved({
    type: 'npcBattle',
    interacted: true,
    npcBattle: { rewardResolved: false, skillSelectionPending: false },
  }), false);
});

test('arming an NPC battle reward explicitly reopens resolution', () => {
  const room = {
    type: 'npcBattle',
    interacted: true,
    npcBattle: {
      rewardResolved: true,
      skillSelectionPending: false,
      chosenSkillId: 'hpMaster',
      offered: [{ id: 'hpMaster', level: 1 }],
    },
  };

  armNpcBattleReward(room);

  assert.equal(room.npcBattle.skillSelectionPending, true);
  assert.equal(room.npcBattle.rewardResolved, false);
  assert.equal(room.npcBattle.chosenSkillId, undefined);
  assert.equal(room.npcBattle.offered, undefined);
  assert.equal(isNpcBattleRewardResolved(room), false);
});

test('marking an NPC battle reward persists the chosen skill and closes it', () => {
  const room = {
    type: 'npcBattle',
    interacted: false,
    npcBattle: { rewardResolved: false, skillSelectionPending: true },
  };

  markNpcBattleRewardResolved(room, { chosenSkillId: 'hpMaster' });

  assert.equal(room.interacted, true);
  assert.equal(room.npcBattle.skillSelectionPending, false);
  assert.equal(room.npcBattle.rewardResolved, true);
  assert.equal(room.npcBattle.chosenSkillId, 'hpMaster');
});
