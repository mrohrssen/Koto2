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

export function getPvePredictionBlockers(transcript = {}, options = {}) {
  const {
    allowVisualKoPrediction = false,
    allowPendingCombatEndShell = false,
  } = options;
  const blockers = [];

  if (!transcript) return blockers;
  if (transcript.combatEnded || transcript.allEnemiesDefeated || transcript.allAlliesDefeated) {
    if (!allowPendingCombatEndShell) blockers.push('combatEnd');
  }
  if (transcript.befriendQuizTriggered) blockers.push('befriendQuizTriggered');
  if (transcript.nextWave) blockers.push('nextWave');
  if ((transcript.xpEvents || []).length > 0) blockers.push('xpEvents');
  if ((transcript.koSwaps || []).length > 0) blockers.push('koSwaps');
  if ((transcript.koRemovals || []).length > 0) blockers.push('koRemovals');
  if (hasDefeatEvent(transcript.effectEvents)) blockers.push('effectDefeatEvents');
  if (hasDefeatEvent(transcript.roundStartEvents)) blockers.push('roundStartDefeatEvents');

  const hasVisualDefeat =
    hasDefeatedStateSummary(transcript.stateSummary)
    || hasDefeatRecord([
      ...(transcript.attacks || []),
      ...(transcript.playerAttacks || []),
      ...(transcript.enemyAttacks || []),
      ...(transcript.counterAttacks || []),
      ...(transcript.inlineCounters || []),
    ])
    || (transcript.actionSegments || []).some(segment => hasDefeatRecord([
      ...(segment.attacks || []),
      ...(segment.counterAttacks || []),
    ]) || hasDefeatEvent(segment.effectEvents));

  if (hasVisualDefeat && !allowVisualKoPrediction) {
    blockers.push('defeatVisuals');
  }

  return [...new Set(blockers)];
}

export function hasPveServerOnlyFeedback(transcript = {}, options = {}) {
  return getPvePredictionBlockers(transcript, options).length > 0;
}
