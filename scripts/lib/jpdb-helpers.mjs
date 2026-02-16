// JPDB API helper functions for creature forge and other vocabulary workflows.
// Provides rate-limited, batch-aware API wrappers and pure utility functions.

const JPDB_API = 'https://jpdb.io/api/v1';

const TIERS = [
  { name: 'common', min: 1, max: 3000 },
  { name: 'uncommon', min: 3001, max: 6000 },
  { name: 'rare', min: 6001, max: 12000 },
  { name: 'epic', min: 12001, max: 20000 },
  { name: 'legendary', min: 20001, max: 30000 },
];

export function tierFromRank(rank) {
  if (rank == null) return 'rejected';
  const tier = TIERS.find(t => rank >= t.min && rank <= t.max);
  return tier ? tier.name : 'rejected';
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
