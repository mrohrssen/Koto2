/**
 * @fileoverview Chip equipment system - pipeline damage modifiers
 * @module src/game/items/chips
 *
 * PURPOSE:
 * Implements the chip system where players collect and equip chips to their
 * weapon. Chips modify damage through a sequential pipeline - each chip fires
 * in slot order, transforming the damage value before it hits the enemy.
 * This creates Balatro-style synergies where chip ORDER matters.
 *
 * KEY EXPORTS:
 * Constants:
 * - CHIP_CATEGORIES - Pipeline category definition
 * - CHIP_RARITIES - Common through Legendary with multipliers
 * - PIPELINE_EFFECTS - Effect types (flatAdd, multiply, conditional, critMod)
 * - CHIPS - All chip definitions loaded from data/chips.json
 *
 * Functions:
 * - getChip(chipId) - Get chip definition by ID
 * - getChipsByCategory(category) - Filter chips by category
 * - getChipsByRarity(rarity) - Filter chips by rarity
 * - getChipPrice(chipId) - Calculate chip purchase price
 * - generateShopChips(floor, owned, count) - Generate shop inventory
 * - executeChipPipeline(chips, context) - Run the damage pipeline
 * - getWeaponPipelineChips(player) - Get chips equipped to weapon in order
 * - equipChip(player, slot, chipId) - Equip chip to equipment slot
 * - unequipChip(player, slot, chipId) - Unequip chip from slot
 * - getChipDisplayInfo(chip) - Get UI display information
 * - getChipLoadout(player) - Get full loadout for UI
 *
 * Upgrade Functions:
 * - getNextRarity(rarity) - Get next rarity tier
 * - getUpgradeCost(chip) - Cost to upgrade
 * - getUpgradeFailureChance(chip) - Failure chance for upgrade
 * - attemptChipUpgrade(chip) - Roll for upgrade success
 * - createUpgradedChip(chip, newRarity) - Create upgraded version
 *
 * DEPENDENCIES:
 * - data/chips.json - Chip definitions
 * - data/chip-config.json - Categories, rarities, upgrade config
 *
 * PIPELINE EFFECT TYPES:
 * - flatAdd: Add flat damage (+5, +10, etc.)
 * - multiply: Multiply current damage (x1.5, x2, etc.)
 * - conditional: Multiply if condition met (enemy low HP, is boss, etc.)
 * - critMod: Modify crit chance (+20%, etc.)
 * - recursion: Restart pipeline from beginning (10% chance)
 * - sacrifice: Destroy chip for massive damage (x10)
 * - stacking: Build stacks during combat (+3 per stack)
 * - And more - see processPipelineChip() for full list
 *
 * CHIP RARITIES:
 * - Common (gray): 1.0x stats, base price
 * - Uncommon (green): 1.5x stats, 2.5x price
 * - Rare (blue): 2.0x stats, 5.0x price
 * - Epic (purple): 2.5x stats, 10.0x price
 * - Legendary (orange): 3.0x stats, 20.0x price
 *
 * ARCHITECTURE NOTES:
 * - Pipeline executes via executeChipPipeline() during player attacks
 * - Chips process left-to-right in weapon slot order
 * - Order matters: +5 then x2 = 10, but x2 then +5 = different result
 * - Shop generates random rarity versions of base chips
 * - Upgrades increase rarity with failure chance
 *
 * CLAUDE HINTS:
 * - For pipeline execution, see executeChipPipeline() and processPipelineChip()
 * - Chip data is in data/chips.json, config in data/chip-config.json
 * - Player chips stored in player.chips[], equipped via equipment.equippedChips[]
 * - Rarity scaling happens at shop generation and upgrade time
 */

// Import chip definitions from JSON
import chipData from '../../../data/chips.json' with { type: 'json' };
import chipConfig from '../../../data/chip-config.json' with { type: 'json' };

// ============ CHIP CATEGORIES ============
// Loaded from data/chip-config.json
export const CHIP_CATEGORIES = chipConfig.categories;

// ============ PIPELINE EFFECT TYPES ============
// Loaded from data/chip-config.json
export const PIPELINE_EFFECTS = chipConfig.pipelineEffects;

// ============ CHIP RARITIES ============
// Loaded from data/chip-config.json
export const CHIP_RARITIES = chipConfig.rarities;

// ============ CHIP UPGRADE CONFIG ============
// Loaded from data/chip-config.json with getUpgradeCost function added
export const CHIP_UPGRADE_CONFIG = {
  ...chipConfig.upgradeConfig,
  // Cost to upgrade = purchase price of current rarity
  getUpgradeCost: (rarity) => Math.floor(chipConfig.upgradeConfig.basePrice * CHIP_RARITIES[rarity].priceMultiplier)
};

// ============ CHIP DEFINITIONS ============
// Loaded from data/chips.json
export const CHIPS = chipData;

// ============ HELPER FUNCTIONS ============

/**
 * Get chip by ID
 */
export function getChip(chipId) {
  // First try direct lookup (for base chips)
  if (CHIPS[chipId]) {
    return CHIPS[chipId];
  }

  // Handle rarity-suffixed IDs (e.g., "ballpointPen_rare")
  // Extract base ID and return base chip info (caller should use player inventory for scaled version)
  const parts = chipId.split('_');
  if (parts.length >= 2) {
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const lastPart = parts[parts.length - 1];
    if (rarities.includes(lastPart)) {
      const baseId = parts.slice(0, -1).join('_');
      return CHIPS[baseId] || null;
    }
  }

  return null;
}

/**
 * Get a chip from player's inventory by ID
 * This returns the full chip object with scaled effects for rarity-suffixed chips
 */
export function getChipFromInventory(player, chipId) {
  if (!player?.chips) return null;
  return player.chips.find(c => c.id === chipId) || null;
}

/**
 * Get all chips of a category
 */
export function getChipsByCategory(category) {
  return Object.values(CHIPS).filter(chip => chip.category === category);
}

/**
 * Get all chips of a rarity
 */
export function getChipsByRarity(rarity) {
  return Object.values(CHIPS).filter(chip => chip.rarity === rarity);
}

/**
 * Get chip price based on rarity
 * Handles both base chip IDs and rarity-suffixed IDs (e.g., "ballpointPen_rare")
 */
export function getChipPrice(chipId) {
  // Check if it's a rarity-suffixed ID
  const parts = chipId.split('_');
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const lastPart = parts[parts.length - 1];

  if (parts.length >= 2 && rarities.includes(lastPart)) {
    // Use the rarity from the ID
    const rarity = CHIP_RARITIES[lastPart];
    return Math.floor(chipConfig.upgradeConfig.basePrice * rarity.priceMultiplier);
  }

  // Fallback to base chip lookup
  const chip = getChip(chipId);
  if (!chip) return 0;

  const rarity = CHIP_RARITIES[chip.rarity];
  return Math.floor(chipConfig.upgradeConfig.basePrice * rarity.priceMultiplier);
}

// ============ CHIP UPGRADE FUNCTIONS ============

/**
 * Get the next rarity tier
 * @param {string} currentRarity - Current rarity
 * @returns {string|null} Next rarity or null if already legendary
 */
export function getNextRarity(currentRarity) {
  const order = CHIP_UPGRADE_CONFIG.rarityOrder;
  const currentIndex = order.indexOf(currentRarity);
  if (currentIndex === -1 || currentIndex >= order.length - 1) {
    return null; // Invalid or already legendary
  }
  return order[currentIndex + 1];
}

/**
 * Get the cost to upgrade a chip
 * @param {object} chip - Chip object with rarity
 * @returns {number} Upgrade cost in credits
 */
export function getUpgradeCost(chip) {
  const rarity = chip.rarity || 'common';
  return CHIP_UPGRADE_CONFIG.getUpgradeCost(rarity);
}

/**
 * Get the failure chance for upgrading a chip
 * @param {object} chip - Chip object with rarity
 * @param {number} floorBonus - Optional bonus from floor (reduces failure chance)
 * @returns {number} Failure chance (0-1)
 */
export function getUpgradeFailureChance(chip, floorBonus = 0) {
  const rarity = chip.rarity || 'common';
  const baseFailure = CHIP_UPGRADE_CONFIG.failureRates[rarity] || 0;
  // Floor bonus reduces failure chance
  return Math.max(0, baseFailure - floorBonus);
}

/**
 * Create an upgraded version of a chip
 * @param {object} chip - Original chip from player inventory
 * @param {string} newRarity - Target rarity
 * @returns {object} New chip with upgraded rarity and scaled effects
 */
export function createUpgradedChip(chip, newRarity) {
  // Get base chip definition
  const baseId = chip.baseId || chip.id.split('_')[0];
  const baseChip = CHIPS[baseId];
  if (!baseChip) {
    throw new Error(`Base chip not found: ${baseId}`);
  }

  const rarityInfo = CHIP_RARITIES[newRarity];
  const scaledEffects = applyRarityMultiplier(baseChip.effects, rarityInfo.statMultiplier);

  return {
    id: `${baseId}_${newRarity}`,
    baseId: baseId,
    name: baseChip.name,
    nameEn: baseChip.nameEn,
    category: baseChip.category,
    rarity: newRarity,
    description: baseChip.description,
    effects: scaledEffects,
    baseEffects: baseChip.effects
  };
}

/**
 * Attempt to upgrade a chip (roll for success/failure)
 * @param {object} chip - Chip to upgrade
 * @param {number} floorBonus - Optional floor bonus reducing failure chance
 * @returns {object} { success: boolean, upgradedChip?: object }
 */
export function attemptChipUpgrade(chip, floorBonus = 0) {
  const nextRarity = getNextRarity(chip.rarity);
  if (!nextRarity) {
    return { success: false, reason: 'already_max' };
  }

  const failureChance = getUpgradeFailureChance(chip, floorBonus);
  const roll = Math.random();

  if (roll < failureChance) {
    // Upgrade failed - chip destroyed
    return { success: false, reason: 'failed', failureChance };
  }

  // Success - create upgraded chip
  const upgradedChip = createUpgradedChip(chip, nextRarity);
  return { success: true, upgradedChip, previousRarity: chip.rarity, newRarity: nextRarity };
}

/**
 * Rarity weights for shop generation
 * Higher weight = more likely to appear
 */
const RARITY_WEIGHTS = {
  common: 50,      // Most likely
  uncommon: 30,
  rare: 12,
  epic: 6,
  legendary: 2     // Least likely
};

/**
 * Roll a random rarity based on weights
 * @returns {string} Rarity id
 */
function rollRandomRarity() {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;

  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    roll -= weight;
    if (roll <= 0) {
      return rarity;
    }
  }
  return 'common'; // Fallback
}

/**
 * Apply rarity multiplier to pipeline chip effects
 * @param {object} effects - Base chip effects
 * @param {number} multiplier - Rarity stat multiplier
 * @returns {object} Scaled effects
 */
function applyRarityMultiplier(effects, multiplier) {
  const scaled = {};

  // Scale pipeline effects
  if (effects.pipeline) {
    scaled.pipeline = { ...effects.pipeline };
    // Scale value for flatAdd and critMod types
    if (effects.pipeline.type === 'flatAdd' || effects.pipeline.type === 'critMod') {
      scaled.pipeline.value = Math.floor(effects.pipeline.value * multiplier);
    }
    // For multiply/conditional, scale the multiplier slightly (e.g., 1.5 -> 1.75 at rare)
    if (effects.pipeline.type === 'multiply' || effects.pipeline.type === 'conditional') {
      const baseBonus = effects.pipeline.value - 1; // e.g., 1.5 -> 0.5
      scaled.pipeline.value = 1 + (baseBonus * multiplier); // e.g., 1 + (0.5 * 1.5) = 1.75
    }
  }

  return scaled;
}

/**
 * Generate random chips for post-combat shop
 * All rarities available from any floor, weighted toward common
 * Each chip gets a randomly assigned rarity with scaled stats
 * @param {number} floor - Current floor (unused now, kept for API compatibility)
 * @param {array} ownedChipIds - IDs of chips player already owns
 * @param {number} count - Number of chips to generate (default 3)
 * @param {string} category - Optional category filter (e.g., 'pipeline')
 */
export function generateShopChips(floor, ownedChipIds = [], count = 3, category = null) {
  // Get all base chips (we'll assign rarity randomly)
  // Filter out chips player already owns (by base ID)
  // Optionally filter by category
  const ownedBaseIds = ownedChipIds.map(id => id.split('_')[0]);
  const availableChips = Object.values(CHIPS).filter(chip =>
    !ownedBaseIds.includes(chip.id) &&
    (category === null || chip.category === category)
  );

  if (availableChips.length === 0) {
    return []; // No chips available
  }

  // Shuffle and pick base chips
  const shuffled = [...availableChips].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  // Assign random rarity to each chip and scale effects
  return selected.map(chip => {
    const rolledRarity = rollRandomRarity();
    const rarityInfo = CHIP_RARITIES[rolledRarity];
    const scaledEffects = applyRarityMultiplier(chip.effects, rarityInfo.statMultiplier);

    // Generate unique ID for this rarity version
    const uniqueId = `${chip.id}_${rolledRarity}`;

    return {
      id: uniqueId,
      baseId: chip.id,
      name: chip.name,
      nameEn: chip.nameEn,
      description: chip.description,
      category: chip.category,
      rarity: rolledRarity,
      price: Math.floor(chipConfig.upgradeConfig.basePrice * rarityInfo.priceMultiplier),
      effects: scaledEffects,
      baseEffects: chip.effects  // Keep original for reference
    };
  });
}

// ============ PIPELINE CHIP EXECUTION ============

/**
 * Check if a pipeline condition is met
 * @param {object} condition - Condition definition { type, threshold?, status? }
 * @param {object} state - Pipeline state with target info
 * @returns {boolean} Whether condition is met
 */
function checkPipelineCondition(condition, state) {
  if (!condition) return true;

  switch (condition.type) {
    case 'enemyLowHp':
      return state.target && (state.target.hp / state.target.maxHp) < condition.threshold;
    case 'enemyHasStatus':
      return state.target?.statuses?.some(s => s.id === condition.status);
    case 'isCrit':
      return state.isCrit;
    default:
      return true;
  }
}

/**
 * Process a single pipeline chip
 * @param {object} chip - The chip to process
 * @param {object} state - Current pipeline state
 * @returns {object} Result of processing this chip
 */
function processPipelineChip(chip, state) {
  const effect = chip.effects?.pipeline;
  if (!effect) return { chipId: chip.id, skipped: true };

  // Roll trigger chance
  const triggered = Math.random() < effect.triggerChance;
  if (!triggered) {
    return {
      chipId: chip.id,
      chipName: chip.nameEn || chip.name,
      triggered: false,
      displayText: effect.displayText
    };
  }

  // Check condition for conditional effects
  if (effect.condition && !checkPipelineCondition(effect.condition, state)) {
    return {
      chipId: chip.id,
      chipName: chip.nameEn || chip.name,
      triggered: false,
      conditionFailed: true,
      displayText: effect.displayText
    };
  }

  // Apply effect based on type
  let newDamage = state.currentDamage;
  let critChanceBonus = 0;

  switch (effect.type) {
    case 'flatAdd':
      newDamage = state.currentDamage + effect.value;
      break;
    case 'multiply':
      newDamage = state.currentDamage * effect.value;
      break;
    case 'conditional':
      newDamage = state.currentDamage * effect.value;
      break;
    case 'critMod':
      critChanceBonus = effect.value;
      break;
    case 'recursion':
      // Signal to restart pipeline - handled in executeChipPipeline
      return {
        chipId: chip.id,
        chipName: chip.nameEn || chip.name,
        triggered: true,
        recursion: true,
        displayText: effect.displayText,
        previousDamage: Math.floor(state.currentDamage),
        newDamage: Math.floor(state.currentDamage)
      };
    case 'sacrifice':
      // 10× damage, mark chip for permanent destruction
      newDamage = state.currentDamage * effect.value;
      return {
        chipId: chip.id,
        chipName: chip.nameEn || chip.name,
        triggered: true,
        sacrifice: true,
        destroyed: true,
        previousDamage: Math.floor(state.currentDamage),
        newDamage: Math.floor(newDamage),
        displayText: effect.displayText
      };
    case 'stacking':
      // Increment stack count and add (value * stacks) damage
      if (!state.combatStacks) state.combatStacks = {};
      if (!state.combatStacks[chip.id]) state.combatStacks[chip.id] = 0;
      state.combatStacks[chip.id]++;
      const stackCount = state.combatStacks[chip.id];
      const stackDamage = effect.value * stackCount;
      newDamage = state.currentDamage + stackDamage;
      return {
        chipId: chip.id,
        chipName: chip.nameEn || chip.name,
        triggered: true,
        stacking: true,
        stackCount: stackCount,
        previousDamage: Math.floor(state.currentDamage),
        newDamage: Math.floor(newDamage),
        displayText: `+${stackDamage} (×${stackCount})`
      };
    case 'emptySlots':
      // Check if weapon has enough empty slots
      const totalSlots = state.weaponMaxSlots || 5;
      const usedSlots = state.weaponUsedSlots || 0;
      const emptySlots = totalSlots - usedSlots;
      if (emptySlots >= effect.requiredEmpty) {
        newDamage = state.currentDamage + effect.value;
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: true,
          emptySlotBonus: true,
          emptySlots: emptySlots,
          previousDamage: Math.floor(state.currentDamage),
          newDamage: Math.floor(newDamage),
          displayText: effect.displayText
        };
      } else {
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: false,
          conditionFailed: true,
          emptySlots: emptySlots,
          required: effect.requiredEmpty,
          displayText: effect.displayText
        };
      }
    case 'damageAndHeal':
      // Add damage and heal the player
      newDamage = state.currentDamage + effect.value;
      return {
        chipId: chip.id,
        chipName: chip.nameEn || chip.name,
        triggered: true,
        healPlayer: effect.healValue,
        previousDamage: Math.floor(state.currentDamage),
        newDamage: Math.floor(newDamage),
        displayText: effect.displayText
      };
    case 'killCounter':
      // Add damage based on total kills this run
      const kills = state.runKills || 0;
      const killBonus = effect.value * kills;
      newDamage = state.currentDamage + killBonus;
      return {
        chipId: chip.id,
        chipName: chip.nameEn || chip.name,
        triggered: true,
        killBonus: true,
        kills: kills,
        previousDamage: Math.floor(state.currentDamage),
        newDamage: Math.floor(newDamage),
        displayText: `+${killBonus} (${kills} kills)`
      };
    case 'vsBoss':
      // Multiply damage only against bosses
      if (state.target?.isBoss) {
        newDamage = state.currentDamage * effect.value;
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: true,
          vsBoss: true,
          previousDamage: Math.floor(state.currentDamage),
          newDamage: Math.floor(newDamage),
          displayText: effect.displayText
        };
      } else {
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: false,
          conditionFailed: true,
          notBoss: true,
          displayText: effect.displayText
        };
      }
    case 'destroyedMultiplier':
      // Multiply based on chips destroyed this run
      const destroyed = state.runChipsDestroyed || 0;
      const phoenixMultiplier = effect.baseValue + (effect.perDestroyed * destroyed);
      newDamage = state.currentDamage * phoenixMultiplier;
      return {
        chipId: chip.id,
        chipName: chip.nameEn || chip.name,
        triggered: true,
        phoenixBonus: true,
        chipsDestroyed: destroyed,
        multiplier: phoenixMultiplier,
        previousDamage: Math.floor(state.currentDamage),
        newDamage: Math.floor(newDamage),
        displayText: `×${phoenixMultiplier} (${destroyed} sacrificed)`
      };
    case 'riskyFlat':
      // Add flat damage but risk destroying a random chip
      newDamage = state.currentDamage + effect.value;
      const riskyResult = {
        chipId: chip.id,
        chipName: chip.nameEn || chip.name,
        triggered: true,
        previousDamage: Math.floor(state.currentDamage),
        newDamage: Math.floor(newDamage),
        displayText: effect.displayText
      };
      // Roll for random destruction
      if (Math.random() < effect.destroyChance) {
        riskyResult.randomDestroy = true;  // Signal to destroy a random chip
        riskyResult.displayText = '+50 💀UNSTABLE!';
      }
      return riskyResult;
    case 'copy':
      // Copy the previous chip's effect
      if (!state.lastChipEffect) {
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: false,
          noPreviousChip: true,
          displayText: 'NO TARGET'
        };
      }
      // Re-apply the last chip's effect
      const copied = state.lastChipEffect;
      switch (copied.type) {
        case 'flatAdd':
          newDamage = state.currentDamage + copied.value;
          break;
        case 'multiply':
        case 'conditional':
          newDamage = state.currentDamage * copied.value;
          break;
        case 'damageAndHeal':
          newDamage = state.currentDamage + copied.value;
          return {
            chipId: chip.id,
            chipName: chip.nameEn || chip.name,
            triggered: true,
            copied: true,
            copiedFrom: copied.chipName,
            healPlayer: copied.healValue,
            previousDamage: Math.floor(state.currentDamage),
            newDamage: Math.floor(newDamage),
            displayText: `COPY: ${copied.displayText}`
          };
        default:
          newDamage = state.currentDamage;
      }
      return {
        chipId: chip.id,
        chipName: chip.nameEn || chip.name,
        triggered: true,
        copied: true,
        copiedFrom: copied.chipName,
        previousDamage: Math.floor(state.currentDamage),
        newDamage: Math.floor(newDamage),
        displayText: `COPY: ${copied.displayText}`
      };
    case 'perEmptySlot':
      // Add damage per empty slot
      const totalSlots2 = state.weaponMaxSlots || 5;
      const usedSlots2 = state.weaponUsedSlots || 0;
      const emptySlots2 = totalSlots2 - usedSlots2;
      const emptyBonus = effect.value * emptySlots2;
      newDamage = state.currentDamage + emptyBonus;
      return {
        chipId: chip.id,
        chipName: chip.nameEn || chip.name,
        triggered: true,
        emptySlotScaling: true,
        emptySlots: emptySlots2,
        previousDamage: Math.floor(state.currentDamage),
        newDamage: Math.floor(newDamage),
        displayText: `+${emptyBonus} (${emptySlots2} empty)`
      };
    case 'nthAttack':
      // Multiply damage every Nth attack
      if (!state.combatStacks) state.combatStacks = {};
      const attackKey = chip.id + '_attacks';
      state.combatStacks[attackKey] = (state.combatStacks[attackKey] || 0) + 1;
      const attackNum = state.combatStacks[attackKey];
      const isBurstAttack = attackNum % effect.interval === 0;
      if (isBurstAttack) {
        newDamage = state.currentDamage * effect.multiplier;
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: true,
          burstAttack: true,
          attackNumber: attackNum,
          previousDamage: Math.floor(state.currentDamage),
          newDamage: Math.floor(newDamage),
          displayText: `×${effect.multiplier} BURST!`
        };
      } else {
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: true,
          charging: true,
          attackNumber: attackNum,
          untilBurst: effect.interval - (attackNum % effect.interval),
          previousDamage: Math.floor(state.currentDamage),
          newDamage: Math.floor(state.currentDamage),
          displayText: `${attackNum % effect.interval}/${effect.interval}`
        };
      }
  }

  return {
    chipId: chip.id,
    chipName: chip.nameEn || chip.name,
    triggered: true,
    previousDamage: Math.floor(state.currentDamage),
    newDamage: Math.floor(newDamage),
    displayText: effect.displayText,
    critChanceBonus
  };
}

/**
 * Execute the weapon chip pipeline sequentially
 * @param {Array} weaponChips - Chips in weapon slots (in order)
 * @param {Object} context - { baseDamage, isCrit, critChance, critMultiplier, target }
 * @returns {Object} { finalDamage, firedChips[], critChance, damageMultiplier }
 */
export function executeChipPipeline(weaponChips, context) {
  const state = {
    currentDamage: context.baseDamage,
    isCrit: context.isCrit,
    critChance: context.critChance || 0,
    critMultiplier: context.critMultiplier || 1.4,
    target: context.target,
    firedChips: [],
    recursionCount: 0,
    sacrificedChips: [],
    combatStacks: context.combatStacks || {},  // Persistent stacks for this combat
    weaponMaxSlots: context.weaponMaxSlots || 5,
    weaponUsedSlots: context.weaponUsedSlots || 0,
    totalHealPlayer: 0,
    runKills: context.runKills || 0,
    runChipsDestroyed: context.runChipsDestroyed || 0
  };

  const MAX_RECURSIONS = 10; // Safety cap
  let chipIndex = 0;

  while (chipIndex < weaponChips.length) {
    const chip = weaponChips[chipIndex];

    // Only process pipeline category chips
    if (chip.category !== 'pipeline') {
      state.firedChips.push({ chipId: chip.id, skipped: true, notPipeline: true });
      chipIndex++;
      continue;
    }

    // Skip sacrificed chips (already destroyed this attack)
    if (state.sacrificedChips.includes(chip.id)) {
      state.firedChips.push({ chipId: chip.id, skipped: true, alreadySacrificed: true });
      chipIndex++;
      continue;
    }

    const result = processPipelineChip(chip, state);
    state.firedChips.push(result);

    if (result.triggered) {
      state.currentDamage = result.newDamage;
      if (result.critChanceBonus) state.critChance += result.critChanceBonus;
      if (result.healPlayer) state.totalHealPlayer += result.healPlayer;

      // Track last chip effect for Copycat (don't track copy itself)
      const effect = chip.effects?.pipeline;
      if (effect && effect.type !== 'copy') {
        state.lastChipEffect = { ...effect, chipName: chip.nameEn || chip.name };
      }

      // Handle recursion - restart pipeline from beginning
      if (result.recursion && state.recursionCount < MAX_RECURSIONS) {
        state.recursionCount++;
        chipIndex = 0; // Restart from first chip
        continue;
      }

      // Handle sacrifice - mark chip for permanent destruction
      if (result.sacrifice) {
        state.sacrificedChips.push(chip.id);
      }

      // Handle random destruction from Unstable Core
      if (result.randomDestroy) {
        state.randomDestroyTriggered = true;
      }
    }

    chipIndex++;
  }

  return {
    finalDamage: Math.floor(state.currentDamage),
    firedChips: state.firedChips,
    critChance: state.critChance,
    damageMultiplier: context.baseDamage > 0 ? state.currentDamage / context.baseDamage : 1,
    recursionCount: state.recursionCount,
    sacrificedChips: state.sacrificedChips,
    combatStacks: state.combatStacks,
    healPlayer: state.totalHealPlayer,
    randomDestroyTriggered: state.randomDestroyTriggered || false
  };
}

/**
 * Get weapon pipeline chips in slot order
 * @param {object} player - Player object
 * @returns {Array} Array of chip objects in slot order
 */
export function getWeaponPipelineChips(player) {
  const weapon = player.equipment?.weapon;
  if (!weapon?.equippedChips) return [];

  return weapon.equippedChips
    .map(chipId => {
      // Get from inventory or definitions
      const inventoryChip = player.chips?.find(c => c.id === chipId);
      const baseChip = getChip(chipId);

      // Merge: base chip provides category/effects structure, inventory chip provides rarity/scaled values
      if (inventoryChip && baseChip) {
        return { ...baseChip, ...inventoryChip, category: baseChip.category };
      }
      return inventoryChip || baseChip;
    })
    .filter(Boolean);
}

/**
 * Get chip display info for UI
 */
export function getChipDisplayInfo(chip) {
  const rarity = CHIP_RARITIES[chip.rarity];
  const category = Object.values(CHIP_CATEGORIES).find(c => c.id === chip.category);

  let effectText = '';

  // Pipeline chips show their display text
  if (chip.category === 'pipeline' && chip.effects?.pipeline) {
    effectText = chip.effects.pipeline.displayText || '';
  }

  return {
    ...chip,
    rarityInfo: rarity,
    categoryInfo: category,
    effectText,
    price: getChipPrice(chip.id)
  };
}

// ============ CHIP SLOT MANAGEMENT ============

/**
 * Get the number of slots a chip uses
 * All chips use 1 slot regardless of rarity
 */
export function getChipSlotCost(chip) {
  return 1;
}

/**
 * Get all equipped chips from all equipment pieces
 * Returns full chip objects with scaled effects from player inventory
 * @param {object} player - Player object with equipment
 * @returns {array} Array of equipped chip objects
 */
export function getEquippedChips(player) {
  const chips = [];
  const slots = ['weapon', 'body', 'shield', 'accessory'];

  for (const slot of slots) {
    const equipment = player.equipment?.[slot];
    if (equipment?.equippedChips) {
      for (const chipId of equipment.equippedChips) {
        // First try to get from player inventory (has scaled effects)
        const inventoryChip = getChipFromInventory(player, chipId);
        if (inventoryChip) {
          chips.push(inventoryChip);
        } else {
          // Fallback to base chip definition
          const chip = getChip(chipId);
          if (chip) {
            chips.push(chip);
          }
        }
      }
    }
  }

  return chips;
}

/**
 * Get the count of used slots in an equipment piece
 * @param {object} equipment - Equipment object with equippedChips array
 * @returns {number} Number of slots used
 */
export function getUsedChipSlots(equipment) {
  if (!equipment?.equippedChips) return 0;

  let used = 0;
  for (const chipId of equipment.equippedChips) {
    const chip = getChip(chipId);
    if (chip) {
      used += getChipSlotCost(chip);
    }
  }
  return used;
}

/**
 * Equip a chip from inventory to an equipment piece
 * @param {object} player - Player object
 * @param {string} equipmentSlot - Equipment slot ('weapon', 'body', 'shield', 'accessory')
 * @param {string} chipId - ID of chip to equip
 * @param {number} maxSlots - Max chip slots for this equipment (default 5)
 * @returns {object} Result with success/error
 */
export function equipChip(player, equipmentSlot, chipId, maxSlots = 5) {
  // Validate equipment exists
  const equipment = player.equipment?.[equipmentSlot];
  if (!equipment) {
    return { success: false, error: 'Invalid equipment slot' };
  }

  // Initialize equippedChips if needed
  if (!equipment.equippedChips) {
    equipment.equippedChips = [];
  }

  // Check if chip exists
  const chip = getChip(chipId);
  if (!chip) {
    return { success: false, error: 'Unknown chip' };
  }

  // Check if player owns the chip in inventory
  const ownedChip = player.chips?.find(c => c.id === chipId);
  if (!ownedChip) {
    return { success: false, error: 'Chip not in inventory' };
  }

  // Check if chip is already equipped somewhere
  const slots = ['weapon', 'body', 'shield', 'accessory'];
  for (const slot of slots) {
    const eq = player.equipment?.[slot];
    if (eq?.equippedChips?.includes(chipId)) {
      return { success: false, error: 'Chip already equipped' };
    }
  }

  // Check if there are enough slots
  const slotsNeeded = getChipSlotCost(chip);
  const slotsUsed = getUsedChipSlots(equipment);
  if (slotsUsed + slotsNeeded > maxSlots) {
    return { success: false, error: `Not enough slots (need ${slotsNeeded}, have ${maxSlots - slotsUsed})` };
  }

  // Equip the chip (keep in inventory - just reference by ID)
  equipment.equippedChips.push(chipId);

  return {
    success: true,
    chipId,
    chipName: chip.name,
    slot: equipmentSlot,
    slotsUsed: slotsUsed + slotsNeeded,
    maxSlots
  };
}

/**
 * Unequip a chip from an equipment piece back to inventory
 * @param {object} player - Player object
 * @param {string} equipmentSlot - Equipment slot
 * @param {string} chipId - ID of chip to unequip
 * @returns {object} Result with success/error
 */
export function unequipChip(player, equipmentSlot, chipId) {
  // Validate equipment exists
  const equipment = player.equipment?.[equipmentSlot];
  if (!equipment) {
    return { success: false, error: 'Invalid equipment slot' };
  }

  // Check if chip is equipped
  if (!equipment.equippedChips?.includes(chipId)) {
    return { success: false, error: 'Chip not equipped in this slot' };
  }

  // Get chip definition
  const chip = getChip(chipId);
  if (!chip) {
    return { success: false, error: 'Unknown chip' };
  }

  // Remove from equipment (chip stays in inventory)
  equipment.equippedChips = equipment.equippedChips.filter(id => id !== chipId);

  return {
    success: true,
    chipId,
    chipName: chip.name
  };
}

/**
 * Get chip loadout information for UI
 * @param {object} player - Player object
 * @param {object} runStats - Run-wide statistics
 * @returns {object} Loadout with equipment, inventory, and bonuses
 */
export function getChipLoadout(player, runStats = {}) {
  const slots = ['weapon', 'body', 'shield', 'accessory'];
  const equipmentLoadout = {};

  for (const slot of slots) {
    const equipment = player.equipment?.[slot];
    if (equipment) {
      const equippedChips = (equipment.equippedChips || []).map(chipId => {
        const chip = getChip(chipId);
        return chip ? getChipDisplayInfo(chip) : null;
      }).filter(Boolean);

      equipmentLoadout[slot] = {
        equipmentId: equipment.id,
        equippedChips,
        slotsUsed: getUsedChipSlots(equipment),
        maxSlots: 5
      };
    }
  }

  // Collect all equipped chip IDs
  const equippedChipIds = new Set();
  for (const slot of slots) {
    const equipment = player.equipment?.[slot];
    if (equipment?.equippedChips) {
      for (const chipId of equipment.equippedChips) {
        equippedChipIds.add(chipId);
      }
    }
  }

  // Inventory chips - filter out equipped ones, preserve player's chip data
  const inventoryChips = (player.chips || [])
    .filter(chip => !equippedChipIds.has(chip.id))
    .map(chip => {
      const baseChip = getChip(chip.id);
      // Merge: base chip info + player's chip data (player's data takes priority for id, rarity, effects)
      const mergedChip = baseChip ? { ...baseChip, ...chip } : chip;
      return getChipDisplayInfo(mergedChip);
    });

  return {
    equipment: equipmentLoadout,
    inventory: inventoryChips
  };
}
