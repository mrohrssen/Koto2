import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAsyncOwnershipFence,
  FenceContractViolation,
  FenceSuperseded,
} from '../../../public/js/async-ownership-fence.js';

function createRevisionLease(label, initialRevision = 1) {
  let actualRevision = initialRevision;
  let expectedRevision = initialRevision;

  return {
    label,
    lease: {
      label,
      isCurrent: () => actualRevision === expectedRevision,
    },
    getActualRevision: () => actualRevision,
    setActualRevision: revision => {
      actualRevision = revision;
    },
    bumpActualRevision: () => {
      actualRevision += 1;
      return actualRevision;
    },
    advanceExpectedRevision: revision => {
      expectedRevision = revision;
    },
  };
}

function createStateLease(label, initialState) {
  let actualState = initialState;
  let expectedState = initialState;

  return {
    label,
    lease: {
      label,
      isCurrent: () => actualState === expectedState,
    },
    getActualState: () => actualState,
    setActualState: state => {
      actualState = state;
    },
    advanceExpectedState: state => {
      expectedState = state;
    },
  };
}

test('stale-before-start skips the operation', async () => {
  let ran = false;
  const fence = createAsyncOwnershipFence([{ label: 'session', isCurrent: () => false }]);

  await assert.rejects(
    () => fence.step('fetch', async () => {
      ran = true;
    }),
    FenceSuperseded,
  );

  assert.equal(ran, false);
});

test('invalidation during resolve or reject becomes FenceSuperseded', async () => {
  const fulfillmentLease = createRevisionLease('session');
  const fulfillmentFence = createAsyncOwnershipFence([fulfillmentLease.lease]);

  await assert.rejects(
    () => fulfillmentFence.step('resolve', async () => {
      fulfillmentLease.bumpActualRevision();
      return 'value';
    }),
    FenceSuperseded,
  );

  const rejectionLease = createRevisionLease('session');
  const rejectionFence = createAsyncOwnershipFence([rejectionLease.lease]);
  const originalError = new Error('operation failed first');

  await assert.rejects(
    () => rejectionFence.step('reject', async () => {
      rejectionLease.bumpActualRevision();
      throw originalError;
    }),
    error => {
      assert.equal(error instanceof FenceSuperseded, true);
      assert.notEqual(error, originalError);
      assert.equal(error.message, 'reject superseded by session');
      return true;
    },
  );
});

test('declared exact replacement advances only its lease', async () => {
  const revision = createRevisionLease('session');
  const scene = createStateLease('scene', 'A');
  const untouched = createRevisionLease('auth', 7);
  const fence = createAsyncOwnershipFence([revision.lease, scene.lease, untouched.lease]);

  fence.commit('adopt-scene', {
    apply() {
      revision.setActualRevision(2);
      scene.setActualState('B');
    },
    transitions: [
      {
        lease: revision.lease,
        verify: () => revision.getActualRevision() === 2,
        advance: () => revision.advanceExpectedRevision(2),
      },
      {
        lease: scene.lease,
        verify: () => scene.getActualState() === 'B',
        advance: () => scene.advanceExpectedState('B'),
      },
    ],
  });

  assert.equal(fence.isCurrent(), true);
  assert.equal(untouched.getActualRevision(), 7);

  const result = await fence.step('post-commit', async () => 'still-current');
  assert.equal(result, 'still-current');
});

test('invalid descriptor and broken postconditions stop later work', async () => {
  const missingFieldsFence = createAsyncOwnershipFence([]);
  assert.throws(
    () => missingFieldsFence.commit('missing-fields'),
    FenceContractViolation,
  );
  assert.equal(missingFieldsFence.isCurrent(), false);
  await assert.rejects(
    () => missingFieldsFence.step('after-missing-fields', async () => 'never'),
    FenceContractViolation,
  );

  const nullDescriptorFence = createAsyncOwnershipFence([]);
  assert.throws(
    () => nullDescriptorFence.commit('null-descriptor', null),
    FenceContractViolation,
  );
  assert.equal(nullDescriptorFence.isCurrent(), false);

  const asyncLease = createRevisionLease('session');
  const asyncFence = createAsyncOwnershipFence([asyncLease.lease]);
  assert.throws(
    () => asyncFence.commit('async-apply', {
      apply: () => Promise.resolve(),
      transitions: [],
    }),
    FenceContractViolation,
  );
  assert.equal(asyncFence.isCurrent(), false);
  await assert.rejects(
    () => asyncFence.step('after-async-apply', async () => 'never'),
    FenceContractViolation,
  );

  const omittedFunctionsFence = createAsyncOwnershipFence([asyncLease.lease]);
  assert.throws(
    () => omittedFunctionsFence.commit('omitted-functions', {
      apply() {},
      transitions: [{ lease: asyncLease.lease }],
    }),
    FenceContractViolation,
  );
  assert.equal(omittedFunctionsFence.isCurrent(), false);

  const duplicateFence = createAsyncOwnershipFence([asyncLease.lease]);
  assert.throws(
    () => duplicateFence.commit('duplicate-transition', {
      apply() {},
      transitions: [
        { lease: asyncLease.lease, verify: () => true, advance: () => {} },
        { lease: asyncLease.lease, verify: () => true, advance: () => {} },
      ],
    }),
    FenceContractViolation,
  );
  assert.equal(duplicateFence.isCurrent(), false);
  await assert.rejects(
    () => duplicateFence.step('after-duplicate-transition', async () => 'never'),
    FenceContractViolation,
  );

  const uncapturedLease = { label: 'uncaptured', isCurrent: () => true };
  const uncapturedFence = createAsyncOwnershipFence([asyncLease.lease]);
  assert.throws(
    () => uncapturedFence.commit('uncaptured-transition', {
      apply() {},
      transitions: [{ lease: uncapturedLease, verify: () => true, advance: () => {} }],
    }),
    FenceContractViolation,
  );
  assert.equal(uncapturedFence.isCurrent(), false);

  const wrongRevision = createRevisionLease('session');
  const wrongRevisionFence = createAsyncOwnershipFence([wrongRevision.lease]);
  assert.throws(
    () => wrongRevisionFence.commit('wrong-revision', {
      apply() {
        wrongRevision.setActualRevision(3);
      },
      transitions: [{
        lease: wrongRevision.lease,
        verify: () => wrongRevision.getActualRevision() === 2,
        advance: () => wrongRevision.advanceExpectedRevision(2),
      }],
    }),
    FenceContractViolation,
  );

  await assert.rejects(
    () => wrongRevisionFence.step('after-wrong-revision', async () => 'never'),
    FenceContractViolation,
  );

  const wrongStateRevision = createRevisionLease('session');
  const wrongState = createStateLease('scene', 'A');
  const wrongStateFence = createAsyncOwnershipFence([wrongStateRevision.lease, wrongState.lease]);
  assert.throws(
    () => wrongStateFence.commit('wrong-state', {
      apply() {
        wrongStateRevision.setActualRevision(2);
        wrongState.setActualState('C');
      },
      transitions: [
        {
          lease: wrongStateRevision.lease,
          verify: () => wrongStateRevision.getActualRevision() === 2,
          advance: () => wrongStateRevision.advanceExpectedRevision(2),
        },
        {
          lease: wrongState.lease,
          verify: () => wrongState.getActualState() === 'B',
          advance: () => wrongState.advanceExpectedState('B'),
        },
      ],
    }),
    FenceContractViolation,
  );

  await assert.rejects(
    () => wrongStateFence.step('after-wrong-state', async () => 'never'),
    FenceContractViolation,
  );

  const undeclaredMutation = createRevisionLease('session');
  const untouchedLease = createRevisionLease('auth', 10);
  const undeclaredFence = createAsyncOwnershipFence([undeclaredMutation.lease, untouchedLease.lease]);
  assert.throws(
    () => undeclaredFence.commit('undeclared-mutation', {
      apply() {
        undeclaredMutation.setActualRevision(2);
        untouchedLease.bumpActualRevision();
      },
      transitions: [{
        lease: undeclaredMutation.lease,
        verify: () => undeclaredMutation.getActualRevision() === 2,
        advance: () => undeclaredMutation.advanceExpectedRevision(2),
      }],
    }),
    FenceContractViolation,
  );

  await assert.rejects(
    () => undeclaredFence.step('after-undeclared-mutation', async () => 'never'),
    FenceContractViolation,
  );
});

test('thrown verify and advance poison the fence with FenceContractViolation', async () => {
  const verifyLease = createRevisionLease('session');
  const verifyFence = createAsyncOwnershipFence([verifyLease.lease]);
  const verifyError = new Error('verify exploded');

  assert.throws(
    () => verifyFence.commit('verify-throws', {
      apply() {
        verifyLease.setActualRevision(2);
      },
      transitions: [{
        lease: verifyLease.lease,
        verify: () => {
          throw verifyError;
        },
        advance: () => verifyLease.advanceExpectedRevision(2),
      }],
    }),
    FenceContractViolation,
  );
  assert.equal(verifyFence.isCurrent(), false);
  await assert.rejects(
    () => verifyFence.step('after-verify-throws', async () => 'never'),
    FenceContractViolation,
  );

  const advanceLease = createRevisionLease('session');
  const advanceFence = createAsyncOwnershipFence([advanceLease.lease]);
  const advanceError = new Error('advance exploded');

  assert.throws(
    () => advanceFence.commit('advance-throws', {
      apply() {
        advanceLease.setActualRevision(2);
      },
      transitions: [{
        lease: advanceLease.lease,
        verify: () => advanceLease.getActualRevision() === 2,
        advance: () => {
          throw advanceError;
        },
      }],
    }),
    FenceContractViolation,
  );
  assert.equal(advanceFence.isCurrent(), false);
  await assert.rejects(
    () => advanceFence.step('after-advance-throws', async () => 'never'),
    FenceContractViolation,
  );
});
