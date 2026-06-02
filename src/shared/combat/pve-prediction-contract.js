function hasDefeatRecord(records = []) {
  return records.some(record => {
    if (record?.targetDefeated === true) return true;
    return hasDefeatRecord([
      ...(record?.partySkillProcs || []),
      ...(record?.procs || []),
    ]);
  });
}

function hasDefeatEvent(events = []) {
  return events.some(event => event?.targetDefeated === true);
}

function hasDefeatedStateSummary(stateSummary = {}) {
  const defeated = creature => creature && typeof creature.hp === 'number' && creature.hp <= 0;
  return (stateSummary.enemies || []).some(defeated)
    || (stateSummary.allies || []).some(defeated);
}

export function hasPveServerOnlyFeedback(transcript = {}) {
  if (!transcript) return false;
  if (
    transcript.combatEnded
    || transcript.befriendQuizTriggered
    || transcript.nextWave
    || transcript.allEnemiesDefeated
    || transcript.allAlliesDefeated
  ) return true;
  if ((transcript.xpEvents || []).length > 0) return true;
  if ((transcript.koSwaps || []).length > 0 || (transcript.koRemovals || []).length > 0) return true;
  if (hasDefeatEvent(transcript.effectEvents) || hasDefeatEvent(transcript.roundStartEvents)) return true;
  if (hasDefeatedStateSummary(transcript.stateSummary)) return true;

  const directRecords = [
    ...(transcript.attacks || []),
    ...(transcript.playerAttacks || []),
    ...(transcript.enemyAttacks || []),
    ...(transcript.counterAttacks || []),
    ...(transcript.inlineCounters || []),
  ];
  if (hasDefeatRecord(directRecords)) return true;

  return (transcript.actionSegments || []).some(segment => hasDefeatRecord([
    ...(segment.attacks || []),
    ...(segment.counterAttacks || []),
  ]) || hasDefeatEvent(segment.effectEvents));
}
