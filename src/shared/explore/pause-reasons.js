const RECOVERABLE_REASONS = {
  dependency: { severity: 'temporary', automaticRecovery: true, manualRecovery: false, resumeWhen: 'dependent actions settle' },
  syncPending: { severity: 'temporary', automaticRecovery: true, manualRecovery: true, resumeWhen: 'pending actions settle' },
  noPreparedRoom: { severity: 'temporary', automaticRecovery: true, manualRecovery: true, resumeWhen: 'a prepared runway arrives' },
  currentRoomNotReady: { severity: 'temporary', automaticRecovery: true, manualRecovery: true, resumeWhen: 'the current room is offline-ready' },
  nextRoomNotReady: { severity: 'temporary', automaticRecovery: true, manualRecovery: true, resumeWhen: 'the next room is offline-ready' },
  runwayExhausted: { severity: 'temporary', automaticRecovery: true, manualRecovery: true, resumeWhen: 'the runway is refreshed' },
  missingPayload: { severity: 'temporary', automaticRecovery: true, manualRecovery: true, resumeWhen: 'the required payload arrives' },
  actionNotAccepted: { severity: 'temporary', automaticRecovery: true, manualRecovery: true, resumeWhen: 'the runway accepts the action' },
  hardCap: { severity: 'temporary', automaticRecovery: true, manualRecovery: true, resumeWhen: 'pending actions drop below the cap' },
  combatPlaybackFailed: { severity: 'temporary', automaticRecovery: true, manualRecovery: true, resumeWhen: 'combat playback recovers' },
  transportDegraded: { severity: 'warning', automaticRecovery: true, manualRecovery: true, resumeWhen: 'a sync response settles' },
  authRequired: { severity: 'blocking', automaticRecovery: true, manualRecovery: true, resumeWhen: 'authentication succeeds and the session is adopted' },
  storageUnavailable: { severity: 'warning', automaticRecovery: true, manualRecovery: true, resumeWhen: 'local storage is available' },
  writerConflict: { severity: 'blocking', automaticRecovery: true, manualRecovery: true, resumeWhen: 'the writer lease is adopted or taken over' },
};

export const PAUSE_REASONS = Object.freeze(Object.fromEntries(
  Object.entries(RECOVERABLE_REASONS).map(([reason, policy]) => [reason, Object.freeze(policy)]),
));
