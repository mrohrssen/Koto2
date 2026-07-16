import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isNpcBattleRewardResolved,
  needsNpcDialogueRecovery,
} from '../../../public/js/ui/npc-dialogue-recovery.js';

function npcRoom(npcBattle = {}, overrides = {}) {
  return {
    id: 'npc-room',
    type: 'npcBattle',
    interacted: true,
    npcBattle,
    ...overrides,
  };
}

function roomState(room, overrides = {}) {
  return {
    phase: 'room',
    run: { currentRoom: 4 },
    room,
    combat: { active: false, npcId: 'mira' },
    ...overrides,
  };
}

describe('NPC dialogue recovery state', () => {
  it('recovers the legacy dialogue phase', () => {
    assert.equal(needsNpcDialogueRecovery({ phase: 'npc_dialogue' }), true);
  });

  it('recovers the current post-combat room shell before its reward is armed', () => {
    assert.equal(needsNpcDialogueRecovery(roomState(npcRoom())), true);
    assert.equal(
      needsNpcDialogueRecovery(roomState(npcRoom({ rewardResolved: false, skillSelectionPending: false }))),
      true,
    );
  });

  it('does not replay dialogue once the NPC reward is pending or resolved', () => {
    for (const reward of [
      { rewardResolved: true },
      { chosenSkillId: 'hpMaster' },
      { skillSelectionPending: false },
      { rewardResolved: false, skillSelectionPending: true },
    ]) {
      assert.equal(
        needsNpcDialogueRecovery(roomState(npcRoom(reward))),
        false,
        JSON.stringify(reward),
      );
    }
  });

  it('requires an interacted NPC battle with post-combat NPC context', () => {
    assert.equal(needsNpcDialogueRecovery(roomState(npcRoom({}, { interacted: false }))), false);
    assert.equal(needsNpcDialogueRecovery(roomState({ type: 'encounter', interacted: true })), false);
    assert.equal(needsNpcDialogueRecovery(roomState(npcRoom(), { combat: null })), false);
  });

  it('matches the canonical NPC reward resolution compatibility rules', () => {
    assert.equal(isNpcBattleRewardResolved(npcRoom({ rewardResolved: true })), true);
    assert.equal(isNpcBattleRewardResolved(npcRoom({ chosenSkillId: 'hpMaster' })), true);
    assert.equal(isNpcBattleRewardResolved(npcRoom({ skillSelectionPending: false })), true);
    assert.equal(
      isNpcBattleRewardResolved(npcRoom({ rewardResolved: false, skillSelectionPending: false })),
      false,
    );
    assert.equal(isNpcBattleRewardResolved(npcRoom({ skillSelectionPending: true })), false);
  });
});
