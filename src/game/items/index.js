/**
 * Items Module - Main Entry Point
 * Re-exports all item definitions and utility functions
 */

// Import all item collections
import { CONSUMABLES, STAT_CRYSTALS } from './consumables.js';
import { WEAPONS, ARMOR, SHIELDS, ACCESSORIES } from './equipment.js';
import { SKILLS } from './skills.js';

// Re-export item collections
export { CONSUMABLES, STAT_CRYSTALS } from './consumables.js';
export { WEAPONS, ARMOR, SHIELDS, ACCESSORIES } from './equipment.js';
export { SKILLS } from './skills.js';

// ============ HELPER FUNCTIONS ============

export function getItem(itemId) {
  return CONSUMABLES[itemId] || STAT_CRYSTALS[itemId] || WEAPONS[itemId] || ARMOR[itemId] || SHIELDS[itemId] || ACCESSORIES[itemId] || null;
}

export function getSkill(skillId) {
  return SKILLS[skillId] || null;
}

export function getAllItems() {
  return {
    ...CONSUMABLES,
    ...WEAPONS,
    ...ARMOR,
    ...SHIELDS,
    ...ACCESSORIES
  };
}

export function getItemsByType(type) {
  switch (type) {
    case 'consumable': return CONSUMABLES;
    case 'weapon': return WEAPONS;
    case 'armor': return ARMOR;
    case 'shield': return SHIELDS;
    case 'accessory': return ACCESSORIES;
    default: return {};
  }
}

// ============ REFINEMENT SYSTEM ============
// Ragnarok Online-style equipment upgrading with break chance

export const REFINEMENT_CONFIG = {
  maxLevel: 10,
  bonusPerLevel: 0.05,  // 5% per level
  rarityMultipliers: {
    common: 1,
    uncommon: 1.2,
    rare: 1.5,
    epic: 2,
    legendary: 3
  },
  levels: {
    1:  { breakChance: 0,    cost: 50 },
    2:  { breakChance: 0,    cost: 75 },
    3:  { breakChance: 0,    cost: 100 },
    4:  { breakChance: 0.10, cost: 150 },
    5:  { breakChance: 0.15, cost: 200 },
    6:  { breakChance: 0.20, cost: 300 },
    7:  { breakChance: 0.30, cost: 500 },
    8:  { breakChance: 0.40, cost: 800 },
    9:  { breakChance: 0.50, cost: 1200 },
    10: { breakChance: 0.60, cost: 2000 }
  }
};

/**
 * Get the stat multiplier for a refined item
 * @param {object} item - Equipment item with optional refinement property
 * @returns {number} Multiplier (1.0 for +0, 1.5 for +10)
 */
export function getRefinementBonus(item) {
  const level = item?.refinement || 0;
  return 1 + (level * REFINEMENT_CONFIG.bonusPerLevel);
}

/**
 * Get the gold cost to refine an item to the next level
 * @param {object} itemDef - Item definition from getItem()
 * @param {number} targetLevel - The level we're refining TO (1-10)
 * @returns {number} Gold cost
 */
export function getRefinementCost(itemDef, targetLevel) {
  if (targetLevel < 1 || targetLevel > 10) return Infinity;

  const baseCost = REFINEMENT_CONFIG.levels[targetLevel].cost;
  const rarityMult = REFINEMENT_CONFIG.rarityMultipliers[itemDef?.rarity] || 1;

  return Math.floor(baseCost * rarityMult);
}

/**
 * Get the chance of item breaking during refinement
 * @param {object} itemDef - Item definition from getItem()
 * @param {number} targetLevel - The level we're refining TO (1-10)
 * @returns {number} Break chance (0-1)
 */
export function getBreakChance(itemDef, targetLevel) {
  // Indestructible items (legendary) never break
  if (itemDef?.indestructible) return 0;

  if (targetLevel < 1 || targetLevel > 10) return 1;

  return REFINEMENT_CONFIG.levels[targetLevel].breakChance;
}

/**
 * Get display name for an item including refinement level
 * @param {object} item - Equipment item { id, refinement? }
 * @returns {string} Display name like "エクスカリバー +5"
 */
export function getItemDisplayName(item) {
  if (!item) return '';

  const itemDef = getItem(item.id || item);
  const baseName = itemDef?.name || item.id || 'Unknown';
  const level = item.refinement || 0;

  return level > 0 ? `${baseName} +${level}` : baseName;
}

// Import and re-export set bonuses
export { ITEM_SETS, getEquippedSetBonuses } from './sets.js';
import { getEquippedSetBonuses } from './sets.js';

/**
 * Calculate equipment stat bonuses for derived stat calculation
 * Returns bonuses in the format expected by calculateDerivedStats
 * @param {object} player - Player object with equipment
 * @returns {object} Equipment bonuses for stats.js functions
 */
export function calculateEquipmentBonuses(player) {
  const bonuses = {
    // Primary stat bonuses
    str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0,
    // Derived stat bonuses (direct additions to calculated values)
    atk: 0, def: 0, matk: 0, mdef: 0, hit: 0, flee: 0, crit: 0, perfectDodge: 0,
    // Resource bonuses
    maxHp: 0, maxSp: 0,
    // Combat effect bonuses
    doubleStrike: 0, armorPen: 0, damageBonus: 0, vsBossDamage: 0, damageReduction: 0,
    // On-kill effects
    onKillHp: 0, onKillSp: 0,
    // Healing bonuses
    healingBonus: 0,
    // Status effect bonuses
    statusInflictBonus: 0, statusImmune: [],
    // Loot bonuses
    goldFind: 0, dropRate: 0, xpGain: 0,
    // Special abilities
    grantsTeleport: false,
    // Counter-attack
    counterAttack: 0
  };

  // Check each equipment slot
  for (const slot of ['weapon', 'body', 'shield', 'accessory']) {
    const equipped = player.equipment?.[slot];
    if (!equipped) continue;

    const itemDef = getItem(equipped.id || equipped) || (typeof equipped === 'object' ? equipped : null);
    if (!itemDef) continue;

    const refineMult = getRefinementBonus(equipped);
    const refinableStats = ['atk', 'def', 'matk', 'mdef'];

    for (const stat of Object.keys(bonuses)) {
      if (stat === 'statusImmune') {
        if (itemDef.statusImmune) {
          bonuses.statusImmune = [...bonuses.statusImmune, ...itemDef.statusImmune];
        }
      } else if (stat === 'grantsTeleport') {
        if (itemDef.grantsTeleport) bonuses.grantsTeleport = true;
      } else if (itemDef[stat]) {
        if (refinableStats.includes(stat)) {
          bonuses[stat] += Math.floor(itemDef[stat] * refineMult);
        } else {
          bonuses[stat] += itemDef[stat];
        }
      }
    }
  }

  // Add set bonuses
  const setBonuses = getEquippedSetBonuses(player);
  for (const [stat, value] of Object.entries(setBonuses)) {
    if (stat === 'statusImmune') {
      bonuses.statusImmune = [...bonuses.statusImmune, ...value];
    } else if (typeof value === 'number') {
      bonuses[stat] = (bonuses[stat] || 0) + value;
    }
  }

  // Add passive bonuses from inventory items (like stat crystals)
  if (player.items) {
    for (const invItem of player.items) {
      const itemDef = getItem(invItem.id);
      if (itemDef?.passive) {
        const qty = invItem.quantity || 1;
        for (const [stat, value] of Object.entries(itemDef.passive)) {
          if (typeof value === 'number' && bonuses.hasOwnProperty(stat)) {
            bonuses[stat] += value * qty;
          }
        }
      }
    }
  }

  return bonuses;
}

/**
 * Check if player has a ranged weapon equipped
 */
export function hasRangedWeapon(player) {
  const weapon = player.equipment?.weapon;
  if (!weapon) return false;
  const weaponDef = getItem(weapon.id || weapon);
  return weaponDef?.isRanged || false;
}
