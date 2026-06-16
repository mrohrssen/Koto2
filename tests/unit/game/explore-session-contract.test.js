import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPLORE_RUNWAY_AHEAD,
  EXPLORE_SESSION_HARD_CAP,
  createExploreSessionEpoch,
  ensureExploreSessionEpoch,
  expectedActionSeqForEntry,
  isExploreSessionActionId,
  makeExploreCorrection,
  predictedEffectsForAction,
  roomDependenciesForType,
} from '../../../src/game/services/explore-session-contract.js';

test('exports runway and client log limits', () => {
  assert.equal(EXPLORE_RUNWAY_AHEAD, 5);
  assert.equal(EXPLORE_SESSION_HARD_CAP, 50);
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

test('validates session action ids', () => {
  assert.equal(isExploreSessionActionId('run_es_00000001'), true);
  assert.equal(isExploreSessionActionId('bad'), false);
  assert.equal(isExploreSessionActionId('__proto__'), false);
});

test('computes expected action seq', () => {
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7, localProceedCount: 0 }), 7);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7, localProceedCount: 3 }), 10);
});

test('maps predicted effects and room dependencies', () => {
  assert.deepEqual(predictedEffectsForAction('dealer.sell'), ['credits']);
  assert.deepEqual(predictedEffectsForAction('campfire.feed'), ['partyStats', 'ingredients']);
  assert.deepEqual(roomDependenciesForType('dealer'), ['credits']);
  assert.deepEqual(roomDependenciesForType('encounter'), ['partyStats', 'partySkills']);
  assert.deepEqual(predictedEffectsForAction('encounter.start'), []);
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
