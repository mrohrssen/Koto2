/**
 * Shared streak logic for Kanji Kombat.
 *
 * This module is browser-safe (mirrors kanji-kombat-xp.js): it does NOT import
 * anything fs-bound.  The two streak milestones whose rewards involve
 * randomness — streak 6 (random stat buff) and streak 12 (random ally join) —
 * are pre-rolled SERVER-SIDE into kk.pendingStreakRewards (see
 * KanjiKombatService.ensurePendingStreakRewards) and consumed VERBATIM here.
 * Ally-join payloads carry the full runtime creature object (all template
 * fields included), so no creature-template lookup is needed at apply time.
 *
 * Used by:
 *  - the server's live submit path and session-log replay path
 *    (kanji-kombat-service.js — recordCorrectAnswer/applyCurrentStreakReward)
 *  - the client's local prediction path (combat-loop.js —
 *    runOptimisticKanjiKombatAnswer)
 * so that all three produce identical party/combat state for the same answer
 * sequence, keeping transcript hashes in sync across live play and replay.
 */
import { applyStatChange } from '../../game/combat/effects.js';
import { addXpToCreatureShared, xpToNextLevel } from './kanji-kombat-xp.js';

export const STREAK_HEAL_REWARDS = {
  3: 0.20,
  9: 0.50,
};
export const STREAK_BUFF_STATS = ['atk', 'def', 'dex'];
// Milestones whose rewards involve randomness and therefore consume a
// pre-rolled payload from kk.pendingStreakRewards.
export const RANDOM_STREAK_REWARD_MILESTONES = [6, 12];

function creatureDisplayName(creature) {
  return creature?.nameEn || creature?.name || creature?.id || 'Ally';
}

export function healAllAllies(allies, percent) {
  for (const ally of allies || []) {
    if (!ally || ally.hp <= 0) continue;
    ally.hp = Math.min(ally.maxHp, ally.hp + Math.ceil(ally.maxHp * percent));
  }
}

/**
 * Lazily creates kk.pendingStreakRewards (queues keyed by milestone streak
 * value) and the monotonic payload sequence counter.  Old saves may lack both.
 */
export function ensurePendingStreakRewardQueues(kk) {
  if (!kk) return null;
  if (!kk.pendingStreakRewards || typeof kk.pendingStreakRewards !== 'object') {
    kk.pendingStreakRewards = {};
  }
  for (const milestone of RANDOM_STREAK_REWARD_MILESTONES) {
    if (!Array.isArray(kk.pendingStreakRewards[milestone])) {
      kk.pendingStreakRewards[milestone] = [];
    }
  }
  if (!Number.isInteger(kk.pendingStreakRewardSeq)) kk.pendingStreakRewardSeq = 0;
  return kk.pendingStreakRewards;
}

function consumePendingStreakReward(kk, milestone) {
  const queue = kk?.pendingStreakRewards?.[milestone];
  if (!Array.isArray(queue) || queue.length === 0) return null;
  return queue.shift();
}

/**
 * Streak 6: apply the pre-rolled stat buff payload ({ allyRoll, stat }) to the
 * living ally selected by the stored roll.  Deterministic given the payload.
 */
function applyStatUpReward(active, payload) {
  if (!payload || payload.type !== 'statUp') return null;
  const livingAllies = (active || []).filter(ally => ally && ally.hp > 0);
  if (livingAllies.length === 0) return null;
  const roll = Number.isFinite(payload.allyRoll)
    ? Math.min(Math.max(payload.allyRoll, 0), 0.999999)
    : 0;
  const ally = livingAllies[Math.floor(roll * livingAllies.length)];
  const stat = STREAK_BUFF_STATS.includes(payload.stat) ? payload.stat : STREAK_BUFF_STATS[0];
  const delta = applyStatChange(ally, stat, 1);
  return {
    type: 'statUp',
    streak: 6,
    allyId: ally.id || null,
    allyName: creatureDisplayName(ally),
    stat,
    delta,
  };
}

/**
 * Streak 12: push the pre-rolled creature into the active party, or full-heal
 * when the party is full / the payload creature is already active / no payload
 * creature was available at roll time.  Deterministic given the payload.
 */
function applyAllyJoinReward(active, payload) {
  const joining = payload?.type === 'allyJoin' ? payload.creature : null;
  const alreadyActive = joining && (active || []).some(c => c && c.id === joining.id);
  if (!joining || (active || []).length >= 3 || alreadyActive) {
    healAllAllies(active, 1);
    return { type: 'fullHeal', streak: 12 };
  }
  const ally = JSON.parse(JSON.stringify(joining));
  active.push(ally);
  return {
    type: 'allyJoined',
    streak: 12,
    allyId: ally.id || null,
    allyName: creatureDisplayName(ally),
  };
}

export function advanceKanjiKombatStreakOnCorrect(kk) {
  kk.streak = (kk.streak || 0) + 1;
  kk.highestStreak = Math.max(kk.highestStreak || 0, kk.streak);
}

export function resetKanjiKombatStreakOnWrong(kk) {
  kk.streak = 0;
}

/**
 * Applies the streak milestone reward for the CURRENT kk.streak value, exactly
 * mirroring the server's reward cadence: team heals at 3/9 (fixed percents),
 * pre-rolled stat buff at 6, pre-rolled ally join (or full heal) at 12, and a
 * party-wide level-up at 15 followed by a streak reset.
 *
 * `addXp` MUST be the browser-safe shared XP routine (the default) on BOTH
 * sides — see kanji-kombat-xp.js::addXpToCreatureShared for why skipping move
 * learning is required for hash parity.
 *
 * Mutates kk and the party in place.  Returns the reward descriptor or null.
 */
export function applyKanjiKombatStreakReward({
  kk,
  creatureParty,
  metaMults = null,
  itemBuffs = null,
  addXp = addXpToCreatureShared,
} = {}) {
  if (!kk) return null;
  const active = creatureParty?.active || [];
  let streakReward = null;

  if (STREAK_HEAL_REWARDS[kk.streak]) {
    const healPercent = STREAK_HEAL_REWARDS[kk.streak];
    healAllAllies(active, healPercent);
    streakReward = { type: 'teamHeal', streak: kk.streak, healPercent };
  }
  if (kk.streak === 6) {
    streakReward = applyStatUpReward(active, consumePendingStreakReward(kk, 6));
  }
  if (kk.streak === 12) {
    streakReward = applyAllyJoinReward(active, consumePendingStreakReward(kk, 12));
  }
  if (kk.streak === 15) {
    const creatures = [
      ...active,
      ...(creatureParty?.reserves || []),
    ].filter(Boolean);
    for (const creature of creatures) {
      creature.level = Math.max(1, creature.level || 1);
      if (!Number.isFinite(creature.xp)) creature.xp = 0;
      addXp(creature, xpToNextLevel(creature.level), metaMults, itemBuffs);
    }
    streakReward = { type: 'partyLevelUp', streak: 15 };
    kk.streak = 0;
  }

  return streakReward;
}

/**
 * Client-side helper: advance the streak for a predicted answer and apply the
 * milestone reward to the local draft state, in the same order the server does
 * (streak counter from recordCorrectAnswer/recordWrongAnswer; reward applied
 * after the turn — and after any deferred kill-XP/wave spawn — by submitAnswer).
 */
export function applyKanjiKombatAnswerStreakProgress({
  kk,
  creatureParty,
  correct,
  metaMults = null,
  itemBuffs = null,
} = {}) {
  if (!kk) return null;
  if (correct !== true) {
    resetKanjiKombatStreakOnWrong(kk);
    return null;
  }
  advanceKanjiKombatStreakOnCorrect(kk);
  return applyKanjiKombatStreakReward({ kk, creatureParty, metaMults, itemBuffs });
}
