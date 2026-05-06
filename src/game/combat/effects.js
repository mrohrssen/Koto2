/**
 * Process all active effects on a creature at start of a combat round.
 * - Poison: deals damagePerTurn and can KO, decrements remainingTurns
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
      const damage = Math.max(0, Math.min(effect.damagePerTurn, creature.hp));
      creature.hp = Math.max(0, creature.hp - damage);
      effect.remainingTurns -= 1;
      events.push({
        type: 'poison',
        targetId: creature.id,
        targetName: creature.nameEn,
        damage,
        remainingTurns: effect.remainingTurns,
        targetDefeated: creature.hp <= 0,
        sourceId: effect.sourceId,
      });
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

  // Remove expired effects (remainingTurns <= 0).
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

export function applyTaunt(target, { duration = 2, sourceId }) {
  applyOrRefresh(target, { type: 'taunt', remainingTurns: duration, sourceId });
}

export function applyCleanse(target) {
  if (!target.activeEffects) return;
  const negative = new Set(['poison', 'sleep', 'stun', 'confuse']);
  target.activeEffects = target.activeEffects.filter(effect => !negative.has(effect.type));
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
const STAT_STAGE_DEFAULTS = { atk: 0, def: 0, dex: 0 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Initialize statStages on a creature if missing. */
export function initStatStages(creature) {
  creature.statStages = { ...STAT_STAGE_DEFAULTS, ...(creature.statStages || {}) };
}

/** Reset all stat stages to 0 (call at combat start). */
export function resetStatStages(creature) {
  creature.statStages = { ...STAT_STAGE_DEFAULTS };
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

export function getAttackMultiplier(creature) {
  return getStageMultiplier(creature, 'atk');
}

export function getDefenseMultiplier(creature) {
  return getStageMultiplier(creature, 'def');
}

export function getDexMultiplier(creature) {
  return getStageMultiplier(creature, 'dex');
}

export function getEffectiveDex(creature) {
  const dex = Math.max(1, Math.round(Number(creature?.dex) || 1));
  return Math.max(1, Math.round(dex * getDexMultiplier(creature)));
}

export function computeCritChance(creature) {
  return clamp((getEffectiveDex(creature) + 8) / 256, 0.03, 0.25);
}

export function rollCritical(creature, rng = Math.random) {
  const critChance = computeCritChance(creature);
  return { critical: rng() < critChance, critChance };
}

export function computeDexHitChance(attacker, defender) {
  const attackerDexStage = attacker?.statStages?.dex || 0;
  const defenderDexStage = defender?.statStages?.dex || 0;
  const stageDelta = clamp(attackerDexStage - defenderDexStage, STAGE_MIN, STAGE_MAX);
  const rawHitChance = Math.max(3, 3 + stageDelta) / Math.max(3, 3 - stageDelta);
  const hitChance = clamp(rawHitChance, 0.70, 1.00);
  const dodgeChance = Number((1 - hitChance).toFixed(4));
  return { hitChance, dodgeChance, stageDelta };
}

export function rollDodge(attacker, defender, rng = Math.random) {
  const result = computeDexHitChance(attacker, defender);
  return { ...result, dodged: rng() < result.dodgeChance };
}

export function getTauntTarget(allies) {
  const taunter = allies.find(a => a.hp > 0 && a.activeEffects?.some(e => e.type === 'taunt'));
  return taunter || null;
}

export function breakSleep(target) {
  if (!target.activeEffects) return;
  target.activeEffects = target.activeEffects.filter(e => e.type !== 'sleep');
}
