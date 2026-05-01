import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { State } from 'ts-fsrs';
import {
  REVIEW_FUSION_CORE_DROP_RATE,
  isReviewFusionCoreEligible,
  rollReviewFusionCoreDrop
} from '../../../src/game/services/review-fusion-core-service.js';

describe('review Fusion Core reward eligibility', () => {
  it('makes good reviews eligible even when the card is new or missing', () => {
    assert.equal(isReviewFusionCoreEligible({
      grade: 'good',
      isDiscovery: false,
      preReviewCard: null
    }), true);
  });

  it('blocks discovery reviews even when the grade is good', () => {
    assert.equal(isReviewFusionCoreEligible({
      grade: 'good',
      isDiscovery: true,
      preReviewCard: { state: State.Review }
    }), false);
  });

  it('blocks first-time again reviews with no pre-review card', () => {
    assert.equal(isReviewFusionCoreEligible({
      grade: 'again',
      isDiscovery: false,
      preReviewCard: null
    }), false);
  });

  it('blocks again reviews for existing New cards', () => {
    assert.equal(isReviewFusionCoreEligible({
      grade: 'again',
      isDiscovery: false,
      preReviewCard: { state: State.New }
    }), false);
  });

  it('allows again reviews for cards that were already reviewed or known', () => {
    for (const state of [State.Learning, State.Review, State.Relearning]) {
      assert.equal(isReviewFusionCoreEligible({
        grade: 'again',
        isDiscovery: false,
        preReviewCard: { state }
      }), true);
    }
  });
});

describe('rollReviewFusionCoreDrop', () => {
  it('awards one Fusion Core when eligible and the roll is under 5%', () => {
    const meta = { fusionCores: 2 };

    const drop = rollReviewFusionCoreDrop(meta, {
      eligible: true,
      random: () => REVIEW_FUSION_CORE_DROP_RATE - 0.001
    });

    assert.deepEqual(drop, {
      awarded: true,
      fusionCores: 3,
      message: 'Obtained 1x Fusion Core!'
    });
    assert.equal(meta.fusionCores, 3);
  });

  it('does not award when eligible but the roll is at the threshold', () => {
    const meta = { fusionCores: 2 };

    const drop = rollReviewFusionCoreDrop(meta, {
      eligible: true,
      random: () => REVIEW_FUSION_CORE_DROP_RATE
    });

    assert.equal(drop, null);
    assert.equal(meta.fusionCores, 2);
  });

  it('does not award when the review is not eligible', () => {
    const meta = { fusionCores: 2 };

    const drop = rollReviewFusionCoreDrop(meta, {
      eligible: false,
      random: () => 0
    });

    assert.equal(drop, null);
    assert.equal(meta.fusionCores, 2);
  });

  it('treats missing fusionCore count as zero before awarding', () => {
    const meta = {};

    const drop = rollReviewFusionCoreDrop(meta, {
      eligible: true,
      random: () => 0
    });

    assert.equal(drop.fusionCores, 1);
    assert.equal(meta.fusionCores, 1);
  });
});
