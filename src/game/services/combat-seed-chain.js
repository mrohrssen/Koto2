import { randomBytes } from 'crypto';

// Shared turn-seed-chain helpers. Both Kanji Kombat and PvE explore combat
// pre-commit a chain of per-turn server seeds so optimistic client turns can be
// verified against the exact seed the server will replay with. The chain head is
// always the current `nextTurnSeed`; each turn shifts the head and refills the
// tail back up to the target depth.
export const TURN_SEED_CHAIN_TARGET = 30;
export const PVE_TURN_SEED_CHAIN_TARGET = 40;

function createServerSeed() {
  return randomBytes(16).toString('hex');
}

export function ensureTurnSeeds(combat, { target = TURN_SEED_CHAIN_TARGET } = {}) {
  const optimistic = combat?.optimistic;
  if (!optimistic) return [];
  if (!Array.isArray(optimistic.turnSeeds)
    || optimistic.turnSeeds[0] !== optimistic.nextTurnSeed) {
    optimistic.turnSeeds = optimistic.nextTurnSeed ? [optimistic.nextTurnSeed] : [];
  }
  while (optimistic.turnSeeds.length < target) {
    optimistic.turnSeeds.push(createServerSeed());
  }
  if (!optimistic.nextTurnSeed) optimistic.nextTurnSeed = optimistic.turnSeeds[0] || null;
  return optimistic.turnSeeds;
}

export function advanceTurnSeeds(optimistic, { target = TURN_SEED_CHAIN_TARGET } = {}) {
  if (!optimistic) return;
  optimistic.stateVersion += 1;
  if (Array.isArray(optimistic.turnSeeds) && optimistic.turnSeeds[0] === optimistic.nextTurnSeed) {
    optimistic.turnSeeds.shift();
  } else {
    optimistic.turnSeeds = [];
  }
  while (optimistic.turnSeeds.length < target) {
    optimistic.turnSeeds.push(createServerSeed());
  }
  optimistic.nextTurnSeed = optimistic.turnSeeds[0];
}
