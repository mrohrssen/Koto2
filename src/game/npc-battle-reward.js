export function isNpcBattleRewardResolved(room) {
  const reward = room?.npcBattle;
  if (reward?.rewardResolved === true) return true;
  if (reward?.chosenSkillId) return true;
  if (reward?.rewardResolved === false) return false;
  return room?.interacted === true
    && reward?.skillSelectionPending === false;
}

export function armNpcBattleReward(room) {
  room.npcBattle ||= {};
  delete room.npcBattle.chosenSkillId;
  delete room.npcBattle.offered;
  room.npcBattle.skillSelectionPending = true;
  room.npcBattle.rewardResolved = false;
  return room.npcBattle;
}

export function markNpcBattleRewardResolved(
  room,
  { chosenSkillId = null } = {},
) {
  room.npcBattle ||= {};
  room.npcBattle.skillSelectionPending = false;
  room.npcBattle.rewardResolved = true;
  if (chosenSkillId) room.npcBattle.chosenSkillId = chosenSkillId;
  room.interacted = true;
  return room.npcBattle;
}
