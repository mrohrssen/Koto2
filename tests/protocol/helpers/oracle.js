import { PAUSE_REASONS } from '../../../src/shared/explore/pause-reasons.js';

export function pauseReasonInfo(reason) {
  return PAUSE_REASONS[reason] || null;
}

export async function readProtocolOracle({
  client,
  manager,
  session,
  recorded,
  checkpoints,
  checkpointEffects,
  corrections,
  pauses,
  link,
  initialRoom,
  initialItemsCollected,
} = {}) {
  const stateResponse = await client.getState();
  if (stateResponse.status !== 200) {
    throw new Error(`state fetch failed: ${JSON.stringify(stateResponse.body)}`);
  }

  const recordedEntries = recorded
    .map(result => result?.entry)
    .filter(entry => entry?.actionId);
  const recordedActionIds = recordedEntries.map(entry => entry.actionId);
  const pendingActionIds = session.snapshot().map(entry => entry.actionId);

  // The V1 ledger is an object with an entries map plus ordered IDs. Keep this
  // read literal so the protocol gate catches accidental array-shaped assumptions.
  const ledger = manager?.meta?.actionLedger
    || manager?.meta?.optimisticActionLedger
    || { entries: {}, order: [] };
  const ledgerEntries = ledger?.entries && typeof ledger.entries === 'object'
    ? ledger.entries
    : {};
  const ledgerOrder = Array.isArray(ledger?.order) ? ledger.order : [];
  const recordedSet = new Set(recordedActionIds);
  const committedRecordedActionIds = ledgerOrder.filter(actionId => (
    recordedSet.has(actionId) && Object.hasOwn(ledgerEntries, actionId)
  ));

  const knownActionIds = new Set([...pendingActionIds, ...committedRecordedActionIds]);
  const silentDeletedActionIds = recordedActionIds.filter(actionId => !knownActionIds.has(actionId));
  const requestedActionIds = link.requests.flatMap(request => (
    Array.isArray(request?.entries) ? request.entries.map(entry => entry.actionId) : []
  ));
  const replayedActionIds = checkpoints.flatMap(checkpoint => (
    Array.isArray(checkpoint?.results)
      ? checkpoint.results.filter(result => result?.replayed).map(result => result.actionId)
      : []
  ));

  const uniqueCommittedChoices = new Set(recordedEntries
    .filter(entry => entry.kind === 'friendlyNpc.choose' && committedRecordedActionIds.includes(entry.actionId))
    .map(entry => entry.actionId)).size;
  const choiceEffectSample = checkpointEffects.findLast(sample => (
    sample.response?.results?.some(result => (
      recordedEntries.some(entry => (
        entry.kind === 'friendlyNpc.choose'
        && entry.actionId === result?.actionId
      ))
    ))
  ));
  const appliedChoiceEffects = choiceEffectSample
    ? choiceEffectSample.itemsCollected - initialItemsCollected
    : 0;

  return {
    recordedActionIds,
    requestedActionIds,
    committedRecordedActionIds,
    replayedActionIds,
    pendingCount: session.pendingCount(),
    silentDeletedActionIds,
    duplicateGameEffects: Math.max(0, appliedChoiceEffects - uniqueCommittedChoices),
    missingGameEffects: Math.max(0, uniqueCommittedChoices - appliedChoiceEffects),
    duplicateExternalEffects: 0,
    correctedSyncsUnderPureTransport: corrections.length,
    observedPauseReasons: pauses.map(event => event.reason),
    unrecoverablePauses: pauses.filter(event => !pauseReasonInfo(event.reason)).length,
    serverRoomAdvance: (stateResponse.body.run?.currentRoom ?? initialRoom) - initialRoom,
    serverState: stateResponse.body,
  };
}
