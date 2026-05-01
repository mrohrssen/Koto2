import { State } from 'ts-fsrs';

export const REVIEW_FUSION_CORE_DROP_RATE = 0.05;

const REVIEW_REWARD_KNOWN_STATES = new Set([
  State.Learning,
  State.Review,
  State.Relearning
]);

export function isReviewFusionCoreEligible({ grade, isDiscovery = false, preReviewCard = null } = {}) {
  if (isDiscovery) return false;
  if (grade === 'good') return true;
  if (grade !== 'again') return false;
  if (!preReviewCard) return false;
  return REVIEW_REWARD_KNOWN_STATES.has(preReviewCard.state);
}

export function rollReviewFusionCoreDrop(meta, {
  eligible,
  random = Math.random
} = {}) {
  if (!eligible) return null;
  if (random() >= REVIEW_FUSION_CORE_DROP_RATE) return null;

  const current = Number.isFinite(meta?.fusionCores) ? meta.fusionCores : 0;
  meta.fusionCores = current + 1;

  return {
    awarded: true,
    fusionCores: meta.fusionCores,
    message: 'Obtained 1x Fusion Core!'
  };
}
