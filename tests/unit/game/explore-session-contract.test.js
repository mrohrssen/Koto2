import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPLORE_EFFECTS,
  EXPLORE_LEGACY_REVEAL_AHEAD,
  EXPLORE_RUNWAY_AHEAD,
  EXPLORE_SESSION_HARD_CAP,
  EXPLORE_SESSION_RESUME_AT,
  EXPLORE_SYNC_DEBOUNCE_MS,
  EXPLORE_SYNC_RETRY_DELAYS_MS,
  acceptedExploreActionsForRoom,
  cloneExploreValue,
  createExploreSessionEpoch,
  ensureExploreSessionEpoch,
  expectedActionSeqForEntry,
  isExploreSessionActionId,
  makeExploreCorrection,
  makeExploreOk,
  predictedEffectsForAction,
  roomDependenciesForType,
  rotateExploreSessionEpoch,
  validateExploreSessionBatch,
} from '../../../src/game/services/explore-session-contract.js';

test('exports runway and client log limits', () => {
  assert.equal(EXPLORE_RUNWAY_AHEAD, 5);
  assert.equal(EXPLORE_LEGACY_REVEAL_AHEAD, 1);
  assert.equal(EXPLORE_SESSION_HARD_CAP, 50);
  assert.equal(EXPLORE_SESSION_RESUME_AT, 40);
  assert.equal(EXPLORE_SYNC_DEBOUNCE_MS, 300);
  assert.deepEqual(EXPLORE_SYNC_RETRY_DELAYS_MS, [500, 1000, 2000, 4000, 8000, 15000]);
  assert.equal(Object.isFrozen(EXPLORE_SYNC_RETRY_DELAYS_MS), true);
});

test('exports frozen effect tags', () => {
  assert.equal(Object.isFrozen(EXPLORE_EFFECTS), true);
  assert.deepEqual(EXPLORE_EFFECTS, {
    CREDITS: 'credits',
    INGREDIENTS: 'ingredients',
    PARTY_STATS: 'partyStats',
    PARTY_SKILLS: 'partySkills',
    SRS: 'srs',
    AREA_PROGRESS: 'areaProgress',
  });
});

test('clones explore values without losing undefined', () => {
  assert.equal(cloneExploreValue(undefined), undefined);

  const source = {
    room: { type: 'dealer' },
    preparedRooms: [{ type: 'campfire' }],
  };
  const cloned = cloneExploreValue(source);

  assert.deepEqual(cloned, source);
  assert.notEqual(cloned, source);
  assert.notEqual(cloned.room, source.room);
  assert.notEqual(cloned.preparedRooms, source.preparedRooms);
  assert.notEqual(cloned.preparedRooms[0], source.preparedRooms[0]);
});

test('creates and preserves explore session epochs', () => {
  const run = {};

  const epoch = ensureExploreSessionEpoch(run);
  assert.match(epoch, /^ese_[0-9a-f]{16}$/);
  assert.equal(ensureExploreSessionEpoch(run), epoch);

  const nextEpoch = createExploreSessionEpoch();
  assert.match(nextEpoch, /^ese_[0-9a-f]{16}$/);
  assert.notEqual(nextEpoch, epoch);
});

test('rotates explore session epochs', () => {
  const run = { exploreSessionEpoch: createExploreSessionEpoch() };
  const previousEpoch = run.exploreSessionEpoch;

  const nextEpoch = rotateExploreSessionEpoch(run);

  assert.match(nextEpoch, /^ese_[0-9a-f]{16}$/);
  assert.equal(run.exploreSessionEpoch, nextEpoch);
  assert.notEqual(nextEpoch, previousEpoch);
});

test('validates session action ids', () => {
  assert.equal(isExploreSessionActionId('run_es_00000001'), true);
  assert.equal(isExploreSessionActionId('bad'), false);
  assert.equal(isExploreSessionActionId('__proto__'), false);
});

test('validates the whole explore session batch shape before replay', () => {
  const valid = (seq, actionId) => ({ seq, actionId });

  assert.deepEqual(validateExploreSessionBatch(null), {
    ok: false,
    reason: 'invalid_explore_batch',
    rejectedSeq: null,
  });
  assert.deepEqual(validateExploreSessionBatch([]), {
    ok: false,
    reason: 'empty_explore_batch',
    rejectedSeq: null,
  });
  assert.deepEqual(validateExploreSessionBatch([
    valid(1, 'run_es_batch0001'),
    valid(2, 'run_es_batch0002'),
  ]), { ok: true });
  assert.deepEqual(validateExploreSessionBatch([
    valid(17, 'run_es_batch0017'),
    valid(18, 'run_es_batch0018'),
  ]), { ok: true });

  for (const [entries, reason, rejectedSeq] of [
    [[valid(2, 'run_es_batch0011'), valid(1, 'run_es_batch0012')], 'non_contiguous_explore_seq', 1],
    [[valid(1, 'run_es_batch0021'), valid(1, 'run_es_batch0022')], 'non_contiguous_explore_seq', 1],
    [[valid(1, 'run_es_batch0031'), valid(3, 'run_es_batch0032')], 'non_contiguous_explore_seq', 3],
    [[valid(0, 'run_es_batch0041')], 'invalid_explore_seq', 0],
    [[valid(1, 'bad')], 'invalid_explore_action_id', 1],
    [[valid(1, 'run_es_batch0051'), valid(2, 'run_es_batch0051')], 'duplicate_explore_action_id', 2],
  ]) {
    assert.deepEqual(
      validateExploreSessionBatch(entries),
      { ok: false, reason, rejectedSeq },
    );
  }
});

test('derives canonical accepted actions from the live room lifecycle', () => {
  const boss = { id: 'boss-1', type: 'boss', interacted: false };
  assert.deepEqual(acceptedExploreActionsForRoom(boss, {
    isCurrentRoom: true,
    includeProjectedCombatCycle: true,
  }), ['boss.start', 'combat.cycle']);
  assert.deepEqual(acceptedExploreActionsForRoom(boss, {
    isCurrentRoom: true,
  }), ['boss.start']);
  assert.deepEqual(acceptedExploreActionsForRoom(boss, {
    combat: { active: true },
    isCurrentRoom: true,
  }), ['combat.cycle']);
  boss.interacted = true;
  assert.deepEqual(acceptedExploreActionsForRoom(boss, {
    isCurrentRoom: true,
  }), ['proceed']);

  for (const type of ['encounter', 'npcBattle']) {
    assert.deepEqual(acceptedExploreActionsForRoom({ type, interacted: false }), [
      `${type}.start`,
    ]);
  }

  const npc = {
    id: 'npc-1',
    type: 'npcBattle',
    interacted: true,
    npcBattle: { skillSelectionPending: true },
  };
  assert.deepEqual(acceptedExploreActionsForRoom(npc), ['npcBattleSkill.choose']);
  npc.npcBattle.skillSelectionPending = false;
  assert.deepEqual(acceptedExploreActionsForRoom(npc), ['proceed']);
  npc.npcBattle = { chosenSkillId: 'hpMaster' };
  assert.deepEqual(acceptedExploreActionsForRoom(npc), ['proceed']);
  npc.npcBattle = { rewardResolved: false };
  assert.deepEqual(acceptedExploreActionsForRoom(npc), []);

  assert.deepEqual(acceptedExploreActionsForRoom({
    type: 'friendlyNpc',
    interacted: false,
  }), ['friendlyNpc.choose', 'proceed']);
});

test('computes expected action seq', () => {
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7, localProceedCount: 0 }), 7);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7, localProceedCount: 3 }), 10);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7.5, localProceedCount: 3 }), 3);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7, localProceedCount: 3.5 }), 7);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: -7, localProceedCount: 3 }), 3);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7, localProceedCount: -3 }), 7);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: '7', localProceedCount: 3 }), 3);
});

test('maps predicted effects for every plan action kind', () => {
  const actionEffects = [
    ['proceed', ['ingredients', 'areaProgress']],
    ['friendlyNpc.choose', ['partyStats']],
    ['shrine.choose', ['partyStats']],
    ['skillMaster.choose', ['partySkills']],
    ['npcBattleSkill.choose', ['partySkills']],
    ['whackAMole.complete', ['credits', 'partyStats']],
    ['whackAMole.skip', []],
    ['campfire.cook', ['ingredients']],
    ['campfire.feed', ['partyStats', 'ingredients']],
    ['campfire.skip', []],
    ['speedReview.commit', ['srs', 'partyStats']],
    ['speedReview.complete', ['srs', 'partyStats']],
    ['wordDiscovery.review', ['srs']],
    ['wordDiscovery.complete', ['credits', 'partyStats']],
    ['dealer.sell', ['credits']],
    ['dealer.buy', ['credits', 'partyStats']],
    ['dealer.leave', []],
    ['encounter.start', []],
    ['npcBattle.start', []],
    ['boss.start', []],
    ['combat.cycle', ['partyStats']],
  ];

  for (const [kind, expectedEffects] of actionEffects) {
    assert.deepEqual(predictedEffectsForAction(kind), expectedEffects, kind);
  }

  assert.equal(
    predictedEffectsForAction('proceed').includes(EXPLORE_EFFECTS.PARTY_STATS),
    false,
  );
});

test('declares XP-room effects without attributing party stats to proceed', () => {
  assert.deepEqual(predictedEffectsForAction('whackAMole.complete'), [
    EXPLORE_EFFECTS.CREDITS,
    EXPLORE_EFFECTS.PARTY_STATS,
  ]);
  assert.deepEqual(predictedEffectsForAction('wordDiscovery.complete'), [
    EXPLORE_EFFECTS.CREDITS,
    EXPLORE_EFFECTS.PARTY_STATS,
  ]);
  assert.deepEqual(predictedEffectsForAction('whackAMole.skip'), []);
  assert.equal(
    predictedEffectsForAction('proceed').includes(EXPLORE_EFFECTS.PARTY_STATS),
    false,
  );
});

test('maps room dependencies for every plan room type', () => {
  const roomDependencies = [
    // Combat rooms are pre-rolled (Task 8): prepareCombatStart pins the ENEMIES +
    // seed chain at prepare time. But the roll does NOT pin the ally-side stats,
    // which feed the hashed transcript — so a PARTY_STATS effect queued ahead of a
    // fight (shrine/friendlyNpc) must still pause the proceed into it, or the
    // offline-built fight forks the transcript (task-12f transcript_mismatch fix).
    ['encounter', ['partyStats']],
    ['boss', ['partyStats']],
    ['npcBattle', ['partyStats']],
    ['campfire', ['ingredients', 'partyStats']],
    ['dealer', ['credits']],
    ['speedReviewRoom', ['srs']],
    ['wordDiscovery', ['srs']],
    ['friendlyNpc', []],
    ['shrine', ['partyStats']],
    ['skillMaster', ['partySkills']],
    ['whackAMole', []],
    ['room', []],
  ];

  for (const [type, expectedDependencies] of roomDependencies) {
    assert.deepEqual(roomDependenciesForType(type), expectedDependencies, type);
  }
});

test('returns fresh effect and dependency arrays', () => {
  const effects = predictedEffectsForAction('dealer.sell');
  effects.push('partyStats');

  const dependencies = roomDependenciesForType('campfire');
  dependencies.push('credits');

  assert.deepEqual(predictedEffectsForAction('dealer.sell'), ['credits']);
  assert.deepEqual(roomDependenciesForType('campfire'), ['ingredients', 'partyStats']);
});

test('builds correction response', () => {
  const state = { phase: 'room' };
  const exploreRunway = { preparedRooms: [] };

  assert.deepEqual(
    makeExploreCorrection({
      reason: 'session_epoch_mismatch',
      rejectedSeq: 3,
      confirmedThroughSeq: 2,
      state,
      exploreRunway,
    }),
    {
      status: 'corrected',
      confirmedThroughSeq: 2,
      rejectedSeq: 3,
      reason: 'session_epoch_mismatch',
      results: [],
      state,
      authoritativeState: state,
      exploreRunway,
    },
  );
});

test('builds ok response', () => {
  const state = { phase: 'room' };
  const exploreRunway = { preparedRooms: [] };
  const results = [{ seq: 2, status: 'accepted' }];

  assert.deepEqual(
    makeExploreOk({
      confirmedThroughSeq: 2,
      results,
      state,
      exploreRunway,
    }),
    {
      status: 'ok',
      confirmedThroughSeq: 2,
      rejectedSeq: null,
      reason: null,
      results,
      state,
      exploreRunway,
    },
  );
});
