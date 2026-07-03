import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureTurnSeeds, advanceTurnSeeds, PVE_TURN_SEED_CHAIN_TARGET } from '../../../src/game/services/combat-seed-chain.js';

test('ensureTurnSeeds fills the chain to target with nextTurnSeed at head', () => {
  const combat = { optimistic: { nextTurnSeed: 'seed-a', stateVersion: 0 } };
  const seeds = ensureTurnSeeds(combat, { target: PVE_TURN_SEED_CHAIN_TARGET });
  assert.equal(seeds.length, 40);
  assert.equal(seeds[0], 'seed-a');
  assert.equal(combat.optimistic.nextTurnSeed, 'seed-a');
});

test('advanceTurnSeeds shifts the head, bumps stateVersion, and refills', () => {
  const combat = { optimistic: { nextTurnSeed: 'seed-a', stateVersion: 3 } };
  ensureTurnSeeds(combat, { target: 5 });
  const second = combat.optimistic.turnSeeds[1];
  advanceTurnSeeds(combat.optimistic, { target: 5 });
  assert.equal(combat.optimistic.stateVersion, 4);
  assert.equal(combat.optimistic.nextTurnSeed, second);
  assert.equal(combat.optimistic.turnSeeds.length, 5);
});

test('kanji-kombat re-exports stay compatible', async () => {
  const kk = await import('../../../src/game/services/kanji-kombat-service.js');
  assert.equal(typeof kk.ensureKanjiKombatTurnSeeds, 'function');
  assert.equal(typeof kk.advanceKanjiKombatTurnSeeds, 'function');
});
