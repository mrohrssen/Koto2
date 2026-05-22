import { rating as createOpenSkillRating, rate } from 'openskill';

export const DEFAULT_DISPLAY_RATING = 1200;
export const DEFAULT_MU = 25;
export const DEFAULT_SIGMA = 25 / 3;
export const DISPLAY_SCALE = 40;

export function createDefaultRankedState() {
  return {
    rating: createOpenSkillRating({ mu: DEFAULT_MU, sigma: DEFAULT_SIGMA }),
    wins: 0,
    losses: 0,
    matchesPlayed: 0,
    lastMatch: null
  };
}

export function normalizeRankedState(value = {}) {
  const defaults = createDefaultRankedState();
  const rating = value?.rating || defaults.rating;
  const mu = Number.isFinite(rating.mu) ? rating.mu : DEFAULT_MU;
  const sigma = Number.isFinite(rating.sigma) ? rating.sigma : DEFAULT_SIGMA;
  return {
    rating: { mu, sigma },
    wins: Number.isFinite(value?.wins) ? value.wins : 0,
    losses: Number.isFinite(value?.losses) ? value.losses : 0,
    matchesPlayed: Number.isFinite(value?.matchesPlayed) ? value.matchesPlayed : 0,
    lastMatch: value?.lastMatch || null
  };
}

export function getDisplayRating(rating) {
  const normalized = normalizeRankedState({ rating });
  return Math.round(DEFAULT_DISPLAY_RATING + (normalized.rating.mu - DEFAULT_MU) * DISPLAY_SCALE);
}

export function toPublicRankedSummary(value = {}) {
  const ranked = normalizeRankedState(value);
  return {
    rating: getDisplayRating(ranked.rating),
    wins: ranked.wins,
    losses: ranked.losses,
    matchesPlayed: ranked.matchesPlayed,
    lastMatch: ranked.lastMatch
  };
}

export function updateRankedAfterMatch({
  winnerRanked,
  loserRanked,
  winnerName,
  loserName,
  finishedAt = new Date().toISOString()
}) {
  const winnerBefore = normalizeRankedState(winnerRanked);
  const loserBefore = normalizeRankedState(loserRanked);
  const winnerRatingBefore = getDisplayRating(winnerBefore.rating);
  const loserRatingBefore = getDisplayRating(loserBefore.rating);
  const [[winnerRatingAfter], [loserRatingAfter]] = rate([
    [winnerBefore.rating],
    [loserBefore.rating]
  ]);
  const winnerRatingAfterDisplay = getDisplayRating(winnerRatingAfter);
  const loserRatingAfterDisplay = getDisplayRating(loserRatingAfter);

  return {
    winner: {
      ranked: {
        rating: winnerRatingAfter,
        wins: winnerBefore.wins + 1,
        losses: winnerBefore.losses,
        matchesPlayed: winnerBefore.matchesPlayed + 1,
        lastMatch: {
          result: 'win',
          opponentName: loserName,
          opponentRatingBefore: loserRatingBefore,
          ratingBefore: winnerRatingBefore,
          ratingAfter: winnerRatingAfterDisplay,
          finishedAt
        }
      }
    },
    loser: {
      ranked: {
        rating: loserRatingAfter,
        wins: loserBefore.wins,
        losses: loserBefore.losses + 1,
        matchesPlayed: loserBefore.matchesPlayed + 1,
        lastMatch: {
          result: 'loss',
          opponentName: winnerName,
          opponentRatingBefore: winnerRatingBefore,
          ratingBefore: loserRatingBefore,
          ratingAfter: loserRatingAfterDisplay,
          finishedAt
        }
      }
    }
  };
}
