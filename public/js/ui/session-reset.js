export function resetClientSessionState(state = {}, {
  cleanupCombat,
  clearActions,
  hideNarration,
  hideEnemies,
  hidePlayerFormation,
  resetFlags,
} = {}) {
  cleanupCombat?.();
  clearActions?.();
  hideNarration?.();
  hideEnemies?.();
  hidePlayerFormation?.();
  resetFlags?.();

  return {
    ...state,
    player: null,
    run: null,
    combat: null,
    phase: 'no_save',
    meta: {},
  };
}
