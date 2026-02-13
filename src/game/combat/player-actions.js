/**
 * Player Actions
 * All player combat action execution
 */

import {
  getPlayerCombatStats,
  getEnemyCombatStats,
  resolvePhysicalAttack,
  PLAYER_ATTACK_TYPES
} from './mechanics.js';

// ============ PLAYER ATTACK EXECUTION ============

/**
 * Execute player physical attack
 * @param {object} player - The player
 * @param {object} enemy - The enemy
 * @param {string} attackType - Attack type (only 'normal' supported)
 */
export function executePlayerAttack(player, enemy, attackType = 'normal') {
  const playerStats = getPlayerCombatStats(player);
  const enemyStats = getEnemyCombatStats(enemy);
  const attackDef = PLAYER_ATTACK_TYPES[attackType] || PLAYER_ATTACK_TYPES.normal;

  let result = {
    action: 'attack',
    attackType: attackDef,
    hits: [],
    totalDamage: 0,
    anyHit: false,
    anyCritical: false,
    anyDodge: false,
    anyPerfectDodge: false,
    hitChance: 0,
    critChance: 0,
    enemyDefeated: false
  };

  const attackResult = resolvePhysicalAttack(playerStats, enemyStats, attackDef.damageMultiplier);
  result.hits.push(attackResult);
  result.hitChance = attackResult.hitChance;
  result.critChance = attackResult.critChance;

  if (attackResult.hit) {
    result.anyHit = true;
    result.totalDamage = attackResult.damage;
  }
  if (attackResult.critical) {
    result.anyCritical = true;
  }
  if (attackResult.dodge) result.anyDodge = true;
  if (attackResult.perfectDodge) result.anyPerfectDodge = true;

  // Apply damage to enemy
  enemy.hp = Math.max(0, enemy.hp - result.totalDamage);
  result.enemyDefeated = enemy.hp <= 0;

  return result;
}

