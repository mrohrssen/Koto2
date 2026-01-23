/**
 * Simplified Stats System
 *
 * Only two stats matter:
 * - attack: How much damage you deal
 * - maxHp: How much health you have
 *
 * Damage = attack * random(0.85, 1.15)
 */

/**
 * Calculate derived stats - simplified version
 * Only returns atk, everything else is zeroed
 */
export function calculateDerivedStats(primaryStats, baseLevel = 1, equipmentBonuses = {}, isRanged = false) {
  const atk = equipmentBonuses.atk || 10;
  return { atk, def: 0, matk: 0, mdef: 0, hit: 100, flee: 0, crit: 0, critShield: 0, perfectDodge: 0 };
}

/**
 * Calculate max HP - simplified (flat value + bonus)
 */
export function calculateMaxHp(baseLevel = 1, vit = 0, equipmentBonus = 0) {
  return 100 + equipmentBonus;
}

/**
 * Calculate physical damage - attack * random(0.85, 1.15)
 */
export function calculatePhysicalDamage(atk, def = 0, isCritical = false, variance = 0.15, armorPen = 0) {
  const varianceMultiplier = 0.85 + Math.random() * 0.30;
  return Math.max(1, Math.floor(atk * varianceMultiplier));
}

/**
 * Calculate magic damage - same formula as physical
 */
export function calculateMagicDamage(matk, mdef = 0, skillMultiplier = 1.0, variance = 0.15) {
  const varianceMultiplier = 0.85 + Math.random() * 0.30;
  return Math.max(1, Math.floor(matk * skillMultiplier * varianceMultiplier));
}
