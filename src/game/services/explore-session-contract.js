import { randomBytes } from 'crypto';

import { isActionId } from '../../shared/action-protocol.js';
import { isNpcBattleRewardResolved } from '../npc-battle-reward.js';

export const EXPLORE_RUNWAY_AHEAD = 5;
export const EXPLORE_LEGACY_REVEAL_AHEAD = 1;
export const EXPLORE_SESSION_HARD_CAP = 50;
export const EXPLORE_SESSION_RESUME_AT = 40;
export const EXPLORE_SYNC_DEBOUNCE_MS = 300;
export const EXPLORE_SYNC_RETRY_DELAYS_MS = Object.freeze([500, 1000, 2000, 4000, 8000, 15000]);

export const EXPLORE_EFFECTS = Object.freeze({
  CREDITS: 'credits',
  INGREDIENTS: 'ingredients',
  PARTY_STATS: 'partyStats',
  PARTY_SKILLS: 'partySkills',
  SRS: 'srs',
  AREA_PROGRESS: 'areaProgress',
});

const ACTION_EFFECTS = Object.freeze({
  proceed: [EXPLORE_EFFECTS.INGREDIENTS, EXPLORE_EFFECTS.AREA_PROGRESS],
  'encounter.start': [],
  'npcBattle.start': [],
  'boss.start': [],
  'combat.cycle': [EXPLORE_EFFECTS.PARTY_STATS],
  'friendlyNpc.choose': [EXPLORE_EFFECTS.PARTY_STATS],
  'shrine.choose': [EXPLORE_EFFECTS.PARTY_STATS],
  'skillMaster.choose': [EXPLORE_EFFECTS.PARTY_SKILLS],
  'npcBattleSkill.choose': [EXPLORE_EFFECTS.PARTY_SKILLS],
  'whackAMole.complete': [EXPLORE_EFFECTS.CREDITS, EXPLORE_EFFECTS.PARTY_STATS],
  'whackAMole.skip': [],
  'campfire.cook': [EXPLORE_EFFECTS.INGREDIENTS],
  'campfire.feed': [EXPLORE_EFFECTS.PARTY_STATS, EXPLORE_EFFECTS.INGREDIENTS],
  'campfire.skip': [],
  'speedReview.commit': [EXPLORE_EFFECTS.SRS, EXPLORE_EFFECTS.PARTY_STATS],
  'speedReview.complete': [EXPLORE_EFFECTS.SRS, EXPLORE_EFFECTS.PARTY_STATS],
  'wordDiscovery.review': [EXPLORE_EFFECTS.SRS],
  'wordDiscovery.complete': [EXPLORE_EFFECTS.CREDITS, EXPLORE_EFFECTS.PARTY_STATS],
  'dealer.sell': [EXPLORE_EFFECTS.CREDITS],
  'dealer.buy': [EXPLORE_EFFECTS.CREDITS, EXPLORE_EFFECTS.PARTY_STATS],
  'dealer.leave': [],
});

const SUPPORT_ACTIONS = Object.freeze({
  friendlyNpc: ['friendlyNpc.choose', 'proceed'],
  shrine: ['shrine.choose', 'proceed'],
  skillMaster: ['skillMaster.choose', 'proceed'],
  whackAMole: ['whackAMole.complete', 'whackAMole.skip', 'proceed'],
  campfire: ['campfire.cook', 'campfire.feed', 'campfire.skip', 'proceed'],
  speedReviewRoom: ['speedReview.commit', 'speedReview.complete', 'proceed'],
  wordDiscovery: ['wordDiscovery.review', 'wordDiscovery.complete', 'proceed'],
  dealer: ['dealer.sell', 'dealer.buy', 'dealer.leave', 'proceed'],
});

const COMBAT_START_ACTION = Object.freeze({
  encounter: 'encounter.start',
  npcBattle: 'npcBattle.start',
  boss: 'boss.start',
});

const ROOM_DEPENDENCIES = Object.freeze({
  // Combat rooms are pre-rolled (prepareCombatStart pins the ENEMIES + seed chain
  // onto the prepared payload), so a queued earlier-room roll-affecting effect no
  // longer invalidates them — the enemy roll is fixed at prepare time. Same
  // rationale as Kanji Kombat's pre-rolled wave.
  //
  // But the roll pins only the enemies. The ALLY-side stats (level/xp/attack/
  // defense/dex/hp/mp — every field in buildStateSummary) still feed the hashed
  // per-turn transcript, and a support-room PARTY_STATS effect queued AHEAD of the
  // fight (shrine blessing, friendlyNpc stat item) mutates them on the server's
  // replay but NOT on the client's offline optimistic path (the client only flags
  // the room complete — exploration.js chooseShrineReward / applyItem). If the
  // fight is then built offline against un-boosted allies, its first combat.cycle
  // hash forks from the server's post-shrine replay → transcript_mismatch
  // (task-12e attempt B, seq 7). Mirroring the stat mutation client-side is
  // impractical: the mutations live in server-only modules that read data files at
  // import (creatures.js addXpToCreature via CREATURES_BY_ID/learnset;
  // item-service.js applyItem), so they are not browser-importable without a large
  // extraction. Instead, declare the honest dependency: a PARTY_STATS effect
  // pending ahead of a combat room makes the PROCEED into it pause
  // (`dependency`) until the reconnect drain lands the effect server-side and the
  // refreshed runway snapshots the boosted allies into combatStart.allies. The
  // fight then starts against authoritative stats. Degrades offline continuity at
  // the support→combat seam (an honest reconnect pause) rather than shipping a
  // silent divergence.
  encounter: [EXPLORE_EFFECTS.PARTY_STATS],
  boss: [EXPLORE_EFFECTS.PARTY_STATS],
  npcBattle: [EXPLORE_EFFECTS.PARTY_STATS],
  campfire: [EXPLORE_EFFECTS.INGREDIENTS, EXPLORE_EFFECTS.PARTY_STATS],
  dealer: [EXPLORE_EFFECTS.CREDITS],
  speedReviewRoom: [EXPLORE_EFFECTS.SRS],
  wordDiscovery: [EXPLORE_EFFECTS.SRS],
  friendlyNpc: [],
  shrine: [EXPLORE_EFFECTS.PARTY_STATS],
  skillMaster: [EXPLORE_EFFECTS.PARTY_SKILLS],
  whackAMole: [],
  room: [],
});

const EXPLORE_SESSION_EPOCH_PATTERN = /^ese_[0-9a-f]{16}$/;

export function cloneExploreValue(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function createExploreSessionEpoch() {
  return `ese_${randomBytes(8).toString('hex')}`;
}

/**
 * EPOCH CONTRACT — explore session epochs mark RELOAD boundaries ONLY.
 *
 * The epoch scopes the client's offline-queued session log: entries are stamped
 * with the epoch they were recorded under, and applySessionSync rejects a batch
 * whose epoch does not match the run's current epoch (`session_epoch_mismatch`,
 * a corrected sync).
 *
 * - ensureExploreSessionEpoch — create-if-absent, NEVER rotates. The correct
 *   call for every IN-SESSION touch point (runway builds mid-run, and
 *   `GET /state?adoptSession=1` in-session state reloads): the client may still
 *   hold queued entries under the current epoch, and rotating would strand them.
 * - rotateExploreSessionEpoch — declares a NEW reload boundary. Correct ONLY on
 *   a true boot/reload (a bare `GET /state`, src/routes/game/state.js), where
 *   losing the unsynced offline log is BY DESIGN. Never call this while a live
 *   client may have pending session entries — the drain→rotate→adopt race turns
 *   each of them into a rejected `session_epoch_mismatch` correction.
 */
export function ensureExploreSessionEpoch(run) {
  if (!run || typeof run !== 'object') return null;
  if (!EXPLORE_SESSION_EPOCH_PATTERN.test(run.exploreSessionEpoch)) {
    run.exploreSessionEpoch = createExploreSessionEpoch();
  }
  return run.exploreSessionEpoch;
}

export function rotateExploreSessionEpoch(run) {
  if (!run || typeof run !== 'object') return null;
  run.exploreSessionEpoch = createExploreSessionEpoch();
  return run.exploreSessionEpoch;
}

export function isExploreSessionActionId(actionId) {
  return typeof actionId === 'string'
    && actionId.startsWith('run_es_')
    && isActionId(actionId);
}

export function validateExploreSessionBatch(entries) {
  if (!Array.isArray(entries)) {
    return { ok: false, reason: 'invalid_explore_batch', rejectedSeq: null };
  }
  if (entries.length === 0) {
    return { ok: false, reason: 'empty_explore_batch', rejectedSeq: null };
  }

  const actionIds = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!Number.isInteger(entry?.seq) || entry.seq <= 0) {
      return { ok: false, reason: 'invalid_explore_seq', rejectedSeq: entry?.seq ?? null };
    }
    if (index > 0 && entry.seq !== entries[index - 1].seq + 1) {
      return { ok: false, reason: 'non_contiguous_explore_seq', rejectedSeq: entry.seq };
    }
    if (!isExploreSessionActionId(entry?.actionId)) {
      return { ok: false, reason: 'invalid_explore_action_id', rejectedSeq: entry.seq };
    }
    if (actionIds.has(entry.actionId)) {
      return { ok: false, reason: 'duplicate_explore_action_id', rejectedSeq: entry.seq };
    }
    actionIds.add(entry.actionId);
  }

  return { ok: true };
}

export function acceptedExploreActionsForRoom(
  room,
  {
    combat = null,
    isCurrentRoom = false,
    includeProjectedCombatCycle = false,
  } = {},
) {
  const support = SUPPORT_ACTIONS[room?.type];
  if (support) return [...support];

  const startAction = COMBAT_START_ACTION[room?.type];
  if (!startAction) return ['proceed'];
  if (isCurrentRoom && combat?.active) return ['combat.cycle'];

  if (room?.interacted) {
    if (room.type !== 'npcBattle') return ['proceed'];
    if (isNpcBattleRewardResolved(room)) return ['proceed'];
    if (room.npcBattle?.skillSelectionPending === true) {
      return ['npcBattleSkill.choose'];
    }
    return [];
  }

  return includeProjectedCombatCycle
    ? [startAction, 'combat.cycle']
    : [startAction];
}

export function predictedEffectsForAction(kind) {
  return [...(ACTION_EFFECTS[kind] ?? [])];
}

export function roomDependenciesForType(type) {
  return [...(ROOM_DEPENDENCIES[type] ?? [])];
}

export function expectedActionSeqForEntry({ baseActionSeq, localProceedCount } = {}) {
  const base = Number.isInteger(baseActionSeq) && baseActionSeq >= 0 ? baseActionSeq : 0;
  const proceeds = Number.isInteger(localProceedCount) && localProceedCount >= 0 ? localProceedCount : 0;
  return base + proceeds;
}

export function makeExploreCorrection({
  reason = 'explore_session_corrected',
  rejectedSeq = null,
  confirmedThroughSeq = null,
  results = [],
  state = null,
  exploreRunway = null,
} = {}) {
  return {
    status: 'corrected',
    confirmedThroughSeq,
    rejectedSeq,
    reason,
    results,
    state,
    authoritativeState: state,
    exploreRunway,
  };
}

export function makeExploreOk({
  confirmedThroughSeq = null,
  results = [],
  state = null,
  exploreRunway = null,
} = {}) {
  return {
    status: 'ok',
    confirmedThroughSeq,
    rejectedSeq: null,
    reason: null,
    results,
    state,
    exploreRunway,
  };
}
