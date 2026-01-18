/**
 * Combat Mechanics - SIMPLIFIED
 *
 * Simplified combat with only attack and maxHp.
 * Damage = attack * random(0.85, 1.15)
 * No hit/miss, no crits, no defense.
 *
 * See combat/mechanics.full.js for the original iRO-style system (if preserved).
 */

import { calculateEquipmentBonuses } from '../items.js';
import {
  calculateDerivedStats,
  calculateHitChance,
  calculateEffectiveCrit,
  calculatePhysicalDamage,
  calculateMagicDamage
} from '../stats.js';

// ============ COMBAT STATS HELPERS (SIMPLIFIED) ============

/**
 * Get player's combat stats - SIMPLIFIED
 * Only attack and maxHp matter now
 */
export function getPlayerCombatStats(player) {
  return {
    hp: player.hp,
    maxHp: player.maxHp,
    sp: player.sp || 0,
    maxSp: player.maxSp || 0,
    atk: player.attack || 10,  // Use simplified attack stat
    // Stub out old stats for compatibility
    def: 0,
    matk: player.attack || 10,
    mdef: 0,
    hit: 100,
    flee: 0,
    crit: 0,
    critShield: 0,
    perfectDodge: 0
  };
}

/**
 * Get enemy's combat stats - SIMPLIFIED
 */
export function getEnemyCombatStats(enemy) {
  return {
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    sp: enemy.sp || 0,
    maxSp: enemy.maxSp || 0,
    atk: enemy.attack || enemy.atk || 10,  // Use simplified attack stat
    // Stub out old stats for compatibility
    def: 0,
    matk: enemy.attack || enemy.atk || 10,
    mdef: 0,
    hit: 100,
    flee: 0,
    crit: 0,
    critShield: 0,
    perfectDodge: 0
  };
}

// ============ ATTACK RESOLUTION (SIMPLIFIED) ============

/**
 * Resolve a physical attack - SIMPLIFIED
 * Always hits, damage = attack * random(0.85, 1.15)
 * No hit/miss, no crits, no defense
 */
export function resolvePhysicalAttack(attacker, defender, skillMultiplier = 1.0, armorPen = 0) {
  // Simplified: always hits, damage = atk * variance
  const variance = 0.85 + Math.random() * 0.30;  // 0.85 to 1.15
  const damage = Math.max(1, Math.floor(attacker.atk * skillMultiplier * variance));

  return {
    hit: true,
    miss: false,
    dodge: false,
    perfectDodge: false,
    critical: false,
    damage,
    hitChance: 100,
    critChance: 0
  };
}

/**
 * Resolve a magic attack - SIMPLIFIED
 * Uses same logic as physical (atk with variance)
 */
export function resolveMagicAttack(attacker, defender, skillMultiplier = 1.0) {
  // Simplified: use atk (or matk if available) with variance
  const baseAtk = attacker.matk || attacker.atk || 10;
  const variance = 0.85 + Math.random() * 0.30;
  const damage = Math.max(1, Math.floor(baseAtk * skillMultiplier * variance));

  return {
    hit: true,
    miss: false,
    damage,
    isMagic: true
  };
}

// ============ PLAYER ATTACK TYPES ============

export const PLAYER_ATTACK_TYPES = {
  normal: {
    id: 'normal',
    name: '攻撃',
    nameEn: 'Attack',
    description: 'Standard attack',
    damageMultiplier: 1.0
  }
};

// ============ TURN ORDER (SIMPLIFIED) ============

/**
 * Determine who goes first - SIMPLIFIED
 * Player always goes first
 */
export function determineTurnOrder(player, enemy) {
  return 'player';  // Player always goes first
}

// ============ COMBAT INFO FOR UI (SIMPLIFIED) ============

/**
 * Get pre-attack info for UI display - SIMPLIFIED
 */
export function getAttackPreview(player, enemy) {
  const playerStats = getPlayerCombatStats(player);

  // Damage range with ±15% variance
  const baseAtk = playerStats.atk;
  const minDamage = Math.max(1, Math.floor(baseAtk * 0.85));
  const maxDamage = Math.max(1, Math.floor(baseAtk * 1.15));

  return {
    hitChance: 100,  // Always hits
    critChance: 0,   // No crits
    estimatedDamage: { min: minDamage, max: maxDamage },
    enemyPerfectDodge: 0
  };
}

/**
 * Get enemy attack preview for UI - SIMPLIFIED
 */
export function getEnemyAttackPreview(player, enemy) {
  const enemyStats = getEnemyCombatStats(enemy);

  const minDamage = Math.max(1, Math.floor(enemyStats.atk * 0.85));
  const maxDamage = Math.max(1, Math.floor(enemyStats.atk * 1.15));

  return {
    hitChance: 100,
    critChance: 0,
    estimatedDamage: { min: minDamage, max: maxDamage },
    playerPerfectDodge: 0
  };
}
