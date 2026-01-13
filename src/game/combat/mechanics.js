/**
 * Combat Mechanics
 * Combat stats calculation, attack resolution, and attack type definitions
 */

import { calculateEquipmentBonuses } from '../items.js';
import {
  calculateDerivedStats,
  calculateHitChance,
  calculateEffectiveCrit,
  calculatePhysicalDamage,
  calculateMagicDamage
} from '../stats.js';

// ============ COMBAT STATS HELPERS ============

/**
 * Get player's complete combat stats including equipment
 */
export function getPlayerCombatStats(player) {
  const equipBonuses = calculateEquipmentBonuses(player);
  const derived = calculateDerivedStats(player.stats, player.level, equipBonuses);

  return {
    // Primary stats
    ...player.stats,
    level: player.level,
    // Resources
    hp: player.hp,
    maxHp: player.maxHp,
    sp: player.sp,
    maxSp: player.maxSp,
    // Derived combat stats
    atk: derived.atk,
    def: derived.def,
    matk: derived.matk,
    mdef: derived.mdef,
    hit: derived.hit,
    flee: derived.flee,
    crit: derived.crit,
    critShield: derived.critShield,
    perfectDodge: derived.perfectDodge
  };
}

/**
 * Get enemy's combat stats (already calculated on generation)
 */
export function getEnemyCombatStats(enemy) {
  return {
    level: enemy.level,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    sp: enemy.sp,
    maxSp: enemy.maxSp,
    atk: enemy.atk,
    def: enemy.def,
    matk: enemy.matk,
    mdef: enemy.mdef,
    hit: enemy.hit,
    flee: enemy.flee,
    crit: enemy.crit,
    critShield: enemy.critShield,
    perfectDodge: enemy.perfectDodge,
    stats: enemy.stats
  };
}

// ============ ATTACK RESOLUTION ============

/**
 * Resolve a physical attack with HIT/FLEE/CRIT mechanics
 * @param {object} attacker - Attacker's combat stats
 * @param {object} defender - Defender's combat stats
 * @param {number} skillMultiplier - Skill damage multiplier (default 1.0)
 * @param {number} armorPen - Armor penetration (0-1, ignores % of DEF)
 * @returns {object} Attack result
 */
export function resolvePhysicalAttack(attacker, defender, skillMultiplier = 1.0, armorPen = 0) {
  const result = {
    hit: false,
    miss: false,
    dodge: false,
    perfectDodge: false,
    critical: false,
    damage: 0,
    hitChance: 0,
    critChance: 0
  };

  // Step 1: Perfect Dodge check (LUK-based, checked before anything else)
  const perfectDodgeRoll = Math.random() * 100;
  if (perfectDodgeRoll < defender.perfectDodge) {
    result.perfectDodge = true;
    return result;
  }

  // Step 2: Critical check (crits bypass accuracy check)
  const effectiveCrit = calculateEffectiveCrit(attacker.crit, defender.critShield);
  result.critChance = effectiveCrit;
  const critRoll = Math.random() * 100;

  if (critRoll < effectiveCrit) {
    // Critical hit - always hits, 140% damage
    result.hit = true;
    result.critical = true;
    result.damage = calculatePhysicalDamage(attacker.atk * skillMultiplier, defender.def, true, 0.1, armorPen);
    return result;
  }

  // Step 3: Normal hit check
  const hitChance = calculateHitChance(attacker.hit, defender.flee);
  result.hitChance = hitChance;
  const hitRoll = Math.random() * 100;

  if (hitRoll < hitChance) {
    // Normal hit
    result.hit = true;
    result.damage = calculatePhysicalDamage(attacker.atk * skillMultiplier, defender.def, false, 0.1, armorPen);
  } else {
    // Miss (defender dodged)
    result.miss = true;
    result.dodge = true;
  }

  return result;
}

/**
 * Resolve a magic attack (always hits, uses MATK vs MDEF)
 * @param {object} attacker - Attacker's combat stats
 * @param {object} defender - Defender's combat stats
 * @param {number} skillMultiplier - Skill damage multiplier
 * @returns {object} Attack result
 */
export function resolveMagicAttack(attacker, defender, skillMultiplier = 1.0) {
  // Magic always hits
  const damage = calculateMagicDamage(attacker.matk, defender.mdef, skillMultiplier);

  return {
    hit: true,
    miss: false,
    damage,
    isMagic: true
  };
}

// ============ PLAYER ATTACK TYPES ============

export const PLAYER_ATTACK_TYPES = {
  quick: {
    id: 'quick',
    name: '速攻',
    nameEn: 'Quick Attack',
    description: 'Fast attack with chance to stagger enemy',
    damageMultiplier: 0.7,
    canStagger: true,
    baseStaggerChance: 30, // Base 30% + AGI bonus
    exhaustChance: 0
  },
  normal: {
    id: 'normal',
    name: '攻撃',
    nameEn: 'Attack',
    description: 'Standard attack',
    damageMultiplier: 1.0,
    canStagger: false,
    exhaustChance: 0
  },
  heavy: {
    id: 'heavy',
    name: '強撃',
    nameEn: 'Heavy Attack',
    description: 'Powerful attack but may exhaust you',
    damageMultiplier: 2.0,
    canStagger: false,
    baseExhaustChance: 50 // Base 50% - AGI reduction
  }
};

/**
 * Calculate stagger chance for quick attack
 * Higher AGI = higher stagger chance
 */
export function calculateStaggerChance(playerAgi, enemyAgi) {
  const base = PLAYER_ATTACK_TYPES.quick.baseStaggerChance;
  const agiDiff = playerAgi - enemyAgi;
  // +2% per AGI advantage, -1% per AGI disadvantage
  const bonus = agiDiff > 0 ? agiDiff * 2 : agiDiff;
  return Math.max(5, Math.min(70, base + bonus)); // Clamp 5-70%
}

/**
 * Calculate exhaustion chance for heavy attack
 * Higher AGI = lower exhaustion chance
 */
export function calculateExhaustChance(playerAgi) {
  const base = PLAYER_ATTACK_TYPES.heavy.baseExhaustChance;
  // -2% per AGI point
  const reduction = playerAgi * 2;
  return Math.max(10, Math.min(80, base - reduction)); // Clamp 10-80%
}

// ============ TURN ORDER ============

/**
 * Determine who goes first based on AGI
 */
export function determineTurnOrder(player, enemy) {
  // AGI determines turn order
  // Tie-breaker: player goes first
  return player.stats.agi >= enemy.stats.agi ? 'player' : 'enemy';
}

// ============ COMBAT INFO FOR UI ============

/**
 * Get pre-attack info for UI display
 */
export function getAttackPreview(player, enemy) {
  const playerStats = getPlayerCombatStats(player);
  const enemyStats = getEnemyCombatStats(enemy);

  const hitChance = calculateHitChance(playerStats.hit, enemyStats.flee);
  const effectiveCrit = calculateEffectiveCrit(playerStats.crit, enemyStats.critShield);

  // Estimate damage range (without crit)
  const minDamage = Math.max(1, Math.floor((playerStats.atk - enemyStats.def) * 0.9));
  const maxDamage = Math.max(1, Math.floor((playerStats.atk - enemyStats.def) * 1.1));

  return {
    hitChance: Math.round(hitChance),
    critChance: Math.round(effectiveCrit * 10) / 10,
    estimatedDamage: { min: minDamage, max: maxDamage },
    enemyPerfectDodge: enemyStats.perfectDodge
  };
}

/**
 * Get enemy attack preview for UI
 */
export function getEnemyAttackPreview(player, enemy) {
  const playerStats = getPlayerCombatStats(player);
  const enemyStats = getEnemyCombatStats(enemy);

  const hitChance = calculateHitChance(enemyStats.hit, playerStats.flee);
  const effectiveCrit = calculateEffectiveCrit(enemyStats.crit, playerStats.critShield);

  return {
    hitChance: Math.round(hitChance),
    critChance: Math.round(effectiveCrit * 10) / 10,
    playerPerfectDodge: playerStats.perfectDodge
  };
}
