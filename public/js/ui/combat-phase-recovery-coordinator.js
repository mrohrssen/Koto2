/**
 * Synchronously decides whether the ordinary standard Explore combat loop
 * needs to restart after the UI observes a combat state.
 */
export function createCombatPhaseRecoveryCoordinator({
  getSession,
  gate,
  isCombatActive,
  getPlaybackRecoveryState,
  consumePlaybackRecovery,
  startCombat,
} = {}) {
  function isEligible(state) {
    const runMode = state?.run?.mode;
    return state?.phase === 'combat'
      && state.run?.active === true
      && (runMode === null || runMode === 'standard')
      && state.combat?.active === true;
  }

  function handle(state) {
    if (!isEligible(state)) return;

    const session = getSession?.();
    if (typeof session?.isPaused !== 'function' || session.isPaused() !== false) return;
    if (getSession?.() !== session) return;
    const combatActive = isCombatActive?.() === true;
    if (combatActive) return;

    const playbackRecoveryState = getPlaybackRecoveryState?.() || 'none';
    const playbackRecoveryHeld = playbackRecoveryState !== 'none';
    const playbackRecovery = playbackRecoveryState === 'ready'
      && consumePlaybackRecovery?.() === true;

    if (!gate?.shouldRecover?.(state, {
      combatActive,
      playbackRecovery,
      playbackRecoveryHeld,
    })) return;

    gate.markDone?.(state);
    startCombat?.({ recovery: true });
  }

  return { handle };
}
