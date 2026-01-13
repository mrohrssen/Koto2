/**
 * Combat Rewards and Refinement System
 * Victory handling and equipment refinement
 */

import { getItem, calculateEquipmentBonuses, getRefinementCost, getBreakChance, REFINEMENT_CONFIG } from '../items.js';
import { getPlayerCombatStats, getEnemyCombatStats } from './mechanics.js';
import { applyDamageToEnemy } from './enemy.js';

// ============ VICTORY HANDLING ============

/**
 * Process combat victory rewards
 */
export function processVictory(player, enemy, run) {
  // Get equipment bonuses first for loot modifiers
  const equipBonuses = calculateEquipmentBonuses(player);

  // Calculate rewards with loot bonuses
  const baseXp = enemy.xpReward || 0;
  const baseGold = enemy.goldReward || 0;

  const rewards = {
    xp: Math.floor(baseXp * (1 + equipBonuses.xpGain)),
    gold: Math.floor(baseGold * (1 + equipBonuses.goldFind)),
    drops: [],
    onKillHp: 0,
    onKillSp: 0,
    // Track bonuses for display
    xpBonus: equipBonuses.xpGain > 0 ? Math.floor(baseXp * equipBonuses.xpGain) : 0,
    goldBonus: equipBonuses.goldFind > 0 ? Math.floor(baseGold * equipBonuses.goldFind) : 0
  };

  // Add XP
  player.xp += rewards.xp;

  // Add gold
  player.gold += rewards.gold;

  // Check drops (with dropRate bonus)
  if (enemy.drops) {
    for (const drop of enemy.drops) {
      const effectiveChance = Math.min(1, drop.chance * (1 + equipBonuses.dropRate));
      if (Math.random() < effectiveChance) {
        rewards.drops.push(drop.itemId);

        // Add to inventory
        const existing = player.items.find(i => i.id === drop.itemId);
        if (existing) {
          existing.quantity++;
        } else {
          player.items.push({ id: drop.itemId, quantity: 1 });
        }
      }
    }
  }

  // Apply on-kill effects from equipment
  if (equipBonuses.onKillHp > 0) {
    const hpBefore = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + equipBonuses.onKillHp);
    rewards.onKillHp = player.hp - hpBefore;
  }
  if (equipBonuses.onKillSp > 0) {
    const spBefore = player.sp;
    player.sp = Math.min(player.maxSp, player.sp + equipBonuses.onKillSp);
    rewards.onKillSp = player.sp - spBefore;
  }

  // Update run stats
  if (run) {
    run.stats.enemiesDefeated++;
    run.stats.goldEarned += rewards.gold;
    if (enemy.isBoss) {
      run.stats.bossesDefeated++;
    }
  }

  return rewards;
}

/**
 * Process boss victory (guaranteed drop)
 */
export function processBossVictory(player, enemy, floor, bossDrop, run) {
  const baseRewards = processVictory(player, enemy, run);

  // Add guaranteed boss drop
  if (bossDrop) {
    baseRewards.bossDrop = bossDrop;

    // Add to inventory
    const existing = player.items.find(i => i.id === bossDrop.itemId);
    if (existing) {
      existing.quantity++;
    } else {
      player.items.push({ id: bossDrop.itemId, quantity: 1 });
    }
  }

  return baseRewards;
}

// ============ REFINEMENT SYSTEM ============

/**
 * Attempt to refine (upgrade) an equipped item
 * @param {object} player - Player object with equipment and gold
 * @param {string} slot - Equipment slot: 'weapon', 'body', 'shield', 'accessory'
 * @param {number} floorBonus - Optional bonus from floor (higher floors = slightly better odds)
 * @returns {object} Result with success/failure info
 */
export function attemptRefinement(player, slot, floorBonus = 0) {
  const item = player.equipment?.[slot];
  if (!item) {
    return { error: 'No item equipped in this slot' };
  }

  const itemDef = getItem(item.id);
  if (!itemDef) {
    return { error: 'Unknown item' };
  }

  const currentLevel = item.refinement || 0;
  const targetLevel = currentLevel + 1;

  if (targetLevel > REFINEMENT_CONFIG.maxLevel) {
    return { error: 'Already at maximum refinement (+10)' };
  }

  const cost = getRefinementCost(itemDef, targetLevel);
  if (player.gold < cost) {
    return { error: 'Not enough gold', cost, goldNeeded: cost - player.gold };
  }

  const baseBreakChance = getBreakChance(itemDef, targetLevel);
  // Apply floor bonus to reduce break chance (max 14% reduction at floor 7)
  const adjustedBreakChance = Math.max(0, baseBreakChance - floorBonus);

  // Deduct gold
  player.gold -= cost;

  // Roll for success
  if (Math.random() < adjustedBreakChance) {
    // FAILED - Item destroyed (unless indestructible)
    const destroyedItem = { ...item };
    player.equipment[slot] = null;
    return {
      success: false,
      destroyed: true,
      itemName: itemDef.name,
      itemId: item.id,
      previousLevel: currentLevel,
      targetLevel,
      cost,
      breakChance: Math.round(adjustedBreakChance * 100)
    };
  }

  // SUCCESS - Upgrade the item
  item.refinement = targetLevel;
  return {
    success: true,
    destroyed: false,
    itemName: itemDef.name,
    itemId: item.id,
    previousLevel: currentLevel,
    newLevel: targetLevel,
    cost,
    breakChance: Math.round(adjustedBreakChance * 100)
  };
}

/**
 * Get refinement preview for an equipped item
 * @param {object} player - Player object
 * @param {string} slot - Equipment slot
 * @returns {object} Preview info with cost and break chance
 */
export function getRefinementPreview(player, slot) {
  const item = player.equipment?.[slot];
  if (!item) {
    return null;
  }

  const itemDef = getItem(item.id);
  if (!itemDef) {
    return null;
  }

  const currentLevel = item.refinement || 0;
  const targetLevel = currentLevel + 1;

  if (targetLevel > REFINEMENT_CONFIG.maxLevel) {
    return {
      itemId: item.id,
      itemName: itemDef.name,
      currentLevel,
      maxed: true
    };
  }

  const cost = getRefinementCost(itemDef, targetLevel);
  const breakChance = getBreakChance(itemDef, targetLevel);

  return {
    itemId: item.id,
    itemName: itemDef.name,
    currentLevel,
    targetLevel,
    cost,
    breakChance: Math.round(breakChance * 100),
    canAfford: player.gold >= cost,
    indestructible: itemDef.indestructible || false
  };
}

// ============ COUNTER-ATTACK SYSTEM ============

/**
 * Process counter-attack after player takes damage
 * @param {object} player - The player object
 * @param {object} enemy - The enemy object
 * @param {number} damageTaken - Amount of damage the player just took
 * @returns {object|null} Counter-attack result or null if no counter
 */
export function processCounterAttack(player, enemy, damageTaken) {
  // No counter if player didn't take damage or is dead
  if (damageTaken <= 0 || player.hp <= 0) {
    return null;
  }

  // Get player's counter-attack chance from equipment
  const equipBonuses = calculateEquipmentBonuses(player);
  const counterChance = equipBonuses.counterAttack || 0;

  if (counterChance <= 0) {
    return null;
  }

  // Roll for counter-attack
  if (Math.random() * 100 >= counterChance) {
    return null;
  }

  // Counter-attack triggered! Calculate damage
  const playerStats = getPlayerCombatStats(player);
  const enemyStats = getEnemyCombatStats(enemy);

  // Counter-attack deals 50% of normal attack damage
  const baseDamage = Math.max(1, playerStats.atk - enemyStats.def);
  const counterDamage = Math.floor(baseDamage * 0.5);

  // Apply damage to enemy
  const damageResult = applyDamageToEnemy(enemy, counterDamage);

  return {
    triggered: true,
    damage: damageResult.finalDamage,
    counterChance,
    enemyDefeated: damageResult.enemyDefeated
  };
}
