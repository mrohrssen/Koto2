/**
 * Items Module - Re-export for backwards compatibility
 * All item definitions and functions are now in the items/ directory
 */

export {
  // Item collections
  CONSUMABLES,
  STAT_CRYSTALS,
  WEAPONS,
  ARMOR,
  SHIELDS,
  ACCESSORIES,
  SKILLS,

  // Helper functions
  getItem,
  getSkill,
  getAllItems,
  getItemsByType,

  // Refinement system
  REFINEMENT_CONFIG,
  getRefinementBonus,
  getRefinementCost,
  getBreakChance,
  getItemDisplayName,

  // Set bonuses
  ITEM_SETS,
  getEquippedSetBonuses,
  calculateEquipmentBonuses,
  hasRangedWeapon
} from './items/index.js';
