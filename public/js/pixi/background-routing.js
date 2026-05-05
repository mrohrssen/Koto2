const NO_AREA_PHASES = new Set([
  'hub',
  'no_save',
  'area_selection',
  'pvp_lobby',
  'pvp_team_select',
]);

export function getRunBackgroundKey({ phase, run, pvpActive } = {}) {
  if (pvpActive) return 'pvp_arena';
  if (!run?.active || NO_AREA_PHASES.has(phase)) return null;

  const currentArea = run.currentArea;
  if (currentArea && typeof currentArea === 'object') {
    if (typeof currentArea.parallaxId === 'string' && currentArea.parallaxId.length > 0) {
      return currentArea.parallaxId;
    }
    if (typeof currentArea.id === 'string' && currentArea.id.length > 0) {
      return currentArea.id;
    }
  }

  return 'starter_meadow';
}

export function getBackgroundMode({ desiredKey } = {}) {
  return desiredKey ? 'battlefield' : 'none';
}
