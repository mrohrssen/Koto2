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
 * - equipChip(player, slot, chipId) - Equip chip to weapon slot
 * - unequipChip(player, slot, chipId) - Unequip chip from slot
 * - getChipDisplayInfo(chip) - Get UI display information
 * - getChipLoadout(player) - Get full loadout for UI
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


// ============ CHIP DEFINITIONS ============
// Loaded from data/chips.json
export const CHIPS = chipData;

// ============ HELPER FUNCTIONS ============

/**
 * Get chip by ID
 */
export function getChip(chipId) {
  // Handle null/undefined chip IDs
  if (!chipId) return null;

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

  const rarity = CHIP_RARITIES[chip.rarity || 'common'];
  return Math.floor(chipConfig.upgradeConfig.basePrice * rarity.priceMultiplier);
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
 * Each chip has a fixed rarity defined in chips.json
 * @param {number} floor - Current floor (unused now, kept for API compatibility)
 * @param {array} ownedChipIds - IDs of chips player already owns
 * @param {number} count - Number of chips to generate (default 3)
 * @param {string} category - Optional category filter (e.g., 'pipeline')
 */
export function generateShopChips(floor, ownedChipIds = [], count = 3, category = null) {
  // Get all chips, filter out ones player already owns
  // Optionally filter by category
  const availableChips = Object.values(CHIPS).filter(chip =>
    !ownedChipIds.includes(chip.id) &&
    (category === null || chip.category === category)
  );

  if (availableChips.length === 0) {
    return []; // No chips available
  }

  // Shuffle and pick chips
  const shuffled = [...availableChips].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  // Use fixed rarity from chip definition
  return selected.map(chip => {
    const rarity = chip.rarity || 'common';
    const rarityInfo = CHIP_RARITIES[rarity];

    return {
      id: chip.id,
      baseId: chip.id,
      name: chip.name,
      nameEn: chip.nameEn,
      description: chip.description,
      descriptionEn: chip.descriptionEn,
      category: chip.category,
      rarity: rarity,
      price: Math.floor(chipConfig.upgradeConfig.basePrice * rarityInfo.priceMultiplier),
      effects: chip.effects,
      skill: chip.skill,
      stats: chip.stats
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
 * Process a single pipeline chip for dual-pool system
 * Returns pool modifiers instead of directly modifying damage
 * @param {object} chip - The chip to process
 * @param {object} state - Current pipeline state
 * @returns {object} Result with pool modifiers: { powerAdd, powerMult, bandwidthAdd, bandwidthMult, ... }
 */
function processPipelineChip(chip, state) {
  const effect = chip.effects?.pipeline;
  if (!effect) return { chipId: chip.id, skipped: true };

  // Type "none" means pure stat stick - no effect to process
  if (effect.type === 'none') {
    return {
      chipId: chip.id,
      chipName: chip.nameEn || chip.name,
      triggered: false,
      statStick: true,
      displayText: effect.displayText || ''
    };
  }

  // Apply level scaling to effect value
  let effectValue = effect.value;
  if (state.player) {
    effectValue = getScaledEffectValue(chip, getChipLevel(state.player, chip.id));
  }

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

  // Default pool modifiers
  let powerAdd = 0, powerMult = 1, bandwidthAdd = 0, bandwidthMult = 1;
  const target = effect.target || 'power'; // Default to power for backward compatibility

  // Helper to apply value to correct pool based on target
  const applyAdd = (value) => {
    if (target === 'power') powerAdd += value;
    else if (target === 'bandwidth') bandwidthAdd += value;
    else if (target === 'both') { powerAdd += value; bandwidthAdd += value; }
  };

  const applyMult = (value) => {
    if (target === 'power') powerMult *= value;
    else if (target === 'bandwidth') bandwidthMult *= value;
    else if (target === 'both') { powerMult *= value; bandwidthMult *= value; }
  };

  // Build base result
  const baseResult = {
    chipId: chip.id,
    chipName: chip.nameEn || chip.name,
    triggered: true,
    displayText: effect.displayText
  };

  switch (effect.type) {
    case 'flatAdd':
      applyAdd(effectValue);
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'multiply':
      applyMult(effectValue);
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'conditional':
      // Conditional now adds flat to targeted pool (not multiply)
      applyAdd(effectValue);
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'critMod':
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult, critChanceBonus: effectValue };

    case 'recursion':
      return { ...baseResult, recursion: true, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'sacrifice':
      // Sacrifice multiplies both pools with specific multipliers
      powerMult = effect.powerMultiplier || effectValue;
      bandwidthMult = effect.bandwidthMultiplier || effectValue;
      return { ...baseResult, sacrifice: true, destroyed: true, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'stacking':
      // Increment stack count and add (value * stacks) to targeted pool
      if (!state.combatStacks) state.combatStacks = {};
      if (!state.combatStacks[chip.id]) state.combatStacks[chip.id] = 0;
      state.combatStacks[chip.id]++;
      const stackCount = state.combatStacks[chip.id];
      const stackBonus = effectValue * stackCount;
      applyAdd(stackBonus);
      return {
        ...baseResult,
        stacking: true,
        stackCount,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult,
        displayText: `+${stackBonus} (x${stackCount})`
      };

    case 'emptySlots':
      // Check if weapon has enough empty slots, add to both pools
      const totalSlots = state.weaponMaxSlots || 5;
      const usedSlots = state.weaponUsedSlots || 0;
      const emptySlots = totalSlots - usedSlots;
      if (emptySlots >= effect.requiredEmpty) {
        powerAdd = effect.powerValue || 0;
        bandwidthAdd = effect.bandwidthValue || 0;
        return { ...baseResult, emptySlotBonus: true, emptySlots, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
      } else {
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: false,
          conditionFailed: true,
          emptySlots,
          required: effect.requiredEmpty,
          displayText: effect.displayText
        };
      }

    case 'damageAndHeal':
      // Heal player, optionally add to targeted pool
      applyAdd(effectValue);
      // Support both flat heal and percentage heal
      let healAmount = effect.healValue || 0;
      if (effect.healPercent && state.player?.maxHp) {
        healAmount = Math.floor(state.player.maxHp * effect.healPercent);
      }
      return { ...baseResult, healPlayer: healAmount, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'killCounter':
      // Add (value * kills) to targeted pool
      const kills = state.runKills || 0;
      const killBonus = effectValue * kills;
      applyAdd(killBonus);
      return {
        ...baseResult,
        killBonus: true,
        kills,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult,
        displayText: `+${killBonus} (${kills} kills)`
      };

    case 'vsBoss':
      // Multiply targeted pool only vs bosses
      if (state.target?.isBoss) {
        applyMult(effectValue);
        return { ...baseResult, vsBoss: true, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
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
      // Add bandwidth based on chips destroyed this run
      const destroyed = state.runChipsDestroyed || 0;
      const phoenixBonus = effect.baseValue + (effect.perDestroyed * destroyed);
      applyAdd(phoenixBonus);
      return {
        ...baseResult,
        phoenixBonus: true,
        chipsDestroyed: destroyed,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult,
        displayText: `+${phoenixBonus} (${destroyed} sacrificed)`
      };

    case 'riskyFlat':
      // Pure stat stick with risk (stats already summed, just check for destruction)
      const riskyResult = { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
      if (Math.random() < effect.destroyChance) {
        riskyResult.randomDestroy = true;
        riskyResult.displayText = 'UNSTABLE!';
      }
      return riskyResult;

    case 'copy':
      // Copy the previous chip's pool modifiers
      if (!state.lastChipEffect) {
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: false,
          noPreviousChip: true,
          displayText: 'NO TARGET'
        };
      }
      const copied = state.lastChipEffect;
      return {
        ...baseResult,
        copied: true,
        copiedFrom: copied.chipName,
        powerAdd: copied.powerAdd || 0,
        powerMult: copied.powerMult || 1,
        bandwidthAdd: copied.bandwidthAdd || 0,
        bandwidthMult: copied.bandwidthMult || 1,
        healPlayer: copied.healPlayer,
        displayText: `COPY: ${copied.displayText}`
      };

    case 'perEmptySlot':
      // Add per empty slot to both pools
      const totalSlots2 = state.weaponMaxSlots || 5;
      const usedSlots2 = state.weaponUsedSlots || 0;
      const emptySlots2 = totalSlots2 - usedSlots2;
      powerAdd = (effect.powerValue || 0) * emptySlots2;
      bandwidthAdd = (effect.bandwidthValue || 0) * emptySlots2;
      return {
        ...baseResult,
        emptySlotScaling: true,
        emptySlots: emptySlots2,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult,
        displayText: `+${powerAdd} PWR +${bandwidthAdd} BW (${emptySlots2} empty)`
      };

    case 'nthAttack':
      // Multiply targeted pool every Nth attack
      if (!state.combatStacks) state.combatStacks = {};
      const attackKey = chip.id + '_attacks';
      state.combatStacks[attackKey] = (state.combatStacks[attackKey] || 0) + 1;
      const attackNum = state.combatStacks[attackKey];
      const isBurstAttack = attackNum % effect.interval === 0;
      if (isBurstAttack) {
        applyMult(effect.multiplier);
        return {
          ...baseResult,
          burstAttack: true,
          attackNumber: attackNum,
          powerAdd, powerMult, bandwidthAdd, bandwidthMult,
          displayText: `x${effect.multiplier} BURST!`
        };
      } else {
        return {
          ...baseResult,
          charging: true,
          attackNumber: attackNum,
          untilBurst: effect.interval - (attackNum % effect.interval),
          powerAdd, powerMult, bandwidthAdd, bandwidthMult,
          displayText: `${attackNum % effect.interval}/${effect.interval}`
        };
      }

    case 'rampingMultiply':
      // Add to targeted pool based on consecutive hits (now additive, not multiplicative)
      if (!state.combatStacks) state.combatStacks = {};
      const rampKey = chip.id + '_ramp';
      state.combatStacks[rampKey] = (state.combatStacks[rampKey] || 0) + 1;
      const rampCount = state.combatStacks[rampKey];
      const rampBonus = effectValue * rampCount;
      applyAdd(rampBonus);
      return {
        ...baseResult,
        rampingMultiply: true,
        hitCount: rampCount,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult,
        displayText: `+${rampBonus.toFixed(2)} (${rampCount} hits)`
      };

    case 'amplifyNext':
      // Set amplification factor for next chip's stats
      state.nextChipAmplify = effectValue;
      return { ...baseResult, amplifyNext: true, amplifyFactor: effectValue, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'perEquipped':
      // Add per equipped chip to both pools
      const equippedCount = state.weaponUsedSlots || 0;
      powerAdd = (effect.powerValue || 0) * equippedCount;
      bandwidthAdd = (effect.bandwidthValue || 0) * equippedCount;
      return {
        ...baseResult,
        perEquipped: true,
        equippedCount,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult,
        displayText: `+${powerAdd} PWR +${bandwidthAdd} BW (${equippedCount} equipped)`
      };

    case 'hpCost':
      // Pure stat stick with HP cost - stats already summed, just track cost
      return {
        ...baseResult,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult,
        hpCost: effect.hpCost || 0
      };

    case 'missingHpBonus':
      // Add BW based on missing HP
      const missingHp = state.player ? (state.player.maxHp - state.player.hp) : 0;
      const hpBonus = Math.floor(missingHp / 10) * (effect.valuePer10Hp || 1);
      bandwidthAdd = hpBonus;
      return {
        ...baseResult,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult,
        missingHpBonus: true,
        missingHp,
        displayText: `+${hpBonus} BW (${missingHp} HP missing)`
      };

    case 'slotCount':
      // Check if exact chip count requirement is met
      if (state.weaponUsedSlots !== effect.requiredCount) {
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: false,
          conditionFailed: true,
          displayText: `Need ${effect.requiredCount} chips`
        };
      }
      // Condition met - pure stat stick (stats already added in first pass)
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'degradePerAttack':
      // Track degradation for next attack
      const degradeKey2 = chip.id + '_degraded';
      if (!state.combatStacks) state.combatStacks = {};
      state.combatStacks[degradeKey2] = (state.combatStacks[degradeKey2] || 0) + effect.degradeAmount;
      // Track in result for return value
      if (!state.degradation) state.degradation = {};
      state.degradation[chip.id] = effect.degradeAmount;
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'degradePerCombat':
      // Track degradation to apply after combat ends
      if (!state.combatDegradation) state.combatDegradation = {};
      state.combatDegradation[chip.id] = effect.degradeAmount;
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'rarityBonus':
      // Add value per chip of target rarity
      const rarities = state.equippedChipRarities || [];
      const matchCount = rarities.filter(r => r === effect.targetRarity).length;
      const rarityBonusValue = matchCount * (effect.valuePerChip || 0);
      if (target === 'bandwidth') bandwidthAdd = rarityBonusValue;
      else if (target === 'power') powerAdd = rarityBonusValue;
      return {
        ...baseResult,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult,
        rarityBonus: true,
        matchCount,
        displayText: `+${rarityBonusValue} (${matchCount} ${effect.targetRarity})`
      };

    case 'rarityRestriction':
      // Multiply if no forbidden rarities present
      const equippedRarities = state.equippedChipRarities || [];
      const hasForbidden = equippedRarities.some(r => effect.forbiddenRarities.includes(r));
      if (hasForbidden) {
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: false,
          conditionFailed: true,
          displayText: 'Forbidden rarity equipped'
        };
      }
      applyMult(effect.multiplier);
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'positionBonus':
      // Check if chip is in the required position (first or last)
      const isFirst = state.currentChipIndex === 0;
      const isLast = state.currentChipIndex === state.totalChipCount - 1;
      const positionRequired = effect.position;
      const positionMet = (positionRequired === 'first' && isFirst) ||
                          (positionRequired === 'last' && isLast);
      if (!positionMet) {
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: false,
          conditionFailed: true,
          displayText: `Not in ${positionRequired} position`
        };
      }
      // Apply position bonuses
      powerAdd = effect.powerAdd || 0;
      bandwidthAdd = effect.bandwidthAdd || 0;
      powerMult = effect.powerMult || 1;
      bandwidthMult = effect.bandwidthMult || 1;
      return {
        ...baseResult,
        positionBonus: true,
        position: positionRequired,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult
      };

    case 'healingToDamage':
      // Converts healing received into bonus damage
      // The actual conversion happens in executeChipPipeline after total heal is known
      state.healingToDamageActive = true;
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'lifesteal':
      state.lifestealPercent = effect.lifestealPercent || 0;
      if (effect.disableOtherHealing) {
        state.disableOtherHealing = true;
      }
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    case 'selfDamagePerTrigger':
      state.selfDamagePerTrigger = effect.damagePerTrigger || 0;
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };

    default:
      // Unknown effect type - return no modifications
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
  }
}

/**
 * Execute the weapon chip pipeline sequentially with dual-pool system
 * @param {Array} weaponChips - Chips in weapon slots (in order)
 * @param {Object} context - { baseDamage, isCrit, critChance, critMultiplier, target }
 * @returns {Object} { finalDamage, powerPool, bandwidthPool, firedChips[], critChance }
 */
export function executeChipPipeline(weaponChips, context) {
  const state = {
    isCrit: context.isCrit,
    critChance: context.critChance || 0,
    critMultiplier: context.critMultiplier || 1.4,
    target: context.target,
    firedChips: [],
    sequence: [],  // Step-by-step animation sequence
    recursionCount: 0,
    sacrificedChips: [],
    combatStacks: context.combatStacks || {},  // Persistent stacks for this combat
    weaponMaxSlots: context.weaponMaxSlots || 5,
    weaponUsedSlots: context.weaponUsedSlots || 0,
    totalHealPlayer: 0,
    totalHpCost: 0,
    runKills: context.runKills || 0,
    runChipsDestroyed: context.runChipsDestroyed || 0,
    player: context.player || null,
    equippedChipRarities: context.equippedChipRarities || weaponChips.map(c => c.rarity || 'common'),
    // Dual-pool system: chips contribute stats to pools
    powerPool: 0,
    bandwidthPool: 0,
    // Degradation tracking for degradePerAttack chips
    degradation: {},
    // Degradation tracking for degradePerCombat chips (applied after combat ends)
    combatDegradation: {},
    // Lifesteal tracking
    lifestealPercent: 0,
    disableOtherHealing: false,
    // Self damage per trigger tracking
    selfDamagePerTrigger: 0,
    triggerCount: 0
  };

  // First pass: sum all chip stats into pools (with level scaling)
  console.log('[Pipeline] Starting pipeline with', weaponChips.length, 'chips');
  for (const chip of weaponChips) {
    if (chip.category === 'pipeline' && chip.stats) {
      // Check slotCount restriction before adding stats
      const effect = chip.effects?.pipeline;
      if (effect?.type === 'slotCount') {
        if (state.weaponUsedSlots !== effect.requiredCount) {
          console.log(`[Pipeline] ${chip.nameEn || chip.id}: DISABLED (need ${effect.requiredCount} chips, have ${state.weaponUsedSlots})`);
          continue; // Skip this chip's stats entirely
        }
      }

      let statPower = chip.stats.power || 0;
      let statBandwidth = chip.stats.bandwidth || 0;

      // Apply level scaling to stats
      if (state.player) {
        const level = getChipLevel(state.player, chip.id);
        const scalingPerLevel = 0.20;
        const scaleFactor = 1 + (level - 1) * scalingPerLevel;
        statPower = Math.round(statPower * scaleFactor);
        statBandwidth = Math.round(statBandwidth * scaleFactor);
      }

      // Apply degradation from previous attacks (degradePerAttack type)
      const degradeKey = chip.id + '_degraded';
      const totalDegraded = state.combatStacks[degradeKey] || 0;
      if (chip.effects?.pipeline?.type === 'degradePerAttack' && totalDegraded > 0) {
        const degradeTarget = chip.effects.pipeline.target;
        if (degradeTarget === 'bandwidth') {
          statBandwidth = Math.max(0, statBandwidth - totalDegraded);
        } else if (degradeTarget === 'power') {
          statPower = Math.max(0, statPower - totalDegraded);
        }
      }

      // Apply persistent degradation (per-combat type) from player state
      if (chip.effects?.pipeline?.type === 'degradePerCombat' && state.player?._chipDegradation) {
        const persistentDegraded = state.player._chipDegradation[chip.id] || 0;
        const degradeTarget = chip.effects.pipeline.target;
        if (degradeTarget === 'bandwidth') {
          statBandwidth = Math.max(0, statBandwidth - persistentDegraded);
        } else if (degradeTarget === 'power') {
          statPower = Math.max(0, statPower - persistentDegraded);
        }
      }

      console.log(`[Pipeline] ${chip.nameEn || chip.id}: +${statPower} PWR, +${statBandwidth} BW`);

      // Record activate event
      state.sequence.push({
        type: 'activate',
        chipId: chip.id,
        chipName: chip.nameEn || chip.name
      });

      // Record base stat contribution (only if non-zero)
      if (statPower > 0 || statBandwidth > 0) {
        state.sequence.push({
          type: 'base',
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          power: statPower || undefined,
          bandwidth: statBandwidth || undefined
        });
      }

      state.powerPool += statPower;
      state.bandwidthPool += statBandwidth;
    }
  }
  console.log('[Pipeline] After stats: PWR', state.powerPool, 'BW', state.bandwidthPool);

  let nextChipDoubleActive = context.nextChipDouble || false;
  let nextChipAmplifyFactor = context.nextChipAmplify || null;

  const MAX_RECURSIONS = 10; // Safety cap
  let chipIndex = 0;

  while (chipIndex < weaponChips.length) {
    const chip = weaponChips[chipIndex];

    // Track position for positionBonus effect type
    state.currentChipIndex = chipIndex;
    state.totalChipCount = weaponChips.length;

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

    // Apply amplify factor from previous chip (Magnifying Glass passive or skill buff)
    let amplifiedChip = chip;
    if (nextChipAmplifyFactor && chip.effects?.pipeline) {
      amplifiedChip = {
        ...chip,
        effects: {
          ...chip.effects,
          pipeline: { ...chip.effects.pipeline, value: (chip.effects.pipeline.value || 0) * nextChipAmplifyFactor }
        }
      };
      // Also amplify multiplier field for nthAttack type
      if (chip.effects.pipeline.multiplier) {
        amplifiedChip.effects.pipeline.multiplier = 1 + (chip.effects.pipeline.multiplier - 1) * nextChipAmplifyFactor;
      }
      nextChipAmplifyFactor = null; // Consumed
    }

    const result = processPipelineChip(amplifiedChip, state);
    state.firedChips.push(result);

    // Count triggers for selfDamagePerTrigger effect
    if (result.triggered) {
      state.triggerCount++;
    }

    // Record sequence events for animation
    if (result.triggered) {
      // Effect event (if chip modified pools)
      if (result.powerAdd || result.bandwidthAdd ||
          (result.powerMult && result.powerMult !== 1) ||
          (result.bandwidthMult && result.bandwidthMult !== 1)) {
        state.sequence.push({
          type: 'effect',
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          powerAdd: result.powerAdd || undefined,
          powerMult: (result.powerMult && result.powerMult !== 1) ? result.powerMult : undefined,
          bandwidthAdd: result.bandwidthAdd || undefined,
          bandwidthMult: (result.bandwidthMult && result.bandwidthMult !== 1) ? result.bandwidthMult : undefined
        });
      }

      // Heal event
      if (result.healPlayer) {
        state.sequence.push({
          type: 'heal',
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          hp: result.healPlayer
        });
      }

      // Sacrifice event
      if (result.sacrifice) {
        state.sequence.push({
          type: 'sacrifice',
          chipId: chip.id,
          chipName: chip.nameEn || chip.name
        });
      }
    } else if (result.conditionFailed || result.notBoss || result.noPreviousChip) {
      // Conditional didn't trigger
      state.sequence.push({
        type: 'noTrigger',
        chipId: chip.id,
        chipName: chip.nameEn || chip.name
      });
    }

    // Apply pool modifiers from effect
    if (result.triggered) {
      const prevPwr = state.powerPool;
      const prevBw = state.bandwidthPool;
      // Apply additive modifiers first
      state.powerPool += result.powerAdd || 0;
      state.bandwidthPool += result.bandwidthAdd || 0;
      // Apply multiplicative modifiers
      state.powerPool *= result.powerMult || 1;
      state.bandwidthPool *= result.bandwidthMult || 1;

      if (result.powerAdd || result.bandwidthAdd || (result.powerMult && result.powerMult !== 1) || (result.bandwidthMult && result.bandwidthMult !== 1)) {
        console.log(`[Pipeline] ${chip.nameEn || chip.id} effect: PWR ${prevPwr} → ${state.powerPool}, BW ${prevBw} → ${state.bandwidthPool}`);
      }

      if (result.critChanceBonus) state.critChance += result.critChanceBonus;
      if (result.healPlayer && !state.disableOtherHealing) {
        state.totalHealPlayer += result.healPlayer;
      }
      if (result.hpCost) state.totalHpCost += result.hpCost;

      // Track last chip effect for Copycat (don't track copy itself)
      const effect = chip.effects?.pipeline;
      if (effect && effect.type !== 'copy') {
        state.lastChipEffect = {
          ...effect,
          chipName: chip.nameEn || chip.name,
          powerAdd: result.powerAdd,
          powerMult: result.powerMult,
          bandwidthAdd: result.bandwidthAdd,
          bandwidthMult: result.bandwidthMult,
          healPlayer: result.healPlayer
        };
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

      // Handle amplifyNext - set factor for next chip
      if (result.amplifyNext) {
        nextChipAmplifyFactor = result.amplifyFactor;
      }
    }

    // nextChipDouble: the first chip that fires also fires a second time
    if (nextChipDoubleActive && result.triggered) {
      const doubleResult = processPipelineChip(chip, state);
      state.firedChips.push(doubleResult);
      if (doubleResult.triggered) {
        state.powerPool += doubleResult.powerAdd || 0;
        state.bandwidthPool += doubleResult.bandwidthAdd || 0;
        state.powerPool *= doubleResult.powerMult || 1;
        state.bandwidthPool *= doubleResult.bandwidthMult || 1;
        if (doubleResult.critChanceBonus) state.critChance += doubleResult.critChanceBonus;
        if (doubleResult.healPlayer) state.totalHealPlayer += doubleResult.healPlayer;
      }
      nextChipDoubleActive = false;
    }

    chipIndex++;
  }

  // Convert healing to bonus damage if healingToDamage is active
  let healingToDamage = 0;
  if (state.healingToDamageActive && state.totalHealPlayer > 0) {
    healingToDamage = state.totalHealPlayer;
  }

  // Calculate final damage using dual-pool formula: POWER × (1 + BANDWIDTH) + healingToDamage
  const finalDamage = Math.floor(state.powerPool * (1 + state.bandwidthPool)) + healingToDamage;

  // Calculate self damage from selfDamagePerTrigger effect
  const selfDamage = state.selfDamagePerTrigger * state.triggerCount;

  console.log('[Pipeline] Final: PWR', state.powerPool, '× (1 + BW', state.bandwidthPool, ') + heal2dmg', healingToDamage, '=', finalDamage);

  return {
    finalDamage,
    firedChips: state.firedChips,
    sequence: state.sequence,
    critChance: state.critChance,
    recursionCount: state.recursionCount,
    sacrificedChips: state.sacrificedChips,
    combatStacks: state.combatStacks,
    healPlayer: state.totalHealPlayer,
    hpCost: state.totalHpCost,
    randomDestroyTriggered: state.randomDestroyTriggered || false,
    // Dual-pool system outputs
    powerPool: state.powerPool,
    bandwidthPool: state.bandwidthPool,
    // Healing converted to damage (healingToDamage effect)
    healingToDamage,
    // Degradation tracking for degradePerAttack chips
    degradation: state.degradation,
    // Degradation tracking for degradePerCombat chips (applied after combat ends)
    combatDegradation: state.combatDegradation,
    // Lifesteal percentage (vampire effect)
    lifestealPercent: state.lifestealPercent,
    // Self damage from selfDamagePerTrigger effect
    selfDamage
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
  const rarity = CHIP_RARITIES[chip.rarity || 'common'];
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
 * Get all equipped chips (from weapon only)
 * @param {object} player - Player object with equipment
 * @returns {array} Array of equipped chip objects
 */
export function getEquippedChips(player) {
  const chips = [];
  const weapon = player.equipment?.weapon;
  if (!weapon?.equippedChips) return chips;

  for (const chipId of weapon.equippedChips) {
    const inventoryChip = getChipFromInventory(player, chipId);
    if (inventoryChip) {
      chips.push(inventoryChip);
    } else {
      const chip = getChip(chipId);
      if (chip) {
        chips.push(chip);
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

  // Check if chip is already equipped
  if (equipment.equippedChips.includes(chipId)) {
    return { success: false, error: 'Chip already equipped' };
  }

  // Check if there are enough slots
  const slotsNeeded = getChipSlotCost(chip);
  const slotsUsed = getUsedChipSlots(equipment);
  if (slotsUsed + slotsNeeded > maxSlots) {
    return { success: false, error: `Not enough slots (need ${slotsNeeded}, have ${maxSlots - slotsUsed})` };
  }

  // Equip the chip (keep in inventory - just reference by ID)
  equipment.equippedChips.push(chipId);

  // Add chip's HP bonus to player
  const chipHP = ownedChip.stats?.hp || 0;
  if (chipHP > 0 && player.maxHp !== undefined) {
    const level = getChipLevel(player, chipId);
    const scalingPerLevel = 0.20;
    const scaleFactor = 1 + (level - 1) * scalingPerLevel;
    const hpBonus = Math.floor(chipHP * scaleFactor);
    player.maxHp += hpBonus;
    player.hp += hpBonus;
  }

  return {
    success: true,
    chipId,
    chipName: chip.nameEn || chip.name,
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

  // Remove chip's HP bonus from player before unequipping
  const ownedChip = player.chips?.find(c => c.id === chipId);
  const chipHP = ownedChip?.stats?.hp || 0;
  if (chipHP > 0 && player.maxHp !== undefined) {
    const level = getChipLevel(player, chipId);
    const scalingPerLevel = 0.20;
    const scaleFactor = 1 + (level - 1) * scalingPerLevel;
    const hpBonus = Math.floor(chipHP * scaleFactor);
    player.maxHp = Math.max(1, player.maxHp - hpBonus);
    player.hp = Math.min(player.hp, player.maxHp);
  }

  // Remove from equipment (chip stays in inventory)
  equipment.equippedChips = equipment.equippedChips.filter(id => id !== chipId);

  // Reset charge when unequipped
  resetChipCharge(player, chipId);

  return {
    success: true,
    chipId,
    chipName: chip.nameEn || chip.name
  };
}

/**
 * Get chip loadout information for UI
 * @param {object} player - Player object
 * @returns {object} Loadout with equipment (weapon only) and inventory
 */
export function getChipLoadout(player) {
  const weapon = player.equipment?.weapon;
  const equippedChips = (weapon?.equippedChips || []).map(chipEntry => {
    // Handle both string IDs and chip objects
    const chipId = typeof chipEntry === 'string' ? chipEntry : chipEntry?.id;
    if (!chipId) return null;
    const chip = getChip(chipId);
    return chip ? getChipDisplayInfo(chip) : null;
  }).filter(Boolean);

  const equippedChipIds = new Set((weapon?.equippedChips || []).map(c => typeof c === 'string' ? c : c?.id));

  // Inventory chips - filter out equipped ones
  const inventoryChips = (player.chips || [])
    .filter(chip => !equippedChipIds.has(chip.id))
    .map(chip => {
      const baseChip = getChip(chip.id);
      const mergedChip = baseChip ? { ...baseChip, ...chip } : chip;
      return getChipDisplayInfo(mergedChip);
    });

  return {
    equipment: {
      weapon: {
        equipmentId: weapon?.id || 'defaultWeapon',
        equippedChips,
        slotsUsed: getUsedChipSlots(weapon),
        maxSlots: 5
      }
    },
    inventory: inventoryChips
  };
}

// ============ CHIP CHARGE HELPERS ============

export function getChipCharge(player, chipId) {
  return player._chipCharges?.[chipId] || 0;
}

export function incrementAllEquippedCharges(player) {
  const equippedChips = player.equipment?.weapon?.equippedChips || [];
  if (!player._chipCharges) player._chipCharges = {};
  for (const chipId of equippedChips) {
    player._chipCharges[chipId] = (player._chipCharges[chipId] || 0) + 1;
  }
}

export function resetChipCharge(player, chipId) {
  if (!player._chipCharges) player._chipCharges = {};
  player._chipCharges[chipId] = 0;
}

export function isChipSkillReady(player, chipId) {
  const chip = getChip(chipId);
  if (!chip?.skill) return false;
  const charge = getChipCharge(player, chipId);
  return charge >= chip.skill.chargesRequired;
}

// ============ CHIP LEVEL HELPERS ============

export function getChipLevel(player, chipId) {
  return player._chipLevels?.[chipId] || 1;
}

export function setChipLevel(player, chipId, level) {
  if (!player._chipLevels) player._chipLevels = {};
  player._chipLevels[chipId] = Math.max(1, Math.min(7, level));
}

/**
 * Calculate total bonus HP from equipped chips
 * @param {object} player - Player object with equipment and chip levels
 * @returns {number} Total HP bonus from equipped chips
 */
export function calculateChipBonusHP(player) {
  const equippedChips = getEquippedChips(player);
  let totalHP = 0;

  for (const chip of equippedChips) {
    const baseHP = chip.stats?.hp || 0;
    const level = getChipLevel(player, chip.id);
    const scalingPerLevel = 0.20;
    const scaleFactor = 1 + (level - 1) * scalingPerLevel;
    totalHP += Math.floor(baseHP * scaleFactor);
  }

  return totalHP;
}

export function getScaledEffectValue(chip, level) {
  const effect = chip.effects?.pipeline;
  if (!effect || level <= 1) return effect?.value;

  const scalingPerLevel = 0.20;
  const scaleFactor = 1 + (level - 1) * scalingPerLevel;
  const value = effect.value;
  const type = effect.type;

  // Multiply types: scale the bonus portion (value - 1), keep base 1.0
  if (type === 'multiply' || type === 'vsBoss' || type === 'destroyedMultiplier') {
    return 1 + (value - 1) * scaleFactor;
  }

  // Ramping multiply and amplifyNext: scale as decimal without floor (small values like 0.05)
  if (type === 'rampingMultiply' || type === 'amplifyNext') {
    return value * scaleFactor;
  }

  // All others (flatAdd, stacking, damageAndHeal, killCounter, riskyFlat, perEmptySlot, emptySlots, perEquipped, nthAttack): floor
  return Math.floor(value * scaleFactor);
}

/**
 * Reorder equipped chips in weapon slot
 * @param {Object} player - Player object
 * @param {Array<string|null>} chipIds - New order of chip IDs (5 elements, null for empty slots)
 * @returns {{success: boolean, error?: string}}
 */
export function reorderChips(player, chipIds) {
  if (!player?.equipment?.weapon) {
    return { success: false, error: 'No weapon equipped' };
  }

  if (!Array.isArray(chipIds) || chipIds.length !== 5) {
    return { success: false, error: 'chipIds must be array of 5 elements' };
  }

  const weapon = player.equipment.weapon;
  const currentChips = weapon.equippedChips || [];

  // Validate all provided chipIds exist in current loadout
  // currentChips can be either strings or objects with .id
  const currentIds = currentChips.map(c => c?.id || c || null).filter(Boolean);
  for (const id of chipIds) {
    if (id !== null && !currentIds.includes(id)) {
      return { success: false, error: `Chip ${id} not in current loadout` };
    }
  }

  // Store only non-null chip IDs in slot order (compact array)
  // The order in the array represents slot positions: index 0 = slot 0, etc.
  // Filter nulls to maintain compact format expected by other code
  weapon.equippedChips = chipIds.filter(id => id !== null);
  return { success: true };
}
