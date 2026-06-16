import { randomBytes } from 'crypto';

import { isActionId } from '../../shared/action-protocol.js';

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
  'friendlyNpc.choose': [EXPLORE_EFFECTS.PARTY_STATS],
  'shrine.choose': [EXPLORE_EFFECTS.PARTY_STATS],
  'skillMaster.choose': [EXPLORE_EFFECTS.PARTY_SKILLS],
  'npcBattleSkill.choose': [EXPLORE_EFFECTS.PARTY_SKILLS],
  'whackAMole.complete': [EXPLORE_EFFECTS.CREDITS],
  'whackAMole.skip': [],
  'campfire.cook': [EXPLORE_EFFECTS.INGREDIENTS],
  'campfire.feed': [EXPLORE_EFFECTS.PARTY_STATS, EXPLORE_EFFECTS.INGREDIENTS],
  'campfire.skip': [],
  'speedReview.commit': [EXPLORE_EFFECTS.SRS, EXPLORE_EFFECTS.PARTY_STATS],
  'speedReview.complete': [EXPLORE_EFFECTS.SRS, EXPLORE_EFFECTS.PARTY_STATS],
  'wordDiscovery.review': [EXPLORE_EFFECTS.SRS],
  'wordDiscovery.complete': [],
  'dealer.sell': [EXPLORE_EFFECTS.CREDITS],
  'dealer.buy': [EXPLORE_EFFECTS.CREDITS, EXPLORE_EFFECTS.PARTY_STATS],
  'dealer.leave': [],
});

const ROOM_DEPENDENCIES = Object.freeze({
  encounter: [EXPLORE_EFFECTS.PARTY_STATS, EXPLORE_EFFECTS.PARTY_SKILLS],
  boss: [EXPLORE_EFFECTS.PARTY_STATS, EXPLORE_EFFECTS.PARTY_SKILLS],
  npcBattle: [EXPLORE_EFFECTS.PARTY_STATS, EXPLORE_EFFECTS.PARTY_SKILLS],
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
