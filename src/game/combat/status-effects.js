/**
 * Status Effects System - NEO TOKYO: System Liberation
 * Defines status effects and provides functions for applying/managing them
 *
 * Cyberpunk-themed status effects representing SYSTEM disruption
 */

// ============ STATUS EFFECTS DEFINITIONS ============

/**
 * Status effects that can be applied to players and enemies
 * resistStat: The stat used to resist this effect (higher = more resistance)
 * dotDamage: Damage per turn for DoT effects
 * skipTurn: Whether this effect causes the target to skip their turn
 * damageTakenMultiplier: Multiplier for damage received (e.g., 1.5 = 50% more damage)
 * blockMagic: Whether this effect prevents casting magic/skills
 * brokenByDamage: Whether taking damage removes this effect
 */
export const STATUS_EFFECTS = {
  // デフラグ - Fragments SYSTEM code, causing data corruption damage
  DEFRAG: {
    id: 'defrag',
    name: 'デフラグ',
    nameEn: 'Defrag',
    resistStat: 'agi',
    dotDamage: 5,
    duration: 2,
    description: 'SYSTEM fragmentation - takes damage each cycle'
  },
  // バッファオーバーフロー - Overloads processing, causing system freeze
  BUFFER_OVERFLOW: {
    id: 'bufferOverflow',
    name: 'バッファオーバーフロー',
    nameEn: 'Buffer Overflow',
    resistStat: 'vit',
    skipTurn: true,
    duration: 1,
    description: 'SYSTEM overload - cannot act'
  },
  // 露出 - Exposes vulnerabilities, increasing damage taken
  EXPOSED: {
    id: 'exposed',
    name: '露出',
    nameEn: 'Exposed',
    resistStat: 'int',
    damageTakenMultiplier: 1.5,
    duration: 2,
    description: 'Vulnerabilities exposed - takes 50% more damage'
  },
  // 破損 - Corrupts ability data, blocking skill usage
  CORRUPTED: {
    id: 'corrupted',
    name: '破損',
    nameEn: 'Corrupted',
    resistStat: 'int',
    blockMagic: true,
    duration: 2,
    description: 'Data corrupted - cannot use skills'
  },
  // オーバーヒート - Thermal runaway causing sustained damage
  OVERHEATED: {
    id: 'overheated',
    name: 'オーバーヒート',
    nameEn: 'Overheated',
    resistStat: 'vit',
    dotDamage: 8,
    duration: 3,
    description: 'Thermal overload - takes heat damage each cycle'
  },
  // ラグ - Network latency causing delayed responses
  LAG: {
    id: 'lag',
    name: 'ラグ',
    nameEn: 'Lag',
    resistStat: 'agi',
    skipTurn: true,
    brokenByDamage: true,
    duration: 2,
    description: 'Network lag - cannot act, clears on damage'
  }
};

// Legacy mappings for backwards compatibility with existing save data
export const STATUS_LEGACY_MAP = {
  'bleed': 'defrag',
  'stun': 'bufferOverflow',
  'blind': 'exposed',
  'silence': 'corrupted',
  'poison': 'overheated',
  'sleep': 'lag'
};

// ============ STATUS EFFECT FUNCTIONS ============

/**
 * Get status effect definition by ID
 * @param {string} statusId - The status effect ID (e.g., 'defrag', 'bufferOverflow')
 * @returns {object|null} The status effect definition or null
 */
export function getStatusEffectDef(statusId) {
  // Handle legacy status IDs from old save data
  const mappedId = STATUS_LEGACY_MAP[statusId] || statusId;

  // Try direct lookup by id field
  for (const key in STATUS_EFFECTS) {
    if (STATUS_EFFECTS[key].id === mappedId) {
      return STATUS_EFFECTS[key];
    }
  }

  // Fallback to uppercase key lookup
  const upperKey = mappedId.toUpperCase().replace(/([a-z])([A-Z])/g, '$1_$2');
  return STATUS_EFFECTS[upperKey] || null;
}

/**
 * Apply a status effect to a target (player or enemy)
 * Checks resistance based on the target's stat
 * @param {object} target - The target to apply the effect to
 * @param {string} statusId - The status effect ID
 * @param {number} durationOverride - Optional custom duration
 * @param {boolean} forceApply - Skip resistance check (for effects with their own proc chance)
 * @returns {object} Result with applied/resisted flags
 */
export function applyStatusEffect(target, statusId, durationOverride = null, forceApply = false) {
  const statusDef = getStatusEffectDef(statusId);
  if (!statusDef) {
    return { applied: false, error: 'Unknown status effect' };
  }

  // Initialize statuses array if needed
  if (!target.statuses) {
    target.statuses = [];
  }

  // Check if already has this status - refresh duration instead of stacking
  const existing = target.statuses.find(s => s.id === statusId);
  if (existing) {
    const newDuration = durationOverride || statusDef.duration;
    existing.turnsRemaining = Math.max(existing.turnsRemaining, newDuration);
    return { applied: true, refreshed: true };
  }

  // Check resistance unless forced
  if (!forceApply) {
    // Calculate resistance chance based on stat
    // Each point of the resist stat gives 1% resistance, capped at 95%
    const resistStat = target.stats?.[statusDef.resistStat] || 0;
    const resistChance = Math.min(95, resistStat);
    const resistRoll = Math.random() * 100;

    if (resistRoll < resistChance) {
      return { applied: false, resisted: true, resistChance };
    }
  }

  // Apply the status effect
  const duration = durationOverride || statusDef.duration;
  target.statuses.push({
    id: statusId,
    turnsRemaining: duration,
    ...statusDef
  });

  return { applied: true, resisted: false, duration };
}

/**
 * Check if a target has a specific status effect
 * @param {object} target - The target to check
 * @param {string} statusId - The status effect ID to look for
 * @returns {boolean} True if the target has the status
 */
export function hasStatusEffect(target, statusId) {
  if (!target.statuses || !Array.isArray(target.statuses)) {
    return false;
  }
  return target.statuses.some(s => s.id === statusId);
}

/**
 * Remove a specific status effect from a target
 * @param {object} target - The target to remove the effect from
 * @param {string} statusId - The status effect ID to remove
 * @returns {boolean} True if the effect was removed
 */
export function removeStatusEffect(target, statusId) {
  if (!target.statuses || !Array.isArray(target.statuses)) {
    return false;
  }
  const initialLength = target.statuses.length;
  target.statuses = target.statuses.filter(s => s.id !== statusId);
  return target.statuses.length < initialLength;
}

/**
 * Get all active status effects on a target
 * @param {object} target - The target to check
 * @returns {array} Array of active status effects
 */
export function getActiveStatusEffects(target) {
  if (!target.statuses || !Array.isArray(target.statuses)) {
    return [];
  }
  return target.statuses.filter(s => s.turnsRemaining > 0);
}

/**
 * Break status effects that are removed by damage (like SLEEP)
 * Should be called whenever a target takes damage
 * @param {object} target - The target that took damage
 * @returns {array} Array of broken status effects
 */
export function breakDamageEffects(target) {
  if (!target.statuses || !Array.isArray(target.statuses)) {
    return [];
  }

  const broken = [];
  target.statuses = target.statuses.filter(status => {
    if (status.brokenByDamage) {
      broken.push(status);
      return false;
    }
    return true;
  });

  return broken;
}

/**
 * Tick down status effects at end of turn
 * Applies DoT damage for BLEED and POISON
 * @param {object} target - The player or enemy
 * @returns {object} Result with expired effects and DoT damage
 */
export function tickStatusEffects(target) {
  const result = {
    expired: [],
    dotDamage: 0,
    dotSources: []
  };

  if (!target.statuses || !Array.isArray(target.statuses)) {
    return result;
  }

  target.statuses = target.statuses.filter(status => {
    // Apply DoT damage for effects that have it
    if (status.dotDamage && status.dotDamage > 0) {
      result.dotDamage += status.dotDamage;
      result.dotSources.push({
        id: status.id,
        damage: status.dotDamage
      });
    }

    // Decrement duration
    status.turnsRemaining--;
    if (status.turnsRemaining <= 0) {
      result.expired.push(status);
      return false;
    }
    return true;
  });

  // Apply DoT damage to target
  if (result.dotDamage > 0) {
    target.hp = Math.max(0, target.hp - result.dotDamage);
    result.targetDefeated = target.hp <= 0;
  }

  return result;
}

/**
 * Tick enemy status effects (simpler version without DoT calculation)
 */
export function tickEnemyStatusEffects(enemy) {
  if (!enemy.statuses) {
    enemy.statuses = [];
    return [];
  }

  const expired = [];
  enemy.statuses = enemy.statuses.filter(status => {
    status.turnsRemaining--;
    if (status.turnsRemaining <= 0) {
      expired.push(status);
      return false;
    }
    return true;
  });

  return expired;
}

/**
 * Calculate damage multiplier from status effects (e.g., EXPOSED)
 * @param {object} target - The target receiving damage
 * @returns {number} Damage multiplier (1.0 = normal, 1.5 = 50% more damage)
 */
export function getDamageTakenMultiplier(target) {
  if (!target.statuses || !Array.isArray(target.statuses)) {
    return 1.0;
  }

  let multiplier = 1.0;
  for (const status of target.statuses) {
    if (status.damageTakenMultiplier) {
      multiplier *= status.damageTakenMultiplier;
    }
  }
  return multiplier;
}

/**
 * Get display name for a status effect
 * @param {string} statusId - The status effect ID
 * @param {boolean} japanese - Whether to return Japanese name
 * @returns {string} The display name
 */
export function getStatusDisplayName(statusId, japanese = true) {
  const def = getStatusEffectDef(statusId);
  if (!def) return statusId;
  return japanese ? def.name : def.nameEn;
}
