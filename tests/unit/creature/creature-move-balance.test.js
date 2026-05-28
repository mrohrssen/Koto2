import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const moves = JSON.parse(readFileSync(new URL('../../../data/moves.json', import.meta.url), 'utf8'));

const DAMAGING_CATEGORIES = new Set(['damage', 'drain']);
const HIGH_FREQUENCY_RANK_MAX = 2500;
const LOW_FREQUENCY_RANK_MIN = 5001;
const HIGH_FREQUENCY_POWER_MAX = 24;
const LOW_FREQUENCY_POWER_MIN = 20;

function isDamaging(move) {
  return DAMAGING_CATEGORIES.has(move.category);
}

function hasStatusRider(move) {
  return Boolean(move.statusEffect && move.statusChance > 0);
}

function hasStatRider(move) {
  return Boolean(move.statChanges && Object.keys(move.statChanges).length > 0);
}

function hasRider(move) {
  return hasStatusRider(move) || hasStatRider(move);
}

function stableStatChanges(move) {
  if (!move.statChanges || Object.keys(move.statChanges).length === 0) return '';
  return Object.entries(move.statChanges)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stat, amount]) => `${stat}:${amount}`)
    .join(',');
}

function supportProfile(move) {
  return [
    move.element,
    move.category,
    move.target,
    move.power,
    move.statusEffect || '',
    move.statusChance || 0,
    move.statusDuration || 0,
    stableStatChanges(move)
  ].join('|');
}

describe('creature move balance data', () => {
  it('does not duplicate element and power among damaging moves', () => {
    const seen = new Map();
    const duplicates = [];

    for (const move of moves.filter(isDamaging)) {
      const key = `${move.element}|${move.power}`;
      if (seen.has(key)) {
        duplicates.push(`${key}: ${seen.get(key)} / ${move.id}`);
      } else {
        seen.set(key, move.id);
      }
    }

    assert.deepEqual(duplicates, []);
  });

  it('keeps high-frequency damaging moves low-power and rider-free', () => {
    const overloaded = moves
      .filter(move => isDamaging(move) && move.rank <= HIGH_FREQUENCY_RANK_MAX)
      .filter(move => move.power > HIGH_FREQUENCY_POWER_MAX || hasRider(move))
      .map(move => `${move.id}:rank-${move.rank}:power-${move.power}${hasRider(move) ? ':rider' : ''}`);

    assert.deepEqual(overloaded, []);
  });

  it('gives low-frequency damaging moves higher power or an additional effect', () => {
    const underloaded = moves
      .filter(move => isDamaging(move) && move.rank >= LOW_FREQUENCY_RANK_MIN)
      .filter(move => move.power < LOW_FREQUENCY_POWER_MIN && !hasRider(move))
      .map(move => `${move.id}:rank-${move.rank}:power-${move.power}`);

    assert.deepEqual(underloaded, []);
  });

  it('does not clone non-damaging move profiles', () => {
    const seen = new Map();
    const duplicates = [];

    for (const move of moves.filter(move => !isDamaging(move))) {
      const key = supportProfile(move);
      if (seen.has(key)) {
        duplicates.push(`${key}: ${seen.get(key)} / ${move.id}`);
      } else {
        seen.set(key, move.id);
      }
    }

    assert.deepEqual(duplicates, []);
  });
});
