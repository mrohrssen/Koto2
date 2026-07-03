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

function hasNonEmpty(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value != null && value !== false;
}

function hasDefeatedStateSummary(stateSummary = {}) {
  const defeated = creature => creature && typeof creature.hp === 'number' && creature.hp <= 0;
  return (stateSummary.enemies || []).some(defeated)
    || (stateSummary.allies || []).some(defeated);
}

export const PVE_VISUAL_PREDICTION_OPTIONS = Object.freeze({
  allowVisualKoPrediction: true,
  allowPendingCombatEndShell: true,
});

export const SANITIZABLE_PVE_BLOCKERS = new Set([
  'xpEvents',
  'newCollectionAdditions',
  'tutorialRewards',
  'elementDropsCollected',
  'reward',
  'rewards',
  'postCombatShop',
  'pendingMoveLearn',
  'moveLearnPrompts',
]);

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
  if (hasNonEmpty(transcript.newCollectionAdditions)) blockers.push('newCollectionAdditions');
  if (hasNonEmpty(transcript.tutorialRewards)) blockers.push('tutorialRewards');
  if (hasNonEmpty(transcript.elementDropsCollected)) blockers.push('elementDropsCollected');
  if (hasNonEmpty(transcript.reward)) blockers.push('reward');
  if (hasNonEmpty(transcript.rewards)) blockers.push('rewards');
  if (hasNonEmpty(transcript.postCombatShop)) blockers.push('postCombatShop');
  if (hasNonEmpty(transcript.pendingMoveLearn)) blockers.push('pendingMoveLearn');
  if (hasNonEmpty(transcript.moveLearnPrompts)) blockers.push('moveLearnPrompts');
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

export function getUnsafePveVisualPredictionBlockers(transcript = {}) {
  return getPvePredictionBlockers(
    transcript,
    PVE_VISUAL_PREDICTION_OPTIONS,
  ).filter(blocker => !SANITIZABLE_PVE_BLOCKERS.has(blocker));
}

export function hasUnsafePveVisualPredictionFeedback(transcript = {}) {
  return getUnsafePveVisualPredictionBlockers(transcript).length > 0;
}

export function isBefriendEligibleTerminalPvePrediction({ combat, transcript } = {}) {
  if (!transcript) return false;
  const terminalEnemyVictory =
    transcript.allEnemiesDefeated === true
    || (transcript.combatEnded === true && transcript.victory === true);
  if (!terminalEnemyVictory) return false;

  return combat?.isBoss !== true
    && !combat?.npcId
    && !combat?.npcData;
}

export function hasUnsafeSharedPveOptimisticPrediction({ combat, transcript } = {}) {
  return hasUnsafePveVisualPredictionFeedback(transcript)
    || isBefriendEligibleTerminalPvePrediction({ combat, transcript });
}

// ============================================================================
// Two-mode PvE prediction policy
// ----------------------------------------------------------------------------
// There are two distinct safety bars for an optimistically-predicted PvE turn,
// because the two consumers reconcile with the server differently:
//
//   STRICT  (hasUnsafeSharedPveOptimisticPrediction, above)
//     Used by the ONLINE per-turn verify path (combat-cycle-service
//     verifyAndCommitCreatureCombatCycle) and mirrored for PvP semantics. Under
//     per-turn verify the client applies its predicted turn immediately and only
//     the server's `accepted` acknowledgement makes it durable. So the STRICT
//     bar rejects any turn whose faithful outcome the client cannot itself
//     produce without server-only data — including EVERY ally-KO turn (koSwaps /
//     koRemovals) and EVERY befriend-eligible wild-encounter terminal victory
//     (isBefriendEligibleTerminalPvePrediction), because online those need a
//     server round-trip to resolve the replacement / befriend offer. This
//     predicate MUST stay byte-identical — the parity rule keeps PvE-online and
//     PvP regression-free.
//
//   SESSION (hasUnsafeSessionPvePrediction, below)
//     Used by the offline explore-session combat path. Session turns are pure,
//     deterministic resolver output committed later by replayCombatCycleEntry
//     (which has NO unsafe gate — it hash-verifies the same core transcript and
//     commits regardless of KO/terminal shape). Under this model the two STRICT
//     exclusions are unnecessarily conservative:
//       • koSwaps / koRemovals — resolvePveTurn/resolvePveCursorTurn resolve ally
//         KO swaps automatically IN-TRANSCRIPT (processKoSwaps:true, no player
//         replacement choice mid-turn), so the client can play them faithfully.
//       • befriend-eligible terminal victory — victory UX is the pendingCombatEnd
//         shell (rewards stay server-owned, granted on checkpoint) and the
//         actual befriend flow is online-gated separately (Task 11), so a
//         terminal wild victory is safe to predict.
//     What SESSION still blocks is genuinely non-simulatable feedback that would
//     make the local transcript diverge from the server's replay: a mid-turn
//     befriend quiz (befriendQuizTriggered), a wave transition (nextWave), and
//     any server-only reward/collection/shop field that survives the
//     visual-safe sanitizer (the SANITIZABLE_PVE_BLOCKERS remainder).
// ============================================================================

// Blockers that the SESSION path treats as genuinely non-simulatable. Unlike the
// STRICT set, koSwaps/koRemovals/defeatVisuals/combatEnd are allowed (the
// pendingCombatEnd shell + resolver-automatic swaps cover them). This mirrors
// getUnsafePveVisualPredictionFeedback's sanitizer exclusion but ALSO drops the
// visual-KO/terminal blockers that only matter for the online per-turn path.
const SESSION_SAFE_PVE_BLOCKERS = new Set([
  ...SANITIZABLE_PVE_BLOCKERS,
  'combatEnd',
  'koSwaps',
  'koRemovals',
  'defeatVisuals',
  'effectDefeatEvents',
  'roundStartDefeatEvents',
]);

export function getUnsafeSessionPvePredictionBlockers(transcript = {}) {
  return getPvePredictionBlockers(transcript, PVE_VISUAL_PREDICTION_OPTIONS)
    .filter(blocker => !SESSION_SAFE_PVE_BLOCKERS.has(blocker));
}

export function hasUnsafeSessionPvePrediction({ transcript } = {}) {
  return getUnsafeSessionPvePredictionBlockers(transcript).length > 0;
}
