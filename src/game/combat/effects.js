/**
 * Combat effects system — poison ticks, healing, effect application.
 * Foundation for Layer 2 archetype combat (used by moves that inflict
 * status effects or restore HP).
 */

/**
 * Process all active effects on a robot at start of a combat round.
 * - Poison: deals damagePerTurn (never reduces HP below 1), decrements remainingTurns
 * - Expired effects (remainingTurns <= 0 after decrement) are removed
 *
 * @param {object} robot - Robot with hp, maxHp, and optional activeEffects[]
 * @returns {object[]} Array of event objects describing what happened
 */
export function tickEffects(robot) {
  if (!robot.activeEffects || robot.activeEffects.length === 0) {
    return [];
  }

  const events = [];

  for (const effect of robot.activeEffects) {
    if (effect.type === 'poison') {
      // Deal damage but never reduce HP below 1 — poison can't kill
      const actualDamage = Math.min(effect.damagePerTurn, robot.hp - 1);
      const damage = Math.max(0, actualDamage);
      robot.hp -= damage;

      effect.remainingTurns -= 1;

      events.push({
        type: 'poison',
        targetId: robot.id,
        targetName: robot.nameEn,
        damage,
        remainingTurns: effect.remainingTurns,
      });
    }
  }

  // Remove expired effects
  robot.activeEffects = robot.activeEffects.filter(e => e.remainingTurns > 0);

  return events;
}

/**
 * Add a poison effect to a target's activeEffects array.
 *
 * @param {object} target - Robot or enemy to poison
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
 * @param {object} target - Robot with hp and maxHp
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

export function applyHeal(target, amount) {
  if (target.hp <= 0) {
    return 0;
  }

  const before = target.hp;
  target.hp = Math.min(target.hp + amount, target.maxHp);
  return target.hp - before;
}
