// iRO-Based Stats System
// All stat calculations and formulas for the turn-based combat system

// ============ STAT POINT COSTS ============

/**
 * Calculate cost to raise a stat from X to X+1
 * Cost = floor((X - 1) / 10) + 2
 * @param {number} currentValue - Current stat value (1-99)
 * @returns {number} Points required to raise by 1
 */
export function getStatPointCost(currentValue) {
  return Math.floor((currentValue - 1) / 10) + 2;
}

/**
 * Calculate total cost to reach a stat value from 1
 * @param {number} targetValue - Target stat value
 * @returns {number} Total points needed
 */
export function getTotalCostToReach(targetValue) {
  let total = 0;
  for (let i = 1; i < targetValue; i++) {
    total += getStatPointCost(i);
  }
  return total;
}

/**
 * Calculate stat points earned per level
 * Points = floor(Level / 5) + 3
 * @param {number} level - Character level
 * @returns {number} Points earned at that level
 */
export function getStatPointsForLevel(level) {
  return Math.floor(level / 5) + 3;
}

/**
 * Calculate total stat points earned from level 1 to target level
 * @param {number} level - Target level
 * @returns {number} Total points earned (excluding starting 48)
 */
export function getTotalStatPointsToLevel(level) {
  let total = 0;
  for (let i = 2; i <= level; i++) {
    total += getStatPointsForLevel(i);
  }
  return total;
}

// ============ DERIVED STATS FORMULAS ============

/**
 * Calculate all derived stats from primary stats + equipment
 * @param {object} primaryStats - { str, agi, vit, int, dex, luk }
 * @param {number} baseLevel - Character/monster level
 * @param {object} equipmentBonuses - Equipment stat bonuses (optional)
 * @param {boolean} isRanged - True for ranged weapon (swaps STR/DEX for ATK)
 * @returns {object} Derived stats { atk, def, matk, mdef, hit, flee, crit, critShield, perfectDodge }
 */
export function calculateDerivedStats(primaryStats, baseLevel, equipmentBonuses = {}, isRanged = false) {
  const eq = equipmentBonuses;

  // Add equipment bonuses to primary stats (includes passive bonuses from chips)
  const str = (primaryStats.str || 0) + (eq.str || 0);
  const agi = (primaryStats.agi || 0) + (eq.agi || 0);
  const vit = (primaryStats.vit || 0) + (eq.vit || 0);
  const int = (primaryStats.int || 0) + (eq.int || 0);
  const dex = (primaryStats.dex || 0) + (eq.dex || 0);
  const luk = (primaryStats.luk || 0) + (eq.luk || 0);

  // ATK (Physical Attack)
  // Melee: STR + floor(DEX/5) + floor(LUK/3) + WeaponATK + floor(BaseLv/4)
  // Ranged: DEX + floor(STR/5) + floor(LUK/3) + WeaponATK + floor(BaseLv/4)
  let atk;
  if (isRanged) {
    atk = dex + Math.floor(str / 5) + Math.floor(luk / 3) + (eq.atk || 0) + Math.floor(baseLevel / 4);
  } else {
    atk = str + Math.floor(dex / 5) + Math.floor(luk / 3) + (eq.atk || 0) + Math.floor(baseLevel / 4);
  }

  // DEF (Physical Defense)
  // SoftDEF = floor(VIT/2) + floor(AGI/5) + floor(BaseLv/2)
  const softDef = Math.floor(vit / 2) + Math.floor(agi / 5) + Math.floor(baseLevel / 2);
  const def = softDef + (eq.def || 0);

  // MATK (Magic Attack)
  // MATK = floor(INT * 1.5) + floor(DEX/5) + floor(LUK/3) + WeaponMATK + floor(BaseLv/4)
  const matk = Math.floor(int * 1.5) + Math.floor(dex / 5) + Math.floor(luk / 3) + (eq.matk || 0) + Math.floor(baseLevel / 4);

  // MDEF (Magic Defense)
  // SoftMDEF = INT + floor(VIT/5) + floor(DEX/5) + floor(BaseLv/4)
  const softMdef = int + Math.floor(vit / 5) + Math.floor(dex / 5) + Math.floor(baseLevel / 4);
  const mdef = softMdef + (eq.mdef || 0);

  // HIT (Accuracy) - iRO formula: 170 + Level + DEX
  const hit = 170 + baseLevel + dex + (eq.hit || 0);

  // FLEE (Evasion) - iRO formula: 100 + BaseLv + AGI + LUK/5
  const flee = 100 + baseLevel + agi + Math.floor(luk / 5) + (eq.flee || 0);

  // CRIT (Critical Rate) - percentage
  // CritRate = LUK * 0.3
  const crit = (luk * 0.3) + (eq.crit || 0);

  // Critical Shield (reduces enemy crit chance)
  // CritShield = floor(LUK/5)
  const critShield = Math.floor(luk / 5);

  // Perfect Dodge (checked before hit roll, can dodge even crits)
  // PerfectDodge = floor(LUK/10)
  const perfectDodge = Math.floor(luk / 10);

  return {
    atk,
    def,
    matk,
    mdef,
    hit,
    flee,
    crit,
    critShield,
    perfectDodge
  };
}

// ============ HP/SP CALCULATIONS ============

/**
 * Calculate Max HP from level and VIT
 * BaseHP = 35 + (BaseLv * 5) * BaseLv / 2
 * MaxHP = floor(BaseHP * (1 + VIT * 0.01))
 * @param {number} baseLevel - Character level
 * @param {number} vit - VIT stat
 * @param {number} equipmentBonus - Flat HP bonus from equipment
 * @returns {number} Maximum HP
 */
export function calculateMaxHp(baseLevel, vit, equipmentBonus = 0) {
  const baseHp = 35 + (baseLevel * 5) * baseLevel / 2;
  return Math.floor(baseHp * (1 + vit * 0.01)) + equipmentBonus;
}

/**
 * Calculate Max SP from level and INT
 * BaseSP = 10 + (BaseLv * 3)
 * MaxSP = floor(BaseSP * (1 + INT * 0.01))
 * @param {number} baseLevel - Character level
 * @param {number} int - INT stat
 * @param {number} equipmentBonus - Flat SP bonus from equipment
 * @returns {number} Maximum SP
 */
export function calculateMaxSp(baseLevel, int, equipmentBonus = 0) {
  // BaseSP formula gives roughly:
  // Lv1: 13, Lv5: 25, Lv10: 40, Lv20: 70, Lv50: 160
  const baseSp = 10 + (baseLevel * 3);
  return Math.floor(baseSp * (1 + int * 0.01)) + equipmentBonus;
}

// ============ REGENERATION ============

/**
 * Calculate HP recovery per turn (passive regen)
 * HPRegen = floor(VIT / 10)
 * @param {number} vit - VIT stat
 * @returns {number} HP recovered per turn
 */
export function calculateHpRegen(vit) {
  return Math.floor(vit / 10);
}

/**
 * Calculate SP recovery per turn (passive regen)
 * SPRegen = floor(INT / 10)
 * @param {number} int - INT stat
 * @returns {number} SP recovered per turn
 */
export function calculateSpRegen(int) {
  return Math.floor(int / 10);
}

/**
 * Calculate defend action recovery
 * HP: floor(MaxHP / 20) + floor(VIT / 5)
 * SP: floor(MaxSP / 20) + floor(INT / 5)
 * @param {number} maxHp - Maximum HP
 * @param {number} maxSp - Maximum SP
 * @param {number} vit - VIT stat
 * @param {number} int - INT stat
 * @returns {object} { hpRecovery, spRecovery }
 */
export function calculateDefendRecovery(maxHp, maxSp, vit, int) {
  return {
    hpRecovery: Math.floor(maxHp / 20) + Math.floor(vit / 5),
    spRecovery: Math.floor(maxSp / 20) + Math.floor(int / 5)
  };
}

// ============ ATTACK SPEED (ASPD) ============

/**
 * Calculate ASPD value from AGI and DEX (iRO-inspired)
 * Base ASPD = 150, Max = 190
 * AGI is primary contributor, DEX is minor
 * ASPD = 150 + floor(AGI * 0.4) + floor(DEX * 0.1)
 * @param {number} agi - AGI stat
 * @param {number} dex - DEX stat
 * @returns {number} ASPD value (150-190)
 */
export function calculateASPD(agi, dex) {
  const baseASPD = 150;
  const fromAGI = Math.floor(agi * 0.4);
  const fromDEX = Math.floor(dex * 0.1);
  return Math.min(190, baseASPD + fromAGI + fromDEX);
}

/**
 * Calculate attack interval in milliseconds from ASPD (iRO formula)
 * Hits/sec = 50 / (200 - ASPD)
 * Interval = (200 - ASPD) * 20 ms
 * ASPD 150 = 1000ms, ASPD 190 = 200ms
 * @param {number} aspd - ASPD value (150-190)
 * @returns {number} Attack interval in milliseconds
 */
export function calculateAttackInterval(aspd) {
  // Clamp ASPD to valid range
  const clampedASPD = Math.max(150, Math.min(190, aspd));
  // (200 - ASPD) * 20 gives us: 150->1000ms, 190->200ms
  return (200 - clampedASPD) * 20;
}

/**
 * Calculate attack interval for an entity (player or enemy)
 * @param {object} entity - Entity with stats { agi, dex } or derived stats
 * @returns {number} Attack interval in milliseconds
 */
export function getEntityAttackInterval(entity) {
  const stats = entity.stats || entity;
  const agi = stats.agi || 1;
  const dex = stats.dex || 1;
  const aspd = calculateASPD(agi, dex);
  return calculateAttackInterval(aspd);
}

// ============ COMBAT CALCULATIONS ============

/**
 * Calculate hit chance for physical attacks
 * HitChance = 80 + (AttackerHIT - DefenderFLEE)
 * iRO formula: HitChance = HIT - FLEE, clamped to 5-95%
 * @param {number} attackerHit - Attacker's HIT stat
 * @param {number} defenderFlee - Defender's FLEE stat
 * @returns {number} Hit chance percentage (5-95)
 */
export function calculateHitChance(attackerHit, defenderFlee) {
  return Math.max(5, Math.min(95, attackerHit - defenderFlee));
}

/**
 * Calculate effective critical rate after crit shield
 * EffectiveCrit = max(0, CritRate - CritShield)
 * @param {number} attackerCrit - Attacker's crit rate %
 * @param {number} defenderCritShield - Defender's crit shield
 * @returns {number} Effective crit chance percentage
 */
export function calculateEffectiveCrit(attackerCrit, defenderCritShield) {
  return Math.max(0, attackerCrit - defenderCritShield);
}

/**
 * Calculate physical damage
 * Damage = max(1, ATK - effectiveDEF)
 * CritDamage = max(1, floor((ATK - effectiveDEF) * 1.4))
 * @param {number} atk - Attacker's ATK
 * @param {number} def - Defender's DEF
 * @param {boolean} isCritical - Is this a critical hit?
 * @param {number} variance - Damage variance (default 0.1 for ±10%)
 * @param {number} armorPen - Armor penetration (0-1, e.g., 0.25 ignores 25% of DEF)
 * @returns {number} Final damage
 */
export function calculatePhysicalDamage(atk, def, isCritical = false, variance = 0.1, armorPen = 0) {
  // Apply armor penetration to reduce effective defense
  const effectiveDef = def * (1 - armorPen);
  let baseDamage = atk - effectiveDef;

  // Apply variance (90-110% by default)
  const varianceMultiplier = 1 + (Math.random() * 2 - 1) * variance;
  baseDamage = baseDamage * varianceMultiplier;

  // Critical = 140% damage
  if (isCritical) {
    baseDamage = baseDamage * 1.4;
  }

  return Math.max(1, Math.floor(baseDamage));
}

/**
 * Calculate magic damage
 * Damage = max(1, (MATK * skillMultiplier) - MDEF)
 * @param {number} matk - Attacker's MATK
 * @param {number} mdef - Defender's MDEF
 * @param {number} skillMultiplier - Skill damage multiplier (default 1.0)
 * @param {number} variance - Damage variance (default 0.1 for ±10%)
 * @returns {number} Final damage
 */
export function calculateMagicDamage(matk, mdef, skillMultiplier = 1.0, variance = 0.1) {
  let baseDamage = (matk * skillMultiplier) - mdef;

  // Apply variance
  const varianceMultiplier = 1 + (Math.random() * 2 - 1) * variance;
  baseDamage = baseDamage * varianceMultiplier;

  return Math.max(1, Math.floor(baseDamage));
}

// ============ FLEE MECHANICS ============

/**
 * Calculate flee success chance (escaping from battle)
 * FleeChance = 50 + (PlayerAGI - EnemyAGI)
 * Clamped to 10-90%
 * @param {number} playerAgi - Player's AGI stat
 * @param {number} enemyAgi - Enemy's AGI stat
 * @returns {number} Flee success chance percentage
 */
export function calculateFleeChance(playerAgi, enemyAgi) {
  return Math.max(10, Math.min(90, 50 + playerAgi - enemyAgi));
}

// ============ STATUS RESISTANCES ============

/**
 * Calculate status effect resistance
 * Based on relevant stat (VIT for physical, INT for magical)
 * @param {number} statValue - Relevant stat (VIT or INT)
 * @param {string} statusType - Type of status ('stun', 'poison', 'blind', 'silence', etc.)
 * @returns {number} Resistance percentage
 */
export function calculateStatusResistance(statValue, statusType) {
  // VIT-based: stun, poison
  // INT-based: blind, silence
  // AGI-based: bleeding, sleep
  // Each point = 1% resistance
  return Math.min(95, statValue);
}

// ============ ITEM EFFECTIVENESS ============

/**
 * Calculate healing item effectiveness
 * VIT increases HP item healing by 2% per point
 * INT increases SP item healing by 1% per point
 * @param {number} baseHealing - Base healing amount
 * @param {number} stat - VIT for HP items, INT for SP items
 * @param {boolean} isHpItem - True for HP items (2% per VIT), false for SP items (1% per INT)
 * @returns {number} Final healing amount
 */
export function calculateItemHealing(baseHealing, stat, isHpItem = true) {
  const multiplier = isHpItem ? 0.02 : 0.01;
  return Math.floor(baseHealing * (1 + stat * multiplier));
}

// ============ DEFAULT STAT DISTRIBUTIONS ============

/**
 * Get starting stats for a new player (all 1s, 48 points to allocate)
 * @returns {object} { stats, statPoints }
 */
export function getStartingPlayerStats() {
  return {
    stats: {
      str: 5,
      agi: 5,
      vit: 5,
      int: 5,
      dex: 5,
      luk: 5
    },
    statPoints: 0
  };
}

/**
 * Stat name display mapping
 */
export const STAT_NAMES = {
  str: 'STR',
  agi: 'AGI',
  vit: 'VIT',
  int: 'INT',
  dex: 'DEX',
  luk: 'LUK'
};

/**
 * Stat descriptions for UI
 */
export const STAT_DESCRIPTIONS = {
  str: 'Physical melee damage',
  agi: 'Evasion (FLEE)',
  vit: 'HP and physical defense',
  int: 'Magic damage and SP',
  dex: 'Accuracy (HIT) and ranged damage',
  luk: 'Critical hits and misc bonuses'
};
