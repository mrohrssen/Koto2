/** Display names for stat stages (used in stat-change labels). */
export const SC_NAMES = { atk: 'ATK', def: 'DEF' };

/**
 * CSS variable token for HP bar fill color from current HP percentage.
 * @param {number} pct - HP as 0–100 (e.g. (hp / maxHp) * 100)
 * @returns {string}
 */
export function getHpColor(pct) {
  if (pct > 50) return 'var(--hp-green)';
  if (pct > 25) return 'var(--hp-yellow)';
  return 'var(--hp-red)';
}

/** Derive status icon keys from a creature's activeEffects + statStages. */
export function getCreatureStatusKeys(creature) {
  // Dead creatures shouldn't show status labels — the effects no longer
  // tick against a zero-HP target and the lingering pill looks like a bug
  // (e.g. stun pill hanging off a corpse).
  const hp = creature.currentHp ?? creature.hp ?? 0;
  if (hp <= 0) return [];

  const keys = [];
  if (creature.activeEffects) {
    for (const e of creature.activeEffects) {
      if (!keys.includes(e.type)) keys.push(e.type);
    }
  }
  if (creature.statStages) {
    for (const [stat, stage] of Object.entries(creature.statStages)) {
      if (stage > 0) keys.push(`${stat}_up`);
      else if (stage < 0) keys.push(`${stat}_down`);
    }
  }
  return keys;
}
