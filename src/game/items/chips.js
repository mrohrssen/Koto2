/**
 * @fileoverview Chip equipment system - passive augmentations for gear
 * @module src/game/items/chips
 *
 * PURPOSE:
 * Implements the chip system where players buy and equip passive augmentations
 * to their equipment. Chips provide stat bonuses, on-hit effects, conditional
 * triggers, and scaling bonuses. Each equipment slot has limited chip capacity.
 * Chips have 5 rarities affecting their power and cost.
 *
 * KEY EXPORTS:
 * Constants:
 * - CHIP_CATEGORIES - Stat, OnHit, OnEffect, Counter categories
 * - CHIP_RARITIES - Common, Uncommon, Rare, Epic, Legendary with multipliers
 * - CHIPS - All chip definitions (100+ chips with effects)
 *
 * Functions:
 * - getChip(chipId) - Get chip definition by ID
 * - getChipsByCategory(category) - Filter chips by category
 * - getChipsByRarity(rarity) - Filter chips by rarity
 * - getChipPrice(chipId) - Calculate chip purchase price
 * - generateShopChips(floor, owned, count) - Generate shop inventory
 * - calculateChipStatBonuses(chips) - Sum stat bonuses from equipped chips
 * - processOnHitChips(chips, target) - Execute on-hit effects
 * - processOnKillChips(chips) - Execute on-kill effects
 * - processOnDamageChips(chips, damage) - Execute damage-triggered effects
 * - updateCounterStacks(stacks, chips, trigger, context) - Track counter chips
 * - calculateCounterBonuses(chips, runStats) - Calculate counter-based bonuses
 * - getEquippedChips(player) - Get all chips equipped on player
 * - equipChip(player, slot, chipId, maxSlots) - Equip chip to equipment slot
 *
 * DEPENDENCIES:
 * - None (self-contained data module)
 *
 * CHIP CATEGORIES:
 * - STAT: Flat bonuses (+5 ATK, +10 HP, etc.)
 * - ON_HIT: Chance effects when attacking (poison, lifesteal, etc.)
 * - ON_EFFECT: Conditional triggers (on kill, on crit, on low HP)
 * - COUNTER: Scaling bonuses (damage per kill, crit per dodge, etc.)
 *
 * CHIP RARITIES:
 * - Common (gray): 1.0x stats, 1.0x price
 * - Uncommon (green): 1.5x stats, 2.5x price
 * - Rare (blue): 2.0x stats, 5.0x price
 * - Epic (purple): 2.5x stats, 10.0x price
 * - Legendary (orange): 3.0x stats, 20.0x price
 *
 * DATA STRUCTURES:
 * - Chip: { id, name, category, rarity, basePrice, description,
 *          effects: { stat?, chance?, trigger?, scaling? } }
 * - EquippedChip: { chipId, slotCost } stored in equipment.equippedChips[]
 *
 * SLOT SYSTEM:
 * - Each equipment piece has chip slots (default 5)
 * - Chips cost 1-3 slots based on power
 * - Legendary chips cost more slots than common
 *
 * ARCHITECTURE NOTES:
 * - Chip effects applied via calculateChipStatBonuses() at combat start
 * - On-hit/on-kill effects processed during combat in combat/mechanics.js
 * - Counter stacks tracked in run.runStats and reset each run
 * - Shop chips generated with weighted random by floor and rarity
 * - Rarity generation uses floor-based weighted tables
 *
 * CLAUDE HINTS:
 * - For equipping chips, see equipChip() and game.js openChipModal()
 * - Counter chips reference run.runStats for their scaling
 * - Chip effects defined in effects{} object, vary by category
 * - Price calculation in getChipPrice() includes rarity multiplier
 * - Shop generation excludes already-owned chips
 */

// Import chip definitions from JSON
import chipData from '../../../data/chips.json' with { type: 'json' };

// ============ CHIP CATEGORIES ============
export const CHIP_CATEGORIES = {
  STAT: {
    id: 'stat',
    name: 'ステータス',
    nameEn: 'Stat',
    description: 'Flat stat bonuses'
  },
  ON_HIT: {
    id: 'onHit',
    name: 'オンヒット',
    nameEn: 'On Hit',
    description: 'Chance to trigger effect when hitting enemy'
  },
  ON_EFFECT: {
    id: 'onEffect',
    name: 'オンエフェクト',
    nameEn: 'On Effect',
    description: 'Triggers on specific conditions'
  },
  COUNTER: {
    id: 'counter',
    name: 'カウンター',
    nameEn: 'Counter',
    description: 'Scales with accumulation during run'
  },
  PIPELINE: {
    id: 'pipeline',
    name: 'パイプライン',
    nameEn: 'Pipeline',
    description: 'Sequential damage modification - fires in weapon slot order'
  }
};

// ============ PIPELINE EFFECT TYPES ============
export const PIPELINE_EFFECTS = {
  FLAT_ADD: 'flatAdd',        // +X damage
  MULTIPLY: 'multiply',        // damage * X
  CONDITIONAL: 'conditional',  // multiply if condition met
  CRIT_MOD: 'critMod'         // modify crit chance/damage
};

// ============ CHIP RARITIES ============
export const CHIP_RARITIES = {
  common: {
    id: 'common',
    name: 'ノーマル',
    nameEn: 'Common',
    color: '#9d9d9d',
    priceMultiplier: 1.0,
    statMultiplier: 1.0
  },
  uncommon: {
    id: 'uncommon',
    name: 'アンコモン',
    nameEn: 'Uncommon',
    color: '#1eff00',
    priceMultiplier: 2.5,
    statMultiplier: 1.5
  },
  rare: {
    id: 'rare',
    name: 'レア',
    nameEn: 'Rare',
    color: '#0070dd',
    priceMultiplier: 5.0,
    statMultiplier: 2.0
  },
  epic: {
    id: 'epic',
    name: 'エピック',
    nameEn: 'Epic',
    color: '#a335ee',
    priceMultiplier: 10.0,
    statMultiplier: 2.5
  },
  legendary: {
    id: 'legendary',
    name: 'レジェンダリー',
    nameEn: 'Legendary',
    color: '#ff8000',
    priceMultiplier: 20.0,
    statMultiplier: 3.0
  }
};

// Base price for chips
const BASE_CHIP_PRICE = 30;

// ============ CHIP UPGRADE CONFIG ============
export const CHIP_UPGRADE_CONFIG = {
  failureRates: {
    common: 0.05,      // 5% chance to fail
    uncommon: 0.10,    // 10% chance to fail
    rare: 0.15,        // 15% chance to fail
    epic: 0.25         // 25% chance to fail
    // legendary cannot be upgraded
  },
  rarityOrder: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
  // Cost to upgrade = purchase price of current rarity
  getUpgradeCost: (rarity) => Math.floor(BASE_CHIP_PRICE * CHIP_RARITIES[rarity].priceMultiplier)
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
    return Math.floor(BASE_CHIP_PRICE * rarity.priceMultiplier);
  }

  // Fallback to base chip lookup
  const chip = getChip(chipId);
  if (!chip) return 0;

  const rarity = CHIP_RARITIES[chip.rarity];
  return Math.floor(BASE_CHIP_PRICE * rarity.priceMultiplier);
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
 * Apply rarity multiplier to chip effects
 * Handles all effect types: stats, onHit, onKill, onDamage, onDodge, onCrit,
 * onHeal, onLowHp, onRoomEnter, onStatusInflict, onEffectTrigger, counter
 * @param {object} effects - Base chip effects
 * @param {number} multiplier - Rarity stat multiplier
 * @returns {object} Scaled effects
 */
function applyRarityMultiplier(effects, multiplier) {
  const scaled = {};

  // Helper to scale common numeric fields in an effect object
  const scaleEffect = (effect) => {
    const s = { ...effect };
    // Scale chance (cap at reasonable values)
    if (s.chance !== undefined) s.chance = Math.min(s.chance * multiplier, 0.8);
    // Scale numeric values
    if (s.heal !== undefined) s.heal = Math.floor(s.heal * multiplier);
    if (s.healPercent !== undefined) s.healPercent = s.healPercent * multiplier;
    if (s.bonusDamage !== undefined) s.bonusDamage = Math.floor(s.bonusDamage * multiplier);
    if (s.damage !== undefined) s.damage = Math.floor(s.damage * multiplier);
    if (s.aoeDamage !== undefined) s.aoeDamage = Math.floor(s.aoeDamage * multiplier);
    if (s.value !== undefined) s.value = s.value * multiplier;
    if (s.damageReduction !== undefined) s.damageReduction = Math.min(s.damageReduction * multiplier, 0.5);
    if (s.damageBonus !== undefined) s.damageBonus = s.damageBonus * multiplier;
    if (s.critBonus !== undefined) s.critBonus = s.critBonus * multiplier;
    if (s.defenseBonus !== undefined) s.defenseBonus = s.defenseBonus * multiplier;
    if (s.goldBonus !== undefined) s.goldBonus = s.goldBonus * multiplier;
    if (s.xpBonus !== undefined) s.xpBonus = s.xpBonus * multiplier;
    return s;
  };

  // Scale stat bonuses
  if (effects.stats) {
    scaled.stats = {};
    for (const [stat, value] of Object.entries(effects.stats)) {
      scaled.stats[stat] = Math.floor(value * multiplier);
    }
  }

  // Scale all trigger-based effects
  if (effects.onHit) scaled.onHit = scaleEffect(effects.onHit);
  if (effects.onKill) scaled.onKill = scaleEffect(effects.onKill);
  if (effects.onDamage) scaled.onDamage = scaleEffect(effects.onDamage);
  if (effects.onDodge) scaled.onDodge = scaleEffect(effects.onDodge);
  if (effects.onCrit) scaled.onCrit = scaleEffect(effects.onCrit);
  if (effects.onHeal) scaled.onHeal = scaleEffect(effects.onHeal);
  if (effects.onLowHp) scaled.onLowHp = scaleEffect(effects.onLowHp);
  if (effects.onRoomEnter) scaled.onRoomEnter = scaleEffect(effects.onRoomEnter);
  if (effects.onStatusInflict) scaled.onStatusInflict = scaleEffect(effects.onStatusInflict);
  if (effects.onEffectTrigger) scaled.onEffectTrigger = scaleEffect(effects.onEffectTrigger);

  // Scale counter effects
  if (effects.counter) {
    scaled.counter = { ...effects.counter };
    if (scaled.counter.bonusPerStack) scaled.counter.bonusPerStack = effects.counter.bonusPerStack * multiplier;
    if (scaled.counter.perStack) scaled.counter.perStack = effects.counter.perStack * multiplier;
    if (scaled.counter.maxBonus) scaled.counter.maxBonus = effects.counter.maxBonus * multiplier;
  }

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
      price: Math.floor(BASE_CHIP_PRICE * rarityInfo.priceMultiplier),
      effects: scaledEffects,
      baseEffects: chip.effects  // Keep original for reference
    };
  });
}

/**
 * Calculate total stat bonuses from owned chips
 * @param {array} chips - Array of chip objects owned by player
 */
export function calculateChipStatBonuses(chips) {
  const bonuses = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };

  for (const chip of chips) {
    if (chip.category === 'stat' && chip.effects?.stats) {
      for (const [stat, value] of Object.entries(chip.effects.stats)) {
        if (bonuses.hasOwnProperty(stat)) {
          bonuses[stat] += value;
        }
      }
    }
  }

  return bonuses;
}

/**
 * Process on-hit chip effects
 * @param {array} chips - Array of chip objects
 * @param {object} target - The enemy being hit
 * @returns {array} Array of triggered effects
 */
export function processOnHitChips(chips, target) {
  const triggered = [];

  for (const chip of chips) {
    if (chip.category === 'onHit' && chip.effects?.onHit) {
      const effect = chip.effects.onHit;
      if (Math.random() < effect.chance) {
        triggered.push({
          chipId: chip.id,
          chipName: chip.name,
          status: effect.status,
          duration: effect.duration,
          bonusDamage: effect.bonusDamage || 0
        });
      }
    }
  }

  return triggered;
}

/**
 * Process on-kill chip effects
 * @param {array} chips - Array of chip objects
 * @returns {object} Combined effects from all triggered chips
 */
export function processOnKillChips(chips) {
  const effects = {
    heal: 0,
    aspdBoost: 0,
    aspdDuration: 0,
    doubleCredits: false,
    aoeExplosion: false,
    aoeDamage: 0,
    buffs: [],
    bonusCurrency: 0,
    extraChipDrop: false
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onKill) {
      const effect = chip.effects.onKill;
      if (Math.random() < effect.chance) {
        if (effect.heal) effects.heal += effect.heal;
        if (effect.aspdBoost) {
          effects.aspdBoost += effect.aspdBoost;
          effects.aspdDuration = Math.max(effects.aspdDuration, effect.duration || 0);
        }
        if (effect.doubleCredits) effects.doubleCredits = true;
        if (effect.aoeExplosion) {
          effects.aoeExplosion = true;
          effects.aoeDamage += effect.aoeDamage || 0;
        }
        if (effect.buff) {
          effects.buffs.push({
            chipId: chip.id,
            chipName: chip.name,
            buff: effect.buff,
            value: effect.value,
            duration: effect.duration
          });
        }
        if (effect.bonusCurrency) effects.bonusCurrency += effect.bonusCurrency;
        if (effect.extraChipDrop) effects.extraChipDrop = true;
      }
    }
  }

  return effects;
}

/**
 * Process on-damage chip effects
 * @param {array} chips - Array of chip objects
 * @param {number} damage - Incoming damage
 * @returns {object} Modified damage and effects
 */
export function processOnDamageChips(chips, damage) {
  let finalDamage = damage;
  const triggered = [];
  let heal = 0;
  const buffs = [];
  let negated = false;

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onDamage) {
      const effect = chip.effects.onDamage;
      if (Math.random() < effect.chance) {
        if (effect.damageReduction) {
          finalDamage = Math.floor(finalDamage * (1 - effect.damageReduction));
          triggered.push({
            chipId: chip.id,
            chipName: chip.name,
            reduction: effect.damageReduction
          });
        }
        if (effect.heal) {
          heal += effect.heal;
          triggered.push({
            chipId: chip.id,
            chipName: chip.name,
            heal: effect.heal
          });
        }
        if (effect.buff) {
          buffs.push({
            chipId: chip.id,
            chipName: chip.name,
            buff: effect.buff,
            value: effect.value,
            duration: effect.duration
          });
        }
        if (effect.negateDamage) {
          negated = true;
          finalDamage = 0;
          triggered.push({
            chipId: chip.id,
            chipName: chip.name,
            negated: true
          });
        }
      }
    }
  }

  return { finalDamage, triggered, heal, buffs, negated };
}

/**
 * Process on-crit chip effects
 * @param {array} chips - Array of chip objects
 * @returns {object} Combined effects from all triggered chips
 */
export function processOnCritChips(chips) {
  const effects = {
    heal: 0,
    buffs: [],
    bonusHit: false,
    doubleCritDamage: false
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onCrit) {
      const effect = chip.effects.onCrit;
      if (Math.random() < effect.chance) {
        if (effect.heal) effects.heal += effect.heal;
        if (effect.buff) {
          effects.buffs.push({
            chipId: chip.id,
            chipName: chip.name,
            buff: effect.buff,
            value: effect.value,
            duration: effect.duration
          });
        }
        if (effect.bonusHit) effects.bonusHit = true;
        if (effect.doubleCritDamage) effects.doubleCritDamage = true;
      }
    }
  }

  return effects;
}

/**
 * Process on-dodge chip effects
 * @param {array} chips - Array of chip objects
 * @returns {object} Combined effects from all triggered chips
 */
export function processOnDodgeChips(chips) {
  const effects = {
    buffs: [],
    counterAttack: false
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onDodge) {
      const effect = chip.effects.onDodge;
      if (Math.random() < effect.chance) {
        if (effect.buff) {
          effects.buffs.push({
            chipId: chip.id,
            chipName: chip.name,
            buff: effect.buff,
            value: effect.value,
            duration: effect.duration
          });
        }
        if (effect.counterAttack) effects.counterAttack = true;
      }
    }
  }

  return effects;
}

/**
 * Process on-low-hp chip effects (when player would die)
 * @param {array} chips - Array of chip objects
 * @returns {object} Combined effects from all triggered chips
 */
export function processOnLowHpChips(chips) {
  const effects = {
    surviveWithOneHp: false,
    shield: 0
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onLowHp) {
      const effect = chip.effects.onLowHp;
      if (Math.random() < effect.chance) {
        if (effect.surviveWithOneHp) effects.surviveWithOneHp = true;
        if (effect.shield) effects.shield += effect.shield;
      }
    }
  }

  return effects;
}

/**
 * Process on-heal chip effects
 * @param {array} chips - Array of chip objects
 * @param {number} healAmount - Base heal amount
 * @returns {object} Modified heal amount and effects
 */
export function processOnHealChips(chips, healAmount) {
  let finalHeal = healAmount;
  const effects = {
    bonusHeal: 0,
    buffs: []
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onHeal) {
      const effect = chip.effects.onHeal;
      if (Math.random() < effect.chance) {
        if (effect.bonusHeal) {
          effects.bonusHeal += effect.bonusHeal;
          finalHeal += effect.bonusHeal;
        }
        if (effect.buff) {
          effects.buffs.push({
            chipId: chip.id,
            chipName: chip.name,
            buff: effect.buff,
            value: effect.value,
            duration: effect.duration
          });
        }
      }
    }
  }

  return { finalHeal, ...effects };
}

/**
 * Process on-room-enter chip effects
 * @param {array} chips - Array of chip objects
 * @returns {object} Combined effects from all triggered chips
 */
export function processOnRoomEnterChips(chips) {
  const effects = {
    heal: 0,
    buffs: [],
    rareSpawn: false,
    stealth: false,
    stunAllEnemies: 0
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onRoomEnter) {
      const effect = chip.effects.onRoomEnter;
      if (Math.random() < effect.chance) {
        if (effect.heal) effects.heal += effect.heal;
        if (effect.buff) {
          effects.buffs.push({
            chipId: chip.id,
            chipName: chip.name,
            buff: effect.buff,
            value: effect.value,
            duration: effect.duration
          });
        }
        if (effect.rareSpawn) effects.rareSpawn = true;
        if (effect.stealth) effects.stealth = true;
        if (effect.stunAllEnemies) effects.stunAllEnemies = Math.max(effects.stunAllEnemies, effect.stunAllEnemies);
      }
    }
  }

  return effects;
}

/**
 * Process on-status-inflict chip effects
 * @param {array} chips - Array of chip objects
 * @param {string} statusType - The type of status that was inflicted
 * @returns {object} Combined effects from all triggered chips
 */
export function processOnStatusInflictChips(chips, statusType) {
  const effects = {
    heal: 0,
    extendDuration: 0
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onStatusInflict) {
      const effect = chip.effects.onStatusInflict;
      // Check if this chip triggers for this status type
      if (effect.statusType && effect.statusType !== statusType) continue;

      if (Math.random() < effect.chance) {
        if (effect.heal) effects.heal += effect.heal;
        if (effect.extendStun) effects.extendDuration += effect.extendStun;
      }
    }
  }

  return effects;
}

/**
 * Process special on-hit chip effects (cascade, enemyMissNextTurn)
 * @param {array} chips - Array of chip objects
 * @returns {object} Special effects to apply
 */
export function processSpecialOnHitChips(chips) {
  const effects = {
    cascade: false,
    enemyMissNextTurn: false
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onHit) {
      const effect = chip.effects.onHit;
      if (Math.random() < effect.chance) {
        if (effect.cascade) effects.cascade = true;
        if (effect.enemyMissNextTurn) effects.enemyMissNextTurn = true;
      }
    }
  }

  return effects;
}

/**
 * Check if dice chip triggers a retrigger of chip effects
 * @param {array} chips - Player's equipped chips
 * @returns {boolean} Whether retrigger should occur
 */
export function checkDiceRetrigger(chips) {
  const diceChip = chips.find(c => c.id === 'dice');
  if (!diceChip) return false;

  const effect = diceChip.effects?.onEffectTrigger;
  if (!effect || !effect.retrigger) return false;

  return Math.random() < effect.chance;
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
 * Update counter chip stacks
 * @param {object} counterStacks - Current stack counts { chipId: count }
 * @param {array} chips - Player's chips
 * @param {string} trigger - The trigger type (onKill, onCrit, onRoomEnter, etc.)
 * @param {object} context - Additional context (statusType for onStatusInflict)
 */
export function updateCounterStacks(counterStacks, chips, trigger, context = {}) {
  const updated = { ...counterStacks };

  for (const chip of chips) {
    if (chip.category === 'counter' && chip.effects?.counter) {
      const counter = chip.effects.counter;
      if (counter.trigger === trigger) {
        // Check additional conditions
        if (trigger === 'onStatusInflict' && counter.statusType !== context.statusType) {
          continue;
        }

        const currentStacks = updated[chip.id] || 0;
        if (currentStacks < counter.maxStacks) {
          updated[chip.id] = currentStacks + 1;
        }
      }
    }
  }

  return updated;
}

/**
 * Calculate counter chip bonuses based on run stats
 * @param {array} chips - Player's chips
 * @param {object} runStats - Run-wide statistics tracking
 */
export function calculateCounterBonuses(chips, runStats = {}) {
  const bonuses = {
    // Stats
    str: 0,
    agi: 0,
    vit: 0,
    int: 0,
    dex: 0,
    luk: 0,
    // Combat
    damagePercent: 0,
    flatDamage: 0,
    critChance: 0,
    critDamage: 0,
    aspd: 0,
    dodge: 0,
    // Status
    statusDuration: 0,
    statusChance: 0,
    triggerChance: 0,
    effectPotency: 0,
    // Utility
    allStats: 0,
    maxHp: 0,
    itemFind: 0,
    currencyGain: 0,
    inventorySlots: 0,
    healAtRoomStart: 0
  };

  for (const chip of chips) {
    if (chip.category === 'counter' && chip.effects?.counter) {
      const counter = chip.effects.counter;
      let stacks = 0;

      // Calculate stacks based on trigger type
      switch (counter.trigger) {
        case 'onKill':
          stacks = runStats.kills || 0;
          break;
        case 'onCrit':
          stacks = runStats.critsLanded || 0;
          break;
        case 'onStatusInflict':
          // Count specific status type or all statuses
          if (counter.statusType && runStats.statusesApplied) {
            stacks = runStats.statusesApplied[counter.statusType] || 0;
          } else if (runStats.statusesApplied) {
            stacks = Object.values(runStats.statusesApplied).reduce((sum, v) => sum + v, 0);
          }
          break;
        case 'onRoomEnter':
          stacks = runStats.roomsCleared || 0;
          break;
        case 'onChipCount':
          // Count chips in specific category
          if (counter.chipCategory) {
            stacks = chips.filter(c => c.category === counter.chipCategory).length;
          }
          break;
        case 'onUniqueChipType':
          // Count unique chip categories owned
          const uniqueCategories = new Set(chips.map(c => c.category));
          stacks = uniqueCategories.size;
          break;
        default:
          stacks = 0;
      }

      // Apply max stacks cap
      stacks = Math.min(stacks, counter.maxStacks);

      // Calculate bonus
      const bonus = stacks * counter.perStack;

      // Add to appropriate bonus type
      if (bonuses.hasOwnProperty(counter.bonus)) {
        bonuses[counter.bonus] += bonus;
      }
    }
  }

  return bonuses;
}

/**
 * Get chip display info for UI
 */
export function getChipDisplayInfo(chip) {
  const rarity = CHIP_RARITIES[chip.rarity];
  const category = Object.values(CHIP_CATEGORIES).find(c => c.id === chip.category);

  let effectText = '';

  if (chip.category === 'stat' && chip.effects?.stats) {
    const stats = Object.entries(chip.effects.stats)
      .map(([stat, val]) => `${stat.toUpperCase()}+${val}`)
      .join(', ');
    effectText = stats;
  } else if (chip.category === 'onHit' && chip.effects?.onHit) {
    const e = chip.effects.onHit;
    effectText = `${Math.round(e.chance * 100)}% ${e.status} (${e.duration}T)`;
    if (e.bonusDamage) effectText += ` +${e.bonusDamage}dmg`;
  } else if (chip.category === 'onEffect') {
    if (chip.effects?.onKill) {
      const e = chip.effects.onKill;
      const parts = [];
      if (e.heal) parts.push(`回復${e.heal}HP`);
      if (e.aspdBoost) parts.push(`ASPD+${Math.round(e.aspdBoost * 100)}%`);
      if (e.doubleCredits) parts.push('報酬2倍');
      if (e.aoeExplosion) parts.push(`爆発${e.aoeDamage}dmg`);
      effectText = `${Math.round(e.chance * 100)}% ${parts.join(', ')}`;
    } else if (chip.effects?.onDamage) {
      const e = chip.effects.onDamage;
      effectText = `${Math.round(e.chance * 100)}% ダメージ${Math.round(e.damageReduction * 100)}%軽減`;
    }
  } else if (chip.category === 'counter' && chip.effects?.counter) {
    const c = chip.effects.counter;
    effectText = `+${c.perStack}%/${c.trigger} (最大${c.perStack * c.maxStacks}%)`;
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
 * Calculate total bonuses from all equipped chips
 * Combines STAT chip bonuses and COUNTER chip bonuses
 * @param {object} player - Player object
 * @param {object} runStats - Run-wide statistics for counter chips
 * @returns {object} Combined bonus object
 */
export function calculateEquippedChipBonuses(player, runStats = {}) {
  const equippedChips = getEquippedChips(player);

  // Get STAT chip bonuses
  const statBonuses = calculateChipStatBonuses(equippedChips);

  // Get COUNTER chip bonuses
  const counterBonuses = calculateCounterBonuses(equippedChips, runStats);

  // Combine all bonuses
  return {
    // Primary stats from STAT chips
    str: statBonuses.str,
    agi: statBonuses.agi,
    vit: statBonuses.vit,
    int: statBonuses.int,
    dex: statBonuses.dex,
    luk: statBonuses.luk,

    // Counter bonuses
    damagePercent: counterBonuses.damagePercent,
    flatDamage: counterBonuses.flatDamage,
    critChance: counterBonuses.critChance,
    critDamage: counterBonuses.critDamage,
    aspd: counterBonuses.aspd,
    dodge: counterBonuses.dodge,
    statusDuration: counterBonuses.statusDuration,
    statusChance: counterBonuses.statusChance,
    triggerChance: counterBonuses.triggerChance,
    effectPotency: counterBonuses.effectPotency,
    allStats: counterBonuses.allStats,
    maxHp: counterBonuses.maxHp,
    itemFind: counterBonuses.itemFind,
    currencyGain: counterBonuses.currencyGain,
    inventorySlots: counterBonuses.inventorySlots,
    healAtRoomStart: counterBonuses.healAtRoomStart
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

  // Total bonuses
  const totalBonuses = calculateEquippedChipBonuses(player, runStats);

  return {
    equipment: equipmentLoadout,
    inventory: inventoryChips,
    totalBonuses
  };
}
