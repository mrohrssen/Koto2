import { getCurrentRoom } from './room-reveal-buffer.js';

export function isNpcBattleRewardResolved(room) {
  const reward = room?.npcBattle;
  if (reward?.rewardResolved === true) return true;
  if (reward?.chosenSkillId) return true;
  if (reward?.rewardResolved === false) return false;
  return room?.interacted === true
    && reward?.skillSelectionPending === false;
}

/**
 * The current server phase after an NPC victory can be `room`: dialogue-start
 * is the mutation that arms the skill reward. If that request was interrupted,
 * the interacted room is neither pending nor resolved and must replay dialogue
 * before normal room auto-proceed is allowed.
 */
export function needsNpcDialogueRecovery(state) {
  if (state?.phase === 'npc_dialogue') return true;
  if (state?.phase !== 'room') return false;

  const room = getCurrentRoom(state) || state.room;
  if (room?.type !== 'npcBattle' || room.interacted !== true) return false;
  if (room.npcBattle?.skillSelectionPending === true) return false;
  if (isNpcBattleRewardResolved(room)) return false;

  return Boolean(
    state.combat?.npcId
      || state.combat?.npcData
      || room.npcBattle?.npcId
      || room.npcBattle?.npc
      || room.npc,
  );
}
