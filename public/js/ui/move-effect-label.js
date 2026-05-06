const STAT_LABELS = { atk: 'Atk', def: 'Def', dex: 'Dex' };
const STAT_PRIORITY = ['atk', 'def', 'dex'];

function pickDominantStat(statChanges) {
  const entries = Object.entries(statChanges || {}).filter(([, v]) => v !== 0);
  if (entries.length === 0) return null;

  let best = entries[0];
  for (const [key, val] of entries) {
    const [bestKey, bestVal] = best;
    if (Math.abs(val) > Math.abs(bestVal)) best = [key, val];
    else if (Math.abs(val) === Math.abs(bestVal) &&
             STAT_PRIORITY.indexOf(key) < STAT_PRIORITY.indexOf(bestKey)) best = [key, val];
  }
  return best;
}

function capitalize(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Compute the right-hand stat label for a move-select card pill.
 * @param {object} move - move data (category, power, mpCost, statChanges, statusEffect, statusDuration)
 * @returns {{iconType: string, text: string}}
 */
export function effectLabel(move) {
  if (move.isRest) {
    return { iconType: 'drop', text: '+20% MP' };
  }

  if (move.category === 'buff') {
    const dominant = pickDominantStat(move.statChanges);
    if (dominant) {
      const [key, val] = dominant;
      const label = STAT_LABELS[key] || capitalize(key);
      const sign = val > 0 ? '+' : '';
      return { iconType: 'chevron-up', text: `${label} ${sign}${val}` };
    }
  }

  if (move.category === 'debuff') {
    const dominant = pickDominantStat(move.statChanges);
    if (dominant) {
      const [key, val] = dominant;
      const label = STAT_LABELS[key] || capitalize(key);
      return { iconType: 'chevron-down', text: `${label} ${val}` };
    }
  }

  if (move.category === 'heal') {
    return { iconType: 'heart', text: `Heal ${move.power ?? 0}` };
  }

  if (move.statusEffect && move.category !== 'damage') {
    const duration = move.statusDuration || 0;
    return { iconType: 'star', text: `${capitalize(move.statusEffect)} ${duration}T` };
  }

  return { iconType: 'sword', text: String(move.power ?? 0) };
}
