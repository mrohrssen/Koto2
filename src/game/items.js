/**
 * Items Module - Re-export for backwards compatibility
 * All item definitions and functions are now in the items/ directory
 */

export {
  // Item collections
  CONSUMABLES,
  WEAPONS,
  ARMOR,
  SHIELDS,
  ACCESSORIES,
  SKILLS,

  // Hacker class equipment (NEO TOKYO)
  HACKER_EQUIPMENT,
  getClassStartingEquipment,

  // Chip system (NEO TOKYO augmentations)
  CHIPS,
  CHIP_CATEGORIES,
  CHIP_RARITIES,
  getChip,
  getChipPrice,
  calculateChipStatBonuses,
  processOnHitChips,
  processOnKillChips,
  processOnDamageChips,
  updateCounterStacks,
  calculateCounterBonuses,
  getChipDisplayInfo,
  generateShopChips,

  // Chip slot management
  getChipSlotCost,
  getEquippedChips,
  getUsedChipSlots,
  equipChip,
  unequipChip,
  calculateEquippedChipBonuses,
  getChipLoadout,

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
