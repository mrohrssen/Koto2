import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureKanjiKombatTurnSeeds,
  advanceKanjiKombatTurnSeeds,
  TURN_SEED_CHAIN_TARGET,
} from '../../../src/game/services/kanji-kombat-service.js';

function combatFixture() {
  return {
    optimistic: {
      combatId: 'cmb_test',
      stateVersion: 0,
      nextTurnSeed: 'seed0',
      acceptedActionIds: {},
    },
  };
}

test('ensureKanjiKombatTurnSeeds fills the chain to target with head === nextTurnSeed', () => {
  const combat = combatFixture();
  const seeds = ensureKanjiKombatTurnSeeds(combat);
  assert.equal(seeds.length, TURN_SEED_CHAIN_TARGET);
  assert.equal(seeds[0], 'seed0');
  assert.equal(combat.optimistic.nextTurnSeed, seeds[0]);
  assert.equal(new Set(seeds).size, seeds.length);
});

test('ensureKanjiKombatTurnSeeds rebuilds when head diverges from nextTurnSeed', () => {
  const combat = combatFixture();
  combat.optimistic.turnSeeds = ['stale1', 'stale2'];
  const seeds = ensureKanjiKombatTurnSeeds(combat);
  assert.equal(seeds[0], 'seed0');
});

test('ensureKanjiKombatTurnSeeds is idempotent', () => {
  const combat = combatFixture();
  const first = ensureKanjiKombatTurnSeeds(combat).slice();
  const second = ensureKanjiKombatTurnSeeds(combat);
  assert.deepEqual(second, first);
});

test('advanceKanjiKombatTurnSeeds shifts the chain and bumps stateVersion', () => {
  const combat = combatFixture();
  const seeds = ensureKanjiKombatTurnSeeds(combat).slice();
  advanceKanjiKombatTurnSeeds(combat.optimistic);
  assert.equal(combat.optimistic.stateVersion, 1);
  assert.equal(combat.optimistic.nextTurnSeed, seeds[1]);
  assert.equal(combat.optimistic.turnSeeds[0], seeds[1]);
  assert.equal(combat.optimistic.turnSeeds.length, TURN_SEED_CHAIN_TARGET);
});
