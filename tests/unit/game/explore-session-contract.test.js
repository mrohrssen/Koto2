import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPLORE_LEGACY_REVEAL_AHEAD,
  EXPLORE_RUNWAY_AHEAD,
  EXPLORE_SESSION_HARD_CAP,
  EXPLORE_SESSION_RESUME_AT,
  EXPLORE_SYNC_DEBOUNCE_MS,
  EXPLORE_SYNC_RETRY_DELAYS_MS,
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

test('computes expected action seq', () => {
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7, localProceedCount: 0 }), 7);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7, localProceedCount: 3 }), 10);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7.5, localProceedCount: 3 }), 3);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7, localProceedCount: 3.5 }), 7);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: -7, localProceedCount: 3 }), 3);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7, localProceedCount: -3 }), 7);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: '7', localProceedCount: 3 }), 3);
});

test('maps predicted effects and room dependencies', () => {
  assert.deepEqual(predictedEffectsForAction('dealer.sell'), ['credits']);
  assert.deepEqual(predictedEffectsForAction('campfire.feed'), ['partyStats', 'ingredients']);
  assert.deepEqual(predictedEffectsForAction('encounter.start'), []);
  assert.deepEqual(predictedEffectsForAction('npcBattle.start'), []);
  assert.deepEqual(predictedEffectsForAction('boss.start'), []);
  assert.deepEqual(roomDependenciesForType('dealer'), ['credits']);
  assert.deepEqual(roomDependenciesForType('encounter'), ['partyStats', 'partySkills']);
});

test('returns fresh effect and dependency arrays', () => {
  const effects = predictedEffectsForAction('dealer.sell');
  effects.push('partyStats');

  const dependencies = roomDependenciesForType('encounter');
  dependencies.push('credits');

  assert.deepEqual(predictedEffectsForAction('dealer.sell'), ['credits']);
  assert.deepEqual(roomDependenciesForType('encounter'), ['partyStats', 'partySkills']);
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
