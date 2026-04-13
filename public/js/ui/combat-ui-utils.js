/**
 * Shared combat UI helpers (HP bar colors, etc.).
 */

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
