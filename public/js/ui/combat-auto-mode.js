/** Session preference shared by Explore and PvP attack playback. */
let preferredEnabled = false;
let exploreAvailable = false;
let pvpAvailable = false;
let toggleButton = null;
const listeners = new Set();

export function isCombatAutoEnabled() {
  return preferredEnabled && (exploreAvailable || pvpAvailable);
}

export function subscribeCombatAutoMode(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function renderToggle() {
  if (!toggleButton) return;
  const available = exploreAvailable || pvpAvailable;
  const enabled = isCombatAutoEnabled();
  toggleButton.hidden = !available;
  toggleButton.disabled = !available;
  toggleButton.setAttribute('aria-pressed', String(enabled));
  toggleButton.classList.toggle('is-active', enabled);
  const stateLabel = toggleButton.querySelector('.combat-auto-state');
  if (stateLabel) stateLabel.textContent = enabled ? 'On' : 'Off';
}

function applyChange(change) {
  const wasEnabled = isCombatAutoEnabled();
  change();
  renderToggle();
  const enabled = isCombatAutoEnabled();
  if (enabled !== wasEnabled) {
    for (const listener of listeners) listener(enabled);
  }
}

export function setCombatAutoEnabled(enabled) {
  applyChange(() => { preferredEnabled = enabled === true; });
}

/**
 * Retain the current Explore scope while a terminal attack is still playing.
 * Hub, tutorial and other modes always revoke it, even during stale playback.
 */
export function updateExploreCombatAutoContext(state, { playbackActive = false } = {}) {
  applyChange(() => {
    const ordinaryRun = !!state?.run
      && (state.run.mode == null || state.run.mode === 'explore')
      && (state.meta?.tutorialStep ?? 6) >= 6;
    const activeCombat = ordinaryRun
      && state.run.active === true
      && state.phase === 'combat'
      && !!state.combat
      && state.combat.active !== false;
    const playbackPhase = ['combat', 'exploring', 'room', 'post_combat_shop', 'victory', 'defeat'].includes(state?.phase);
    exploreAvailable = !pvpAvailable && (activeCombat || (
      exploreAvailable && ordinaryRun && playbackActive && playbackPhase
    ));
  });
}

/** PvP owns this context until its queued attack playback reaches the results. */
export function setPvpCombatAutoContext(active) {
  applyChange(() => {
    pvpAvailable = active === true;
    exploreAvailable = false;
  });
}

function handleToggleClick(event) {
  event.stopPropagation();
  if (exploreAvailable || pvpAvailable) setCombatAutoEnabled(!preferredEnabled);
}

export function initCombatAutoMode() {
  const nextButton = typeof document === 'undefined'
    ? null
    : document.getElementById('combat-auto-toggle');
  if (toggleButton !== nextButton) {
    toggleButton?.removeEventListener('click', handleToggleClick);
    toggleButton = nextButton;
    toggleButton?.addEventListener('click', handleToggleClick);
  }
  renderToggle();
}
