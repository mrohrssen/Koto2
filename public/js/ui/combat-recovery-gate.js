/**
 * Track the page-reload combat recovery one-shot by authoritative combat ID.
 * Explore corrections can replace combat A with combat B without leaving the
 * combat phase, so phase alone is not a sufficient ownership boundary.
 */
export function createCombatRecoveryGate() {
  let phase = null;
  let combatId = null;
  let recoveryDone = false;

  function ownerFor(state) {
    return state?.phase === 'combat'
      ? state?.combat?.optimistic?.combatId ?? null
      : null;
  }

  function sync(state) {
    const nextPhase = state?.phase ?? null;
    const nextCombatId = ownerFor(state);
    if (
      nextPhase !== 'combat'
      || phase !== 'combat'
      || nextCombatId !== combatId
    ) {
      recoveryDone = false;
    }
    phase = nextPhase;
    combatId = nextCombatId;
    return recoveryDone;
  }

  function markDone(state) {
    sync(state);
    recoveryDone = true;
  }

  function shouldRecover(state, {
    combatActive = false,
    playbackRecovery = false,
    playbackRecoveryHeld = false,
  } = {}) {
    const doneForOwner = sync(state);
    return !combatActive
      && (playbackRecovery || (!playbackRecoveryHeld && !doneForOwner));
  }

  function reset() {
    phase = null;
    combatId = null;
    recoveryDone = false;
  }

  return { sync, shouldRecover, markDone, reset };
}
