/**
 * Player Actions
 * All player combat action execution
 */

import { getItem, getSkill, calculateEquipmentBonuses, processOnHitChips, processOnKillChips, processOnDamageChips, processOnCritChips, processOnStatusInflictChips, processSpecialOnHitChips, checkDiceRetrigger, getEquippedChips, executeChipPipeline, getWeaponPipelineChips } from '../items.js';
import { transformEnemy } from '../enemies.js';
import {
  STATUS_EFFECTS,
  applyStatusEffect,
  hasStatusEffect,
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
  const equipBonuses = calculateEquipmentBonuses(player);

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
    enemyDefeated: false,
    doubleStrike: false
  };

  // Resolve the attack (pass armor penetration from equipment)
  const attackResult = resolvePhysicalAttack(playerStats, enemyStats, attackDef.damageMultiplier, equipBonuses.armorPen);
  result.hits.push(attackResult);
  result.hitChance = attackResult.hitChance;
  result.critChance = attackResult.critChance;

  if (attackResult.hit) {
    result.anyHit = true;

    // Get weapon chips in slot order and execute pipeline
    const weaponChips = getWeaponPipelineChips(player);
    if (weaponChips.length > 0) {
      // Calculate weapon slot info for minimalist chip
      const weapon = player.equipment?.weapon;
      const weaponMaxSlots = weapon?.maxChipSlots || 5;
      const weaponUsedSlots = weapon?.equippedChips?.length || 0;
      
      const pipelineResult = executeChipPipeline(weaponChips, {
        baseDamage: attackResult.damage,
        isCrit: attackResult.critical,
        critChance: attackResult.critChance,
        target: enemy,
        combatStacks: player._combatStacks || {},  // Persistent during combat
        weaponMaxSlots,
        weaponUsedSlots,
        runKills: player._runKills || 0,  // Total kills this run for Bounty Hunter
        runChipsDestroyed: player._runChipsDestroyed || 0  // Chips sacrificed for Phoenix
      });
      
      // Update combat stacks for next attack
      player._combatStacks = pipelineResult.combatStacks;

      result.totalDamage = pipelineResult.finalDamage;
      result.pipelineResult = pipelineResult;  // For UI animation
    } else {
      result.totalDamage = attackResult.damage;
    }

    // Double Strike check - chance to deal 2x damage
    if (equipBonuses.doubleStrike > 0 && Math.random() * 100 < equipBonuses.doubleStrike) {
      result.doubleStrike = true;
      result.totalDamage *= 2;
    }

    // Bonus damage vs bosses
    if (enemy.isBoss && equipBonuses.vsBossDamage > 0) {
      const bonusDamage = Math.floor(result.totalDamage * equipBonuses.vsBossDamage);
      result.totalDamage += bonusDamage;
      result.vsBossDamage = bonusDamage;
    }

    // General damage bonus (from sets, etc.)
    if (equipBonuses.damageBonus > 0) {
      const bonusDamage = Math.floor(result.totalDamage * equipBonuses.damageBonus);
      result.totalDamage += bonusDamage;
      result.damageBonus = bonusDamage;
    }
  }
  if (attackResult.critical) {
    result.anyCritical = true;
    // Process on-crit chip effects
    const equippedChipsForCrit = getEquippedChips(player);
    if (equippedChipsForCrit.length > 0) {
      const critEffects = processOnCritChips(equippedChipsForCrit);
      let anyEffectTriggered = false;
      if (critEffects.heal > 0) {
        anyEffectTriggered = true;
        const playerStats = getPlayerCombatStats(player);
        const hpBefore = player.hp;
        player.hp = Math.min(playerStats.maxHp, player.hp + critEffects.heal);
        result.onCritHeal = player.hp - hpBefore;
      }
      if (critEffects.doubleCritDamage) {
        anyEffectTriggered = true;
        result.totalDamage *= 2;
        result.doubleCritDamage = true;
      }
      if (critEffects.bonusHit) {
        anyEffectTriggered = true;
        result.bonusHitFromCrit = true;
      }
      if (critEffects.buffs.length > 0) {
        anyEffectTriggered = true;
        result.onCritBuffs = critEffects.buffs;
      }
      // Dice chip: retrigger effects
      if (anyEffectTriggered && checkDiceRetrigger(equippedChipsForCrit)) {
        result.diceRetriggered = true;
        if (critEffects.heal > 0 && result.onCritHeal > 0) {
          const playerStats = getPlayerCombatStats(player);
          const hpBefore = player.hp;
          player.hp = Math.min(playerStats.maxHp, player.hp + critEffects.heal);
          result.onCritHeal += (player.hp - hpBefore);
        }
      }
    }
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

  // Process on-hit chip effects (only if we hit and dealt damage)
  const equippedChips = getEquippedChips(player);
  if (result.anyHit && result.totalDamage > 0 && !result.enemyDefeated && equippedChips.length > 0) {
    const chipEffects = processOnHitChips(equippedChips, enemy);
    if (chipEffects.length > 0) {
      result.chipEffects = [];
      for (const effect of chipEffects) {
        // Apply bonus damage from chip
        if (effect.bonusDamage > 0) {
          enemy.hp = Math.max(0, enemy.hp - effect.bonusDamage);
          result.totalDamage += effect.bonusDamage;
        }
        // Apply status effect from chip (force apply - chip already passed its proc chance)
        if (effect.status) {
          const applied = applyStatusEffect(enemy, effect.status, effect.duration, true);
          if (applied.applied) {
            result.chipEffects.push({
              chipName: effect.chipName,
              status: effect.status,
              duration: effect.duration,
              stacks: applied.stacks
            });

            // Check for max stack explosion (OVERHEATED at 5 stacks)
            if (applied.maxStacksReached && applied.explosionDamage) {
              const explosion = processMaxStackExplosion(enemy, effect.status);
              if (explosion.triggered) {
                result.chipEffects.push({
                  chipName: effect.chipName,
                  explosion: true,
                  explosionDamage: explosion.damage
                });
                result.totalDamage += explosion.damage;
                // Check if explosion defeated enemy
                if (explosion.targetDefeated) {
                  result.enemyDefeated = true;
                }
              }
            }
          }
        }
      }
      // Check if bonus damage defeated enemy
      result.enemyDefeated = enemy.hp <= 0;
    }

    // Process special on-hit chips (pepper, pachinkoBall)
    const specialOnHitEffects = processSpecialOnHitChips(equippedChips);

    // Pepper chip: enemyMissNextTurn - apply BUFFER_OVERFLOW to make enemy skip next turn
    if (specialOnHitEffects.enemyMissNextTurn && !result.enemyDefeated) {
      const applied = applyStatusEffect(enemy, 'bufferOverflow', 1, true);
      if (applied.applied) {
        result.enemyMissNextTurn = true;
        if (!result.chipEffects) result.chipEffects = [];
        result.chipEffects.push({
          chipName: 'コショウ', // Pepper
          special: 'enemyMissNextTurn',
          status: 'bufferOverflow'
        });
      }
    }

    // Cascade chip effect will be handled by the caller (needs to trigger additional attack)
    if (specialOnHitEffects.cascade) {
      result.cascadeTriggered = true;
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
