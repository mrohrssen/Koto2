export function isPendingNpcBattleRewardState(
  state,
  roomType,
  { npcDialogueCard = false } = {},
) {
  const reward = state?.room?.npcBattle;
  if (roomType !== 'npcBattle') return false;

  const serializedPendingReward = reward?.skillSelectionPending === true
    && reward?.rewardResolved !== true;
  // `/npc-dialogue-start` arms the reward and refreshes the server runway, but
  // deliberately returns only the defeat-line dialogue. Until Continue triggers
  // the offer fetch, the client still holds the pre-arm room shell. Exempt only
  // that visible, interacted, unresolved NPC post-victory handoff.
  const visiblePostVictoryHandoff = npcDialogueCard === true
    && state?.phase === 'room'
    && state?.room?.interacted === true
    && reward?.rewardResolved !== true;

  return serializedPendingReward || visiblePostVictoryHandoff;
}

export function liveCombatIdentity(state) {
  if (state?.phase !== 'combat' || !state?.combat) return null;
  const combatId = state.combat.optimistic?.combatId;
  if (combatId) return `combat:${combatId}`;

  const roomIndex = Number.isInteger(state?.run?.currentRoom)
    ? state.run.currentRoom
    : null;
  const roomId = state?.room?.id ?? null;
  if (roomIndex == null && roomId == null) return null;
  return `room:${roomIndex ?? 'unknown'}:${roomId ?? 'unknown'}`;
}

export function hasComparablePartyDigests(clientDigest, serverDigest) {
  return clientDigest != null && serverDigest != null;
}

export function isFinalExplorePartyCheckpoint(
  state,
  { syncResults = [], syncEntries = [] } = {},
) {
  const run = state?.run;
  if (!run?.creatureParty) return false;
  const totalRooms = Number.isInteger(run.totalRooms)
    ? run.totalRooms
    : state?.room?.totalRooms;
  const isFinalRoom = Number.isInteger(run.currentRoom)
    && Number.isInteger(totalRooms)
    && totalRooms > 0
    && run.currentRoom === totalRooms - 1;
  if (!isFinalRoom) return false;

  const authoritativeStateProvesResolution = state?.room?.interacted === true
    && state?.combat?.active === false;
  if (authoritativeStateProvesResolution) return true;

  if (!Array.isArray(syncResults) || !Array.isArray(syncEntries)) return false;
  return syncResults.some(result => {
    if (result?.combatEnded !== true || result?.victory !== true) return false;
    const matchingEntry = syncEntries.find(entry => (
      (result?.actionId && entry?.actionId === result.actionId)
      || (Number.isInteger(result?.seq) && entry?.seq === result.seq)
    ));
    return matchingEntry?.kind === 'combat.cycle'
      && matchingEntry?.roomIndex === run.currentRoom;
  });
}
