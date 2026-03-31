/**
 * Combat effects system — poison ticks, healing, effect application.
 * Foundation for Layer 2 archetype combat (used by moves that inflict
 * status effects or restore HP).
 */

/**
 * Process all active effects on a creature at start of a combat round.
 * - Poison: deals damagePerTurn (never reduces HP below 1), decrements remainingTurns
 * - Expired effects (remainingTurns <= 0 after decrement) are removed
 *
 * @param {object} creature - Creature with hp, maxHp, and optional activeEffects[]
 * @returns {object[]} Array of event objects describing what happened
 */
export function tickEffects(creature) {
  if (!creature.activeEffects || creature.activeEffects.length === 0) {
    return [];
  }

  const events = [];

  for (const effect of creature.activeEffects) {
    if (effect.type === 'poison') {
      // Deal damage but never reduce HP below 1 — poison can't kill
      const actualDamage = Math.min(effect.damagePerTurn, creature.hp - 1);
      const damage = Math.max(0, actualDamage);
      creature.hp -= damage;
      effect.remainingTurns -= 1;
      events.push({
        type: 'poison',
        targetId: creature.id,
        targetName: creature.nameEn,
        damage,
        remainingTurns: effect.remainingTurns,
      });
    } else if (effect.type === 'haste') {
      // Haste has no remainingTurns — consumed on use, not on tick
      continue;
    } else if (effect.remainingTurns !== undefined) {
      // All other turn-based effects: decrement
      effect.remainingTurns -= 1;
      events.push({
        type: effect.type + '_tick',
        targetId: creature.id,
        targetName: creature.nameEn,
        remainingTurns: effect.remainingTurns,
      });
    }
  }

  // Remove expired effects (remainingTurns <= 0), keep haste (no remainingTurns)
  creature.activeEffects = creature.activeEffects.filter(
    e => e.remainingTurns === undefined || e.remainingTurns > 0
  );

  return events;
}

/**
 * Add a poison effect to a target's activeEffects array.
 *
 * @param {object} target - Creature or enemy to poison
 * @param {object} opts
 * @param {number} opts.damagePerTurn - HP lost per tick
 * @param {number} opts.duration - Number of rounds the poison lasts
 * @param {string} opts.sourceId - ID of the attacker that applied this poison
 */
export function applyPoison(target, { damagePerTurn, duration, sourceId }) {
  if (!target.activeEffects) {
    target.activeEffects = [];
  }

  target.activeEffects.push({
    type: 'poison',
    damagePerTurn,
    remainingTurns: duration,
    sourceId,
  });
}

/**
 * Restore HP to a target, capped at maxHp. Does nothing if target is KO'd (hp <= 0).
 *
 * @param {object} target - Creature with hp and maxHp
 * @param {number} amount - HP to restore
 * @returns {number} Actual HP restored (may be less than amount if near max, or 0 if KO'd)
 */
/**
 * Apply or refresh a status effect on a target. If the target already has
 * the same effect type, refresh its duration instead of stacking.
 */
function applyOrRefresh(target, effect) {
  if (!target.activeEffects) {
    target.activeEffects = [];
  }
  const existing = target.activeEffects.find(e => e.type === effect.type);
  if (existing) {
    existing.remainingTurns = effect.remainingTurns;
    existing.sourceId = effect.sourceId;
    if (effect.percent !== undefined) existing.percent = effect.percent;
  } else {
    target.activeEffects.push(effect);
  }
}

export function applySleep(target, { duration = 2, sourceId }) {
  applyOrRefresh(target, { type: 'sleep', remainingTurns: duration, sourceId });
}

export function applyStun(target, { sourceId }) {
  applyOrRefresh(target, { type: 'stun', remainingTurns: 1, sourceId });
}

export function applyConfuse(target, { duration = 2, sourceId }) {
  applyOrRefresh(target, { type: 'confuse', remainingTurns: duration, sourceId });
}

// Legacy applyAttackBuff/applyDefenseBuff removed — replaced by stat stages below.

export function applyHaste(target, { sourceId }) {
  if (!target.activeEffects) {
    target.activeEffects = [];
  }
  // Haste has no remainingTurns — consumed on use
  const existing = target.activeEffects.find(e => e.type === 'haste');
  if (!existing) {
    target.activeEffects.push({ type: 'haste', sourceId });
  }
}

export function applyShield(target, { percent, duration = 2, sourceId }) {
  applyOrRefresh(target, { type: 'shield', percent, remainingTurns: duration, sourceId });
}

export function applyTeamShield(allies, { percent, duration = 2, sourceId }) {
  for (const ally of allies) {
    if (ally.hp > 0) {
      applyOrRefresh(ally, { type: 'team_shield', percent, remainingTurns: duration, sourceId });
    }
  }
}

// Legacy applyAttackDebuff removed — replaced by stat stages below.

export function applyTaunt(target, { duration = 2, sourceId }) {
  applyOrRefresh(target, { type: 'taunt', remainingTurns: duration, sourceId });
}

export function applyHeal(target, amount) {
  if (target.hp <= 0) {
    return 0;
  }

  const before = target.hp;
  target.hp = Math.min(target.hp + amount, target.maxHp);
  return target.hp - before;
}

// ── Stat Stages (PokeRogue-style) ─────────────────────────────────
// Integer stages -6 to +6 per stat. Stored on creature.statStages, NOT in activeEffects.
// Stages accumulate (not refresh), persist until combat end, reset at battle start.

const STAGE_MIN = -6;
const STAGE_MAX = 6;

/** Initialize statStages on a creature if missing. */
export function initStatStages(creature) {
  if (!creature.statStages) {
    creature.statStages = { atk: 0, def: 0 };
  }
}

/** Reset all stat stages to 0 (call at combat start). */
export function resetStatStages(creature) {
  creature.statStages = { atk: 0, def: 0 };
}

/**
 * Apply a stat stage change, clamping to [STAGE_MIN, STAGE_MAX].
 * @returns {number} Actual change applied (0 if already at cap).
 */
export function applyStatChange(creature, stat, amount) {
  initStatStages(creature);
  const before = creature.statStages[stat] || 0;
  creature.statStages[stat] = Math.max(STAGE_MIN, Math.min(STAGE_MAX, before + amount));
  return creature.statStages[stat] - before;
}

/**
 * Apply multiple stat changes from a move's statChanges object.
 * @param {object} creature
 * @param {object} statChanges - e.g. { atk: 1, def: -1 }
 * @returns {object} Map of stat -> actual change applied
 */
export function applyStatChanges(creature, statChanges) {
  const results = {};
  for (const [stat, amount] of Object.entries(statChanges)) {
    results[stat] = applyStatChange(creature, stat, amount);
  }
  return results;
}

/**
 * Get the multiplier for a stat based on its stage.
 * Formula: max(2, 2+stage) / max(2, 2-stage)
 * +1 = 1.5x, +6 = 4.0x, -1 = 0.667x, -6 = 0.25x
 */
export function getStageMultiplier(creature, stat) {
  const stage = creature.statStages?.[stat] || 0;
  return Math.max(2, 2 + stage) / Math.max(2, 2 - stage);
}

// ── Query helpers ──────────────────────────────────────────────────

export function isIncapacitated(creature) {
  if (!creature.activeEffects) return false;
  return creature.activeEffects.some(e => e.type === 'sleep' || e.type === 'stun');
}

export function isConfused(creature) {
  if (!creature.activeEffects) return false;
  return creature.activeEffects.some(e => e.type === 'confuse');
}

export function hasHaste(creature) {
  if (!creature.activeEffects) return false;
  return creature.activeEffects.some(e => e.type === 'haste');
}

export function consumeHaste(creature) {
  if (!creature.activeEffects) return;
  creature.activeEffects = creature.activeEffects.filter(e => e.type !== 'haste');
}

export function getAttackMultiplier(creature) {
  return getStageMultiplier(creature, 'atk');
}

export function getDefenseMultiplier(creature) {
  return getStageMultiplier(creature, 'def');
}

export function getDamageReduction(creature) {
  if (!creature.activeEffects) return 0;
  const totalPercent = creature.activeEffects
    .filter(e => e.type === 'shield' || e.type === 'team_shield')
    .reduce((sum, e) => sum + e.percent, 0);
  return Math.min(totalPercent, 90);
}

export function getTauntTarget(allies) {
  const taunter = allies.find(a => a.hp > 0 && a.activeEffects?.some(e => e.type === 'taunt'));
  return taunter || null;
}

export function breakSleep(target) {
  if (!target.activeEffects) return;
  target.activeEffects = target.activeEffects.filter(e => e.type !== 'sleep');
}

export function applyTempAttackFlat(target, { value, duration, sourceId }) {
  if (!target.activeEffects) {
    target.activeEffects = [];
  }
  // Stack additively — each application is a separate effect
  target.activeEffects.push({
    type: 'temp_attack_flat',
    value,
    remainingTurns: duration,
    sourceId,
  });
}

export function getFlatAttackBonus(creature) {
  if (!creature.activeEffects) return 0;
  return creature.activeEffects
    .filter(e => e.type === 'temp_attack_flat')
    .reduce((sum, e) => sum + e.value, 0);
}
