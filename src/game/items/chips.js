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
  const availableChips = Object.values(CHIPS).filter(chip =>
    !ownedChipIds.includes(chip.id) &&
    (category === null || chip.category === category)
  );

  if (availableChips.length === 0) {
    return []; // No chips available
  }

  // Shuffle and pick base chips
  const shuffled = [...availableChips].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  // All chips are common rarity — no rarity rolling
  const commonRarity = CHIP_RARITIES['common'];
  return selected.map(chip => {
    return {
      id: chip.id,
      name: chip.name,
      nameEn: chip.nameEn,
      description: chip.description,
      category: chip.category,
      rarity: 'common',
      price: Math.floor(chipConfig.upgradeConfig.basePrice * commonRarity.priceMultiplier),
      effects: chip.effects
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

  // Apply effect based on type
  let newDamage = state.currentDamage;
  let critChanceBonus = 0;

  switch (effect.type) {
    case 'flatAdd':
      newDamage = state.currentDamage + effectValue;
      break;
    case 'multiply':
      newDamage = state.currentDamage * effectValue;
      break;
    case 'conditional':
      newDamage = state.currentDamage * effectValue;
      break;
    case 'critMod':
      critChanceBonus = effectValue;
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
      newDamage = state.currentDamage * effectValue;
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
      const stackDamage = effectValue * stackCount;
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
        newDamage = state.currentDamage + effectValue;
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
      newDamage = state.currentDamage + effectValue;
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
      const killBonus = effectValue * kills;
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
        newDamage = state.currentDamage * effectValue;
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
      newDamage = state.currentDamage + effectValue;
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
      const emptyBonus = effectValue * emptySlots2;
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
    case 'rampingMultiply':
      // Multiplier that grows with each consecutive hit on same enemy
      if (!state.combatStacks) state.combatStacks = {};
      const rampKey = chip.id + '_ramp';
      state.combatStacks[rampKey] = (state.combatStacks[rampKey] || 0) + 1;
      const rampCount = state.combatStacks[rampKey];
      const rampMultiplier = 1 + (effectValue * rampCount);
      newDamage = state.currentDamage * rampMultiplier;
      return {
        chipId: chip.id,
        chipName: chip.nameEn || chip.name,
        triggered: true,
        rampingMultiply: true,
        hitCount: rampCount,
        multiplier: rampMultiplier,
        previousDamage: Math.floor(state.currentDamage),
        newDamage: Math.floor(newDamage),
        displayText: `×${rampMultiplier.toFixed(2)} (${rampCount} hits)`
      };
    case 'amplifyNext':
      // Set amplification factor for next chip in pipeline
      state.nextChipAmplify = effectValue;
      return {
        chipId: chip.id,
        chipName: chip.nameEn || chip.name,
        triggered: true,
        amplifyNext: true,
        amplifyFactor: effectValue,
        previousDamage: Math.floor(state.currentDamage),
        newDamage: Math.floor(state.currentDamage),
        displayText: `×${effectValue} NEXT`
      };
    case 'perEquipped':
      // Add damage per equipped chip
      const equippedCount = state.weaponUsedSlots || 0;
      const equippedBonus = effectValue * equippedCount;
      newDamage = state.currentDamage + equippedBonus;
      return {
        chipId: chip.id,
        chipName: chip.nameEn || chip.name,
        triggered: true,
        perEquipped: true,
        equippedCount,
        previousDamage: Math.floor(state.currentDamage),
        newDamage: Math.floor(newDamage),
        displayText: `+${equippedBonus} (${equippedCount} equipped)`
      };
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
    runChipsDestroyed: context.runChipsDestroyed || 0,
    player: context.player || null
  };

  let nextChipDoubleActive = context.nextChipDouble || false;
  let nextChipAmplifyFactor = context.nextChipAmplify || null;

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

    // nextChipDouble: the first chip that fires also fires a second time
    if (nextChipDoubleActive && result.triggered) {
      const doubleResult = processPipelineChip(chip, state);
      state.firedChips.push(doubleResult);
      if (doubleResult.triggered) {
        state.currentDamage = doubleResult.newDamage;
        if (doubleResult.critChanceBonus) state.critChance += doubleResult.critChanceBonus;
        if (doubleResult.healPlayer) state.totalHealPlayer += doubleResult.healPlayer;
      }
      nextChipDoubleActive = false;
    }

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

      // Handle amplifyNext - set factor for next chip
      if (result.amplifyNext) {
        nextChipAmplifyFactor = result.amplifyFactor;
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

  // Reset charge when unequipped
  resetChipCharge(player, chipId);

  return {
    success: true,
    chipId,
    chipName: chip.name
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

export function getScaledEffectValue(chip, level) {
  const effect = chip.effects?.pipeline;
  if (!effect || level <= 1) return effect?.value;

  const scalingPerLevel = 0.10;
  const scaleFactor = 1 + (level - 1) * scalingPerLevel;
  const value = effect.value;
  const type = effect.type;

  // Multiply types: scale the bonus portion (value - 1), keep base 1.0
  if (type === 'multiply' || type === 'conditional' || type === 'vsBoss' || type === 'destroyedMultiplier') {
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
 * @param {Array<string|null>} chipIds - New order of chip IDs (5 elements, null for empty)
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
  const currentIds = currentChips.map(c => c?.id || c || null);
  for (const id of chipIds) {
    if (id !== null && !currentIds.includes(id)) {
      return { success: false, error: `Chip ${id} not in current loadout` };
    }
  }

  // Build new order - store just the IDs (matching the original format)
  // equippedChips should contain string IDs, not chip objects
  weapon.equippedChips = chipIds;
  return { success: true };
}
