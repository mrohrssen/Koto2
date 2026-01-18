/**
 * Simplified Stats System
 *
 * This is a stripped-down version with only two stats:
 * - attack: How much damage you deal
 * - maxHp: How much health you have
 *
 * No levels, no XP, no derived stats, no hit/miss mechanics.
 * Damage = attack * random(0.85, 1.15)
 *
 * TO RESTORE FULL iRO SYSTEM:
 * Replace this file with stats.full.js
 */

// ============ SIMPLIFIED STAT FUNCTIONS ============

/**
 * Calculate derived stats - simplified version
 * Only returns atk, everything else is zeroed/stubbed
 */
export function calculateDerivedStats(primaryStats, baseLevel = 1, equipmentBonuses = {}, isRanged = false) {
  // In simplified mode, we just pass through the attack value if provided
  // Otherwise calculate from level (for backwards compatibility during transition)
  const atk = equipmentBonuses.atk || 10;

  return {
    atk,
    def: 0,
    matk: 0,
    mdef: 0,
    hit: 100,  // Always hits
    flee: 0,
    crit: 0,
    critShield: 0,
    perfectDodge: 0
  };
}

/**
 * Calculate max HP - simplified version
 * Just returns a flat value (no level/VIT scaling)
 */
export function calculateMaxHp(baseLevel = 1, vit = 0, equipmentBonus = 0) {
  // Default starting HP, can be overridden
  return 100 + equipmentBonus;
}

/**
 * Calculate max SP - simplified version (stubbed)
 */
export function calculateMaxSp(baseLevel = 1, int = 0, equipmentBonus = 0) {
  return 50 + equipmentBonus;
}

// ============ STUBBED FUNCTIONS (for compatibility) ============

export function getStatPointCost(currentValue) {
  return 0;  // No stat allocation in simplified mode
}

export function getTotalCostToReach(targetValue) {
  return 0;
}

export function getStatPointsForLevel(level) {
  return 0;  // No levels in simplified mode
}

export function getTotalStatPointsToLevel(level) {
  return 0;
}

export function calculateHpRegen(vit) {
  return 0;  // No regen in simplified mode
}

export function calculateSpRegen(int) {
  return 0;
}

export function calculateDefendRecovery(maxHp, maxSp, vit, int) {
  return { hpRecovery: 0, spRecovery: 0 };
}

export function calculateASPD(agi, dex) {
  return 150;  // Fixed attack speed
}

export function calculateAttackInterval(aspd) {
  return 1000;  // 1 second fixed
}

export function getEntityAttackInterval(entity) {
  return 1000;
}

export function calculateHitChance(attackerHit, defenderFlee) {
  return 100;  // Always hits in simplified mode
}

export function calculateEffectiveCrit(attackerCrit, defenderCritShield) {
  return 0;  // No crits in simplified mode
}

/**
 * Calculate physical damage - SIMPLIFIED
 * Damage = attack * random(0.85, 1.15)
 * No defense, no crits
 */
export function calculatePhysicalDamage(atk, def = 0, isCritical = false, variance = 0.15, armorPen = 0) {
  // Simplified: just attack with variance, ignore defense
  const varianceMultiplier = 0.85 + Math.random() * 0.30;  // 0.85 to 1.15
  return Math.max(1, Math.floor(atk * varianceMultiplier));
}

/**
 * Calculate magic damage - SIMPLIFIED (same as physical)
 */
export function calculateMagicDamage(matk, mdef = 0, skillMultiplier = 1.0, variance = 0.15) {
  const varianceMultiplier = 0.85 + Math.random() * 0.30;
  return Math.max(1, Math.floor(matk * skillMultiplier * varianceMultiplier));
}

export function calculateFleeChance(playerAgi, enemyAgi) {
  return 50;  // Fixed 50% flee chance
}

export function calculateStatusResistance(statValue, statusType) {
  return 0;  // No status resistance
}

export function calculateItemHealing(baseHealing, stat, isHpItem = true) {
  return baseHealing;  // No bonus healing
}

/**
 * Get starting stats - simplified (empty stats object)
 */
export function getStartingPlayerStats() {
  return {
    stats: {},
    statPoints: 0
  };
}

// Empty stat names (no longer used)
export const STAT_NAMES = {};
export const STAT_DESCRIPTIONS = {};
