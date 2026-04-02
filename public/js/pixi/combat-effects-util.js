/**
 * @file combat-effects-util.js — Pure logic for damage tier configuration
 *
 * Maps damage percentages to visual effect tiers. No DOM or PixiJS dependencies.
 */

const TIER_THRESHOLDS = [10, 20, 35, 50];

/**
 * Get the damage tier (0-4) based on damage as a percentage of max HP.
 * @param {number} damage - Raw damage dealt
 * @param {number} enemyMaxHp - Enemy's maximum HP
 * @returns {number} Tier 0-4
 */
export function getDamageTier(damage, enemyMaxHp) {
  if (!enemyMaxHp || enemyMaxHp <= 0) return 1;
  const percent = (damage / enemyMaxHp) * 100;
  if (percent >= TIER_THRESHOLDS[3]) return 4;
  if (percent >= TIER_THRESHOLDS[2]) return 3;
  if (percent >= TIER_THRESHOLDS[1]) return 2;
  if (percent >= TIER_THRESHOLDS[0]) return 1;
  return 0;
}

/**
 * Map a tier number to a human-readable class name.
 * @param {number} tier
 * @returns {string}
 */
export function getTierClassName(tier) {
  return ['light', 'normal', 'solid', 'big', 'massive'][tier] || 'normal';
}

/** Visual effect config per tier */
export const TIER_EFFECTS = [
  { shake: 'none',   hitStop: 0,   particles: 4,  flash: 'none' },
  { shake: 'light',  hitStop: 30,  particles: 8,  flash: 'none' },
  { shake: 'medium', hitStop: 60,  particles: 12, flash: 'element' },
  { shake: 'heavy',  hitStop: 100, particles: 18, flash: 'both' },
  { shake: 'heavy',  hitStop: 150, particles: 25, flash: 'screen2x' },
];

/** Recoil distance per tier (px) */
export const TIER_RECOIL = [2, 4, 6, 7, 8];

/** Damage number font sizes per tier (px) */
export const TIER_FONT_SIZES = [20, 26, 30, 36, 44];
