/**
 * Player Actions
 * All player combat action execution
 */

import { getItem, getSkill, calculateEquipmentBonuses, processOnHitChips, processOnKillChips, processOnDamageChips, processOnCritChips, processOnHealChips, processOnStatusInflictChips, processSpecialOnHitChips, checkDiceRetrigger, getEquippedChips, executeChipPipeline, getWeaponPipelineChips } from '../items.js';
import {
  calculateFleeChance,
  calculateItemHealing,
  calculateDefendRecovery,
  calculateHpRegen,
  calculateSpRegen
} from '../stats.js';
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
  resolveMagicAttack,
  PLAYER_ATTACK_TYPES,
  calculateStaggerChance,
  calculateExhaustChance
} from './mechanics.js';

// ============ PLAYER ATTACK EXECUTION ============

/**
 * Execute player physical attack with attack type
 * @param {object} player - The player
 * @param {object} enemy - The enemy
 * @param {string} attackType - 'quick', 'normal', or 'heavy'
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
    staggered: false,
    playerExhausted: false,
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
      const pipelineResult = executeChipPipeline(weaponChips, {
        baseDamage: attackResult.damage,
        isCrit: attackResult.critical,
        critChance: attackResult.critChance,
        target: enemy
      });
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

  // Quick Attack: Check for stagger (applies STUN for 1 turn)
  if (attackType === 'quick' && attackResult.hit) {
    const staggerChance = calculateStaggerChance(player.stats.agi, enemy.stats.agi);
    result.staggerChance = staggerChance;
    if (Math.random() * 100 < staggerChance) {
      result.staggered = true;
      // Use the status effect system - force apply since we already passed the stagger check
      applyStatusEffect(enemy, 'stun', 1, true);
    }
  }

  // Heavy Attack: Check for exhaustion (applies STUN to self for 1 turn)
  if (attackType === 'heavy') {
    const exhaustChance = calculateExhaustChance(player.stats.agi);
    result.exhaustChance = exhaustChance;
    if (Math.random() * 100 < exhaustChance) {
      result.playerExhausted = true;
      // Use the status effect system - force apply since we already passed the exhaust check
      applyStatusEffect(player, 'stun', 1, true);
    }
  }

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

/**
 * Execute player magic
 */
export function executeMagic(player, enemy, skill) {
  // Check for SILENCE status - cannot use magic while silenced
  if (hasStatusEffect(player, 'silence')) {
    return { error: 'Silenced', silenced: true };
  }

  const playerStats = getPlayerCombatStats(player);
  const enemyStats = getEnemyCombatStats(enemy);
  const skillDef = getSkill(skill.id || skill);

  if (!skillDef) {
    return { error: 'Unknown skill' };
  }

  // Check SP
  if (player.sp < skillDef.spCost) {
    return { error: 'Not enough SP', required: skillDef.spCost, current: player.sp };
  }

  // Deduct SP
  player.sp -= skillDef.spCost;

  let result = {
    action: 'magic',
    skill: skillDef,
    spUsed: skillDef.spCost
  };

  if (skillDef.type === 'magic') {
    // Offensive magic
    const attackResult = resolveMagicAttack(playerStats, enemyStats, skillDef.power);
    result.hit = true;
    result.damage = attackResult.damage;
    result.element = skillDef.element;

    enemy.hp = Math.max(0, enemy.hp - attackResult.damage);
    result.enemyDefeated = enemy.hp <= 0;

    // Break damage-sensitive status effects (like SLEEP)
    if (attackResult.damage > 0) {
      const brokenEffects = breakDamageEffects(enemy);
      if (brokenEffects.length > 0) {
        result.wokenFromSleep = brokenEffects.some(e => e.id === 'sleep');
      }
    }

  } else if (skillDef.type === 'healing') {
    // Healing magic - scales with MATK + healing bonus from equipment
    const equipBonuses = calculateEquipmentBonuses(player);
    const baseHeal = skillDef.power + Math.floor(playerStats.matk * 0.5);
    let boostedHeal = Math.floor(baseHeal * (1 + equipBonuses.healingBonus));

    // Process on-heal chip effects
    const equippedChipsForHeal = getEquippedChips(player);
    if (equippedChipsForHeal.length > 0) {
      const healEffects = processOnHealChips(equippedChipsForHeal, boostedHeal);
      boostedHeal = healEffects.finalHeal;
      if (healEffects.bonusHeal > 0) {
        result.onHealBonus = healEffects.bonusHeal;
      }
      if (healEffects.buffs.length > 0) {
        result.onHealBuffs = healEffects.buffs;
      }
    }

    const healing = Math.min(boostedHeal, playerStats.maxHp - player.hp);
    player.hp = Math.min(playerStats.maxHp, player.hp + boostedHeal);
    result.healing = healing;

  } else if (skillDef.type === 'buff') {
    // Buff magic
    player.statuses.push({
      id: skillDef.id,
      effect: skillDef.effect,
      amount: skillDef.amount,
      turnsRemaining: skillDef.turns
    });
    result.buff = {
      stat: skillDef.effect,
      amount: skillDef.amount,
      turns: skillDef.turns
    };
  }

  return result;
}

/**
 * Execute defend action
 * Reduces incoming damage and recovers some HP/SP
 */
export function executeDefend(player) {
  const playerStats = getPlayerCombatStats(player);
  const equipBonuses = calculateEquipmentBonuses(player);

  // Calculate recovery amounts with healing bonus
  const baseRecovery = calculateDefendRecovery(
    playerStats.maxHp,
    playerStats.maxSp,
    player.stats.vit,
    player.stats.int
  );

  // Apply healing bonus to recovery
  const boostedHpRecovery = Math.floor(baseRecovery.hpRecovery * (1 + equipBonuses.healingBonus));
  const boostedSpRecovery = Math.floor(baseRecovery.spRecovery * (1 + equipBonuses.healingBonus));

  // Apply recovery
  const hpHealed = Math.min(boostedHpRecovery, playerStats.maxHp - player.hp);
  const spRecovered = Math.min(boostedSpRecovery, playerStats.maxSp - player.sp);

  player.hp = Math.min(playerStats.maxHp, player.hp + boostedHpRecovery);
  player.sp = Math.min(playerStats.maxSp, player.sp + boostedSpRecovery);

  // Add defending status (50% damage reduction until next turn)
  player.statuses.push({
    id: 'defending',
    effect: 'damageReduction',
    amount: 0.5,
    turnsRemaining: 1
  });

  return {
    action: 'defend',
    hpRecovered: hpHealed,
    spRecovered: spRecovered,
    defenseBoost: true
  };
}

/**
 * Execute item use
 */
export function executeItem(player, enemy, itemId) {
  const playerStats = getPlayerCombatStats(player);
  const itemDef = getItem(itemId);

  if (!itemDef) {
    return { error: 'Unknown item' };
  }

  // Find item in inventory
  const invItem = player.items.find(i => i.id === itemId);
  if (!invItem || invItem.quantity <= 0) {
    return { error: 'Item not in inventory' };
  }

  // Use item
  invItem.quantity--;
  if (invItem.quantity <= 0) {
    player.items = player.items.filter(i => i.id !== itemId);
  }

  let result = {
    action: 'item',
    item: itemDef
  };

  switch (itemDef.effect) {
    case 'heal': {
      // HP items scale with VIT (2% per point) + healing bonus from equipment
      const equipBonuses = calculateEquipmentBonuses(player);
      const baseHealing = calculateItemHealing(itemDef.power, player.stats.vit, true);
      let healing = Math.floor(baseHealing * (1 + equipBonuses.healingBonus));

      // Process on-heal chip effects
      const equippedChipsForItemHeal = getEquippedChips(player);
      if (equippedChipsForItemHeal.length > 0) {
        const healEffects = processOnHealChips(equippedChipsForItemHeal, healing);
        healing = healEffects.finalHeal;
        if (healEffects.bonusHeal > 0) {
          result.onHealBonus = healEffects.bonusHeal;
        }
        if (healEffects.buffs.length > 0) {
          result.onHealBuffs = healEffects.buffs;
        }
      }

      const actualHealing = Math.min(healing, playerStats.maxHp - player.hp);
      player.hp = Math.min(playerStats.maxHp, player.hp + healing);
      result.healing = actualHealing;
      break;
    }

    case 'fullHeal': {
      const fullHealAmount = playerStats.maxHp - player.hp;
      player.hp = playerStats.maxHp;
      result.healing = fullHealAmount;
      break;
    }

    case 'restoreSp': {
      // SP items scale with INT (1% per point) + healing bonus from equipment
      const equipBonuses = calculateEquipmentBonuses(player);
      const baseSpRestore = calculateItemHealing(itemDef.power, player.stats.int, false);
      const spRestore = Math.floor(baseSpRestore * (1 + equipBonuses.healingBonus));
      const actualRestore = Math.min(spRestore, playerStats.maxSp - player.sp);
      player.sp = Math.min(playerStats.maxSp, player.sp + spRestore);
      result.spRestored = actualRestore;
      break;
    }

    case 'fullRestore': {
      const hpRestored = playerStats.maxHp - player.hp;
      const spRestored = playerStats.maxSp - player.sp;
      player.hp = playerStats.maxHp;
      player.sp = playerStats.maxSp;
      result.healing = hpRestored;
      result.spRestored = spRestored;
      break;
    }

    case 'cure':
      player.statuses = player.statuses.filter(s => !itemDef.cures.includes(s.id));
      result.cured = itemDef.cures;
      break;

    case 'flee':
      result.flee = true;
      result.fleeSuccess = true;
      break;

    case 'damage': {
      // Damage items use magic damage formula
      const enemyStats = getEnemyCombatStats(enemy);
      const attackResult = resolveMagicAttack({ matk: itemDef.power }, enemyStats, 1.0);
      enemy.hp = Math.max(0, enemy.hp - attackResult.damage);
      result.damage = attackResult.damage;
      result.element = itemDef.element;
      result.enemyDefeated = enemy.hp <= 0;
      break;
    }
  }

  return result;
}

/**
 * Attempt to flee from combat (AGI-based)
 * If player has grantsTeleport from equipment, they always succeed
 */
export function attemptFlee(player, enemy) {
  // Check for teleport ability from equipment
  const equipBonuses = calculateEquipmentBonuses(player);
  if (equipBonuses.grantsTeleport) {
    return {
      action: 'flee',
      success: true,
      teleport: true,
      chance: 100
    };
  }

  const fleeChance = calculateFleeChance(player.stats.agi, enemy.stats.agi);
  const roll = Math.random() * 100;
  const success = roll < fleeChance;

  return {
    action: 'flee',
    success,
    chance: Math.round(fleeChance)
  };
}

/**
 * Check if player has teleport ability from equipment
 */
export function hasTeleportAbility(player) {
  const equipBonuses = calculateEquipmentBonuses(player);
  return equipBonuses.grantsTeleport === true;
}

/**
 * Apply passive HP/SP regeneration (at start of turn)
 */
export function applyPassiveRegen(player) {
  const hpRegen = calculateHpRegen(player.stats.vit);
  const spRegen = calculateSpRegen(player.stats.int);

  const hpHealed = Math.min(hpRegen, player.maxHp - player.hp);
  const spRecovered = Math.min(spRegen, player.maxSp - player.sp);

  player.hp = Math.min(player.maxHp, player.hp + hpRegen);
  player.sp = Math.min(player.maxSp, player.sp + spRegen);

  return { hpRegen: hpHealed, spRegen: spRecovered };
}
