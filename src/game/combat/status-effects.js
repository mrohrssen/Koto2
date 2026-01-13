/**
 * Status Effects System
 * Defines status effects and provides functions for applying/managing them
 */

// ============ STATUS EFFECTS DEFINITIONS ============

/**
 * Status effects that can be applied to players and enemies
 * resistStat: The stat used to resist this effect (higher = more resistance)
 * dotDamage: Damage per turn for DoT effects
 * skipTurn: Whether this effect causes the target to skip their turn
 * hitPenalty: Accuracy reduction percentage for the affected target
 * blockMagic: Whether this effect prevents casting magic
 * brokenByDamage: Whether taking damage removes this effect
 */
export const STATUS_EFFECTS = {
  BLEED: {
    id: 'bleed',
    resistStat: 'agi',
    dotDamage: 5,
    duration: 2,
    description: 'Takes damage each turn'
  },
  STUN: {
    id: 'stun',
    resistStat: 'vit',
    skipTurn: true,
    duration: 1,
    description: 'Cannot act'
  },
  BLIND: {
    id: 'blind',
    resistStat: 'int',
    hitPenalty: 50,
    duration: 2,
    description: 'Reduced accuracy'
  },
  SILENCE: {
    id: 'silence',
    resistStat: 'int',
    blockMagic: true,
    duration: 2,
    description: 'Cannot use magic'
  },
  POISON: {
    id: 'poison',
    resistStat: 'vit',
    dotDamage: 8,
    duration: 3,
    description: 'Takes poison damage each turn'
  },
  SLEEP: {
    id: 'sleep',
    resistStat: 'agi',
    skipTurn: true,
    brokenByDamage: true,
    duration: 2,
    description: 'Cannot act, wakes on damage'
  }
};

// ============ STATUS EFFECT FUNCTIONS ============

/**
 * Get status effect definition by ID
 * @param {string} statusId - The status effect ID (e.g., 'bleed', 'stun')
 * @returns {object|null} The status effect definition or null
 */
export function getStatusEffectDef(statusId) {
  const upperKey = statusId.toUpperCase();
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
