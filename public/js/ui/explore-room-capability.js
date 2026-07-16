export function activeRoomForExploreState(state) {
  if (state?.room?.id) return state.room;
  const currentRoom = state?.run?.currentRoom;
  return Number.isInteger(currentRoom) && Array.isArray(state?.run?.rooms)
    ? state.run.rooms[currentRoom] || null
    : null;
}

export function isActiveStandardExploreSession(session, state) {
  return Boolean(
    session
    && state?.run?.active === true
    && state.run.mode !== 'kanjiKombat'
  );
}

export function preparedExploreRoomCapability({
  session,
  state,
  room = activeRoomForExploreState(state),
  expectedKind,
  requiredActions = [],
  validatePayload = () => true,
} = {}) {
  const activeStandard = isActiveStandardExploreSession(session, state);
  const prepared = activeStandard ? session.currentPreparedRoom?.() : null;
  const payload = prepared?.interactionPayload;
  const roomId = room?.id;
  const currentRoom = state?.run?.currentRoom;
  const acceptedActions = prepared?.acceptedActions;
  const missingPayloadReasons = Array.isArray(prepared?.missingPayloadReasons)
    && prepared.missingPayloadReasons.length > 0
    ? [...prepared.missingPayloadReasons]
    : [`${expectedKind || room?.type || 'room'}.payload`];

  let payloadValid = false;
  try {
    payloadValid = validatePayload(payload, prepared, room) === true;
  } catch {
    payloadValid = false;
  }

  const valid = activeStandard
    && session.isPaused?.() !== true
    && Number.isInteger(currentRoom)
    && prepared?.index === currentRoom
    && typeof roomId === 'string'
    && roomId.length > 0
    && room?.type === expectedKind
    && prepared?.roomId === roomId
    && prepared?.room?.id === roomId
    && prepared?.room?.type === expectedKind
    && prepared?.offlineReady === true
    && Array.isArray(acceptedActions)
    && requiredActions.every(action => acceptedActions.includes(action))
    && payload?.kind === expectedKind
    && payload?.roomId === roomId
    && payloadValid;

  return {
    activeStandard,
    valid,
    prepared,
    payload,
    missingPayloadReasons,
  };
}
