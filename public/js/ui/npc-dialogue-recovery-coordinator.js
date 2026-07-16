const CANCELLED = Object.freeze({ ok: false, reason: 'recovery_cancelled' });

export function createNpcDialogueRecoveryCoordinator({
  getState,
  needsRecovery,
  runDialogue,
  refreshState,
  renderRetry,
  onRecovered,
  resetDialogueOwnership,
  onError = error => console.warn('[NpcDialogue] Recovery failed:', error),
}) {
  let attempted = false;
  let activePromise = null;
  let generation = 0;

  const owns = owner => owner === generation;

  async function perform(owner) {
    const dialogueOutcome = await runDialogue();
    if (!owns(owner)) return CANCELLED;
    if (!dialogueOutcome?.ok) {
      return dialogueOutcome || { ok: false, reason: 'dialogue_unavailable' };
    }

    const refreshedState = await refreshState();
    if (!owns(owner)) return CANCELLED;
    if (!refreshedState || needsRecovery(refreshedState)) {
      return { ok: false, reason: 'state_refresh_failed' };
    }

    onRecovered(refreshedState);
    return { ok: true };
  }

  function run() {
    if (activePromise) return activePromise;
    if (!needsRecovery(getState())) {
      return Promise.resolve({ ok: false, reason: 'recovery_not_needed' });
    }

    attempted = true;
    const owner = generation;
    const attempt = perform(owner)
      .catch(error => {
        if (!owns(owner)) return CANCELLED;
        onError(error);
        return { ok: false, reason: 'recovery_failed' };
      })
      .then(outcome => {
        if (owns(owner) && !outcome?.ok) {
          attempted = false;
          if (needsRecovery(getState())) renderRetry(() => run());
        }
        return outcome;
      });

    let trackedPromise;
    trackedPromise = attempt.finally(() => {
      if (activePromise === trackedPromise) activePromise = null;
    });
    activePromise = trackedPromise;
    return trackedPromise;
  }

  function reset() {
    generation += 1;
    attempted = false;
    activePromise = null;
    resetDialogueOwnership?.();
  }

  function sync(state = getState()) {
    if (!needsRecovery(state) && attempted) reset();
  }

  function shouldStart() {
    return !attempted && needsRecovery(getState());
  }

  return {
    reset,
    run,
    shouldStart,
    sync,
  };
}
