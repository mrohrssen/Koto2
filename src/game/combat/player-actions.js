/**
 * Player Actions
 * All player combat action execution
 */

import { getItem, executeChipPipeline, getWeaponPipelineChips } from '../items.js';
import { transformEnemy } from '../enemies.js';
import {
  STATUS_EFFECTS,
  applyStatusEffect,
  breakDamageEffects,
  processMaxStackExplosion
} from './status-effects.js';
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

    // Get weapon chips in slot order and execute pipeline
    const weaponChips = getWeaponPipelineChips(player);
    if (weaponChips.length > 0) {
      const weapon = player.equipment?.weapon;
      const weaponMaxSlots = 5;
      const weaponUsedSlots = weapon?.equippedChips?.length || 0;

      const pipelineResult = executeChipPipeline(weaponChips, {
        baseDamage: attackResult.damage,
        isCrit: attackResult.critical,
        critChance: attackResult.critChance,
        target: enemy,
        combatStacks: player._combatStacks || {},
        weaponMaxSlots,
        weaponUsedSlots,
        runKills: player._runKills || 0,
        runChipsDestroyed: player._runChipsDestroyed || 0
      });

      player._combatStacks = pipelineResult.combatStacks;
      result.totalDamage = pipelineResult.finalDamage;
      result.pipelineResult = pipelineResult;
    } else {
      result.totalDamage = attackResult.damage;
    }
  }
  if (attackResult.critical) {
    result.anyCritical = true;
  }
  if (attackResult.dodge) result.anyDodge = true;
  if (attackResult.perfectDodge) result.anyPerfectDodge = true;

  // Apply damage to enemy
  enemy.hp = Math.max(0, enemy.hp - result.totalDamage);
  result.enemyDefeated = enemy.hp <= 0;

  // Break damage-sensitive status effects (like SLEEP)
  if (result.totalDamage > 0) {
    const brokenEffects = breakDamageEffects(enemy);
    if (brokenEffects.length > 0) {
      result.wokenFromSleep = brokenEffects.some(e => e.id === 'sleep');
    }
  }

  // Check for status infliction from weapon (only if we hit and dealt damage)
  if (result.anyHit && result.totalDamage > 0 && !result.enemyDefeated) {
    const weapon = player.equipment?.weapon;
    if (weapon) {
      const weaponDef = getItem(weapon.id || weapon) || (typeof weapon === 'object' ? weapon : null);
      if (weaponDef?.statusInflict) {
        const { status, chance, duration } = weaponDef.statusInflict;
        // Apply statusInflictBonus from equipment (e.g., set bonuses)
        const effectiveChance = chance * (1 + (equipBonuses.statusInflictBonus || 0));
        if (Math.random() * 100 < effectiveChance) {
          const statusDef = STATUS_EFFECTS[status.toUpperCase()];
          const statusDuration = duration || statusDef?.duration || 2;
          const applied = applyStatusEffect(enemy, status, statusDuration);
          if (applied.applied) {
            result.statusInflicted = { status, duration: statusDuration, stacks: applied.stacks };

            // Check for max stack explosion (OVERHEATED at 5 stacks)
            if (applied.maxStacksReached && applied.explosionDamage) {
              const explosion = processMaxStackExplosion(enemy, status);
              if (explosion.triggered) {
                result.statusExplosion = {
                  status: status,
                  damage: explosion.damage
                };
                result.totalDamage += explosion.damage;
                if (explosion.targetDefeated) {
                  result.enemyDefeated = true;
                }
              }
            }
          }
        }
      }
    }
  }

  // Check for transform effect from weapon (e.g., Azoth)
  // Only on hit, enemy not defeated, and non-bosses
  if (result.anyHit && result.totalDamage > 0 && !result.enemyDefeated) {
    const weapon = player.equipment?.weapon;
    if (weapon) {
      const weaponDef = getItem(weapon.id || weapon) || (typeof weapon === 'object' ? weapon : null);
      if (weaponDef?.transform) {
        const { chance, targetTier } = weaponDef.transform;
        if (Math.random() * 100 < chance) {
          const transformed = transformEnemy(enemy, targetTier || 1);
          if (transformed) {
            result.transformed = {
              from: enemy.name,
              to: transformed.name,
              newEnemy: transformed
            };
          }
        }
      }
    }
  }

  return result;
}

/**
 * Execute player physical attack (legacy - uses normal attack)
 */
export function executeAttack(player, enemy, skill = null) {
  const playerStats = getPlayerCombatStats(player);
  const enemyStats = getEnemyCombatStats(enemy);
  const skillDef = skill ? getSkill(skill.id || skill) : getSkill('strike');
  const equipBonuses = calculateEquipmentBonuses(player);

  let result = {
    action: 'attack',
    skill: skillDef,
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

  const numHits = skillDef.hits || 1;
  const skillPower = skillDef.power || 1.0;

  for (let i = 0; i < numHits; i++) {
    const attackResult = resolvePhysicalAttack(playerStats, enemyStats, skillPower, equipBonuses.armorPen);

    result.hits.push(attackResult);
    result.hitChance = attackResult.hitChance;
    result.critChance = attackResult.critChance;

    if (attackResult.hit) {
      result.anyHit = true;
      result.totalDamage += attackResult.damage;
    }
    if (attackResult.critical) result.anyCritical = true;
    if (attackResult.dodge) result.anyDodge = true;
    if (attackResult.perfectDodge) result.anyPerfectDodge = true;
  }

  // Apply damage to enemy
  enemy.hp = Math.max(0, enemy.hp - result.totalDamage);
  result.enemyDefeated = enemy.hp <= 0;

  return result;
}
