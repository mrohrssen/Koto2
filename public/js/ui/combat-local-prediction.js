import { applyKillXpToParty } from '../../../src/shared/combat/kanji-kombat-xp.js';
import { createSeededRng } from '../../../src/shared/deterministic-rng.js';

/**
 * Shared local-prediction helpers for optimistically-applied PvE combat turns.
 *
 * Both the Kanji Kombat answer path and the explore-session combat.cycle path
 * apply a predicted turn to a deep-cloned game-state draft, then need to (a)
 * advance the pre-committed turn-seed chain exactly as the server's
 * advanceTurnSeeds does, and (b) mirror the server's deferred kill-XP award for
 * enemies newly defeated by THIS turn's ally attacks. These two helpers are the
 * game-mode-agnostic core of that work, extracted verbatim from the KK versions
 * so both callers share one implementation.
 */

/**
 * Advance the local turn-seed chain after a predicted turn is applied.
 * Mirrors the server's advanceTurnSeeds: shift the head to the next prepared
 * seed and bump stateVersion. Mutates the optimistic sub-object in place (the
 * caller owns a deep clone of the state).
 *
 * @param {object} state - The local game state draft (deep-cloned by caller).
 */
export function advanceLocalChain(state) {
  const optimistic = state?.combat?.optimistic;
  if (!optimistic) return;
  const seeds = Array.isArray(optimistic.turnSeeds) ? optimistic.turnSeeds.slice(1) : [];
  optimistic.turnSeeds = seeds;
  optimistic.nextTurnSeed = seeds[0] || null;
  optimistic.stateVersion = (optimistic.stateVersion || 0) + 1;
}

/**
 * Apply deferred kill-XP for enemies newly defeated by THIS turn's ally attacks,
 * immediately after the turn — mirroring the server's _collectDeferredKillXpEvents
 * (combat-cycle-service.js), which runs after EVERY turn resolved with
 * deferXpAwards:true. Mid-fight kills in multi-enemy waves must level/restore the
 * party here too, or the next transcript hash diverges from the server's (ally
 * hp/level/xp are part of the hashed stateSummary).
 * Mutates `state` in place (caller owns a deep clone).
 *
 * @param {object} state - The local game state (deep-cloned by caller).
 * @param {object} transcript - The predicted turn transcript (actionSegments carry
 *   targetDefeated markers on ally attack records and nested procs).
 * @param {string} seed - The turn seed; reproduces the server's
 *   `xpRng = createSeededRng(\`${seed}:xp\`)` so XP awards match exactly.
 */
export function applyLocalDeferredKillXp(state, transcript, seed) {
  if (!state?.combat || !state.run?.creatureParty) return;
  const enemies = state.combat.enemies || [];
  // Mirror the server's visit order: ally action segments' attack records first,
  // recursing into partySkillProcs/procs; dedupe by enemy index.
  const defeatedIndices = new Set();
  const visit = (record) => {
    if (!record || typeof record !== 'object') return;
    if (record.targetDefeated === true && typeof record.targetIndex === 'number') {
      defeatedIndices.add(record.targetIndex);
    }
    for (const proc of record.partySkillProcs || []) visit(proc);
    for (const proc of record.procs || []) visit(proc);
  };
  for (const segment of transcript?.actionSegments || []) {
    if (segment?.actor?.side !== 'ally') continue;
    for (const attack of segment.attacks || []) visit(attack);
  }
  if (defeatedIndices.size === 0) return;

  const xpRng = seed ? createSeededRng(`${seed}:xp`) : Math.random;
  const metaMults = state.run.crestMults || null;
  const itemBuffs = state.run.itemBuffs || null;
  const runPartySkills = state.run.partySkills || [];
  for (const enemyIndex of defeatedIndices) {
    const enemy = enemies[enemyIndex];
    if (!enemy) continue;
    applyKillXpToParty(
      state.run.creatureParty,
      enemy.level || 1,
      itemBuffs?.xpMultiplier,
      itemBuffs?.xpBalanceStacks,
      metaMults,
      itemBuffs,
      runPartySkills,
      xpRng,
    );
  }
  // Keep combat.allies in sync with creatureParty.active (mirrors the server's
  // combat.allies reassignment after a resolved turn).
  state.combat.allies = state.run.creatureParty.active;
}
