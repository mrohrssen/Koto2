/**
 * Items Module - Main Entry Point
 * Re-exports the chip system (the only active item system)
 * and provides stub functions for backwards compatibility.
 */

// Re-export chip system
export {
  CHIPS,
  CHIP_CATEGORIES,
  CHIP_RARITIES,
  CHIP_UPGRADE_CONFIG,
  PIPELINE_EFFECTS,
  getChip,
  getChipFromInventory,
  getChipsByCategory,
  getChipsByRarity,
  getChipPrice,
  getChipDisplayInfo,
  generateShopChips,
  // Chip upgrade functions
  getNextRarity,
  getUpgradeCost,
  getUpgradeFailureChance,
  createUpgradedChip,
  attemptChipUpgrade,
  // Chip slot management
  getChipSlotCost,
  getEquippedChips,
  getUsedChipSlots,
  equipChip,
  unequipChip,
  getChipLoadout,
  // Pipeline execution
  executeChipPipeline,
  getWeaponPipelineChips
} from './chips.js';

import { CHIPS } from './chips.js';

// ============ STUB FUNCTIONS ============
// Kept for backwards compatibility with consumers that still import them.
// These return safe defaults since the underlying data (equipment, skills, etc.) has been removed.

export function getItem(itemId) {
  return CHIPS[itemId] || null;
}

export function getSkill(skillId) {
  return null;
}

export function getClassStartingEquipment(playerClass) {
  return { weapon: { id: 'defaultWeapon', equippedChips: [] } };
}

export function calculateEquipmentBonuses(player) {
  return {
    str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0,
    atk: 0, def: 0, matk: 0, mdef: 0, hit: 0, flee: 0, crit: 0, perfectDodge: 0,
    maxHp: 0, maxSp: 0,
    doubleStrike: 0, armorPen: 0, damageBonus: 0, vsBossDamage: 0, damageReduction: 0,
    onKillHp: 0, onKillSp: 0,
    healingBonus: 0,
    statusInflictBonus: 0, statusImmune: [],
    goldFind: 0, dropRate: 0, xpGain: 0,
    grantsTeleport: false,
    counterAttack: 0
  };
}

export function hasRangedWeapon(player) {
  return false;
}

// ============ REFINEMENT SYSTEM ============

export const REFINEMENT_CONFIG = {
  maxLevel: 10,
  bonusPerLevel: 0.05,
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

export function getRefinementBonus(item) {
  const level = item?.refinement || 0;
  return 1 + (level * REFINEMENT_CONFIG.bonusPerLevel);
}

export function getRefinementCost(itemDef, targetLevel) {
  if (targetLevel < 1 || targetLevel > 10) return Infinity;
  const baseCost = REFINEMENT_CONFIG.levels[targetLevel].cost;
  const rarityMult = REFINEMENT_CONFIG.rarityMultipliers[itemDef?.rarity] || 1;
  return Math.floor(baseCost * rarityMult);
}

export function getBreakChance(itemDef, targetLevel) {
  if (itemDef?.indestructible) return 0;
  if (targetLevel < 1 || targetLevel > 10) return 1;
  return REFINEMENT_CONFIG.levels[targetLevel].breakChance;
}

export function getItemDisplayName(item) {
  if (!item) return '';
  const itemDef = getItem(item.id || item);
  const baseName = itemDef?.name || item.id || 'Unknown';
  const level = item.refinement || 0;
  return level > 0 ? `${baseName} +${level}` : baseName;
}
