/**
 * Items Module - Re-export for backwards compatibility
 * All item definitions and functions are now in the items/ directory
 */

export {
  // Chip system
  CHIPS,
  CHIP_CATEGORIES,
  CHIP_RARITIES,
  getChip,
  getChipPrice,
  getChipDisplayInfo,
  generateShopChips,

  // Chip slot management
  getChipSlotCost,
  getEquippedChips,
  getUsedChipSlots,
  equipChip,
  unequipChip,
  getChipLoadout,

  // Pipeline execution
  PIPELINE_EFFECTS,
  executeChipPipeline,
  getWeaponPipelineChips,

  // Stub helpers (backwards compat)
  getItem,
  getSkill,
  getClassStartingEquipment,
  calculateEquipmentBonuses,
  hasRangedWeapon,

  // Refinement system
  REFINEMENT_CONFIG,
  getRefinementBonus,
  getRefinementCost,
  getBreakChance,
  getItemDisplayName
} from './items/index.js';
