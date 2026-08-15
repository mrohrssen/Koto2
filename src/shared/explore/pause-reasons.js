const PRIORITY = Object.freeze({
  temporary: 10,
  warning: 20,
  writerConflict: 30,
  authRequired: 40,
  unsupportedProtocol: 50,
});

const RECOVERABLE_REASONS = {
  dependency: { severity: 'temporary', priority: PRIORITY.temporary },
  syncPending: { severity: 'temporary', priority: PRIORITY.temporary },
  noPreparedRoom: { severity: 'temporary', priority: PRIORITY.temporary },
  currentRoomNotReady: { severity: 'temporary', priority: PRIORITY.temporary },
  nextRoomNotReady: { severity: 'temporary', priority: PRIORITY.temporary },
  runwayExhausted: { severity: 'temporary', priority: PRIORITY.temporary },
  missingPayload: { severity: 'temporary', priority: PRIORITY.temporary },
  actionNotAccepted: { severity: 'temporary', priority: PRIORITY.temporary },
  hardCap: { severity: 'temporary', priority: PRIORITY.temporary },
  combatPlaybackFailed: { severity: 'temporary', priority: PRIORITY.temporary },
  transportDegraded: { severity: 'warning', priority: PRIORITY.warning },
  writerConflict: { severity: 'blocking', priority: PRIORITY.writerConflict },
  authRequired: { severity: 'blocking', priority: PRIORITY.authRequired },
  unsupportedProtocol: { severity: 'blocking', priority: PRIORITY.unsupportedProtocol },
};

export const PAUSE_REASONS = Object.freeze(Object.fromEntries(
  Object.entries(RECOVERABLE_REASONS).map(([reason, policy]) => [reason, Object.freeze(policy)]),
));

export function pausePriority(reason) {
  return PAUSE_REASONS[reason]?.priority ?? -Infinity;
}

export function shouldReplacePauseReason(currentReason, nextReason) {
  return pausePriority(nextReason) > pausePriority(currentReason);
}
