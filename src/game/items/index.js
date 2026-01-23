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
  PIPELINE_EFFECTS,
  getChip,
  getChipFromInventory,
  getChipsByCategory,
  getChipsByRarity,
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

export function getClassStartingEquipment(playerClass) {
  return { weapon: { id: 'defaultWeapon', equippedChips: [] } };
}

