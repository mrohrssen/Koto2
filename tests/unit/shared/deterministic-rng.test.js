import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSeededRng,
  randomInt,
  randomChoice,
  randomFloat,
} from '../../../src/shared/deterministic-rng.js';

describe('deterministic rng', () => {
  it('returns the same sequence for the same seed', () => {
    const a = createSeededRng('combat-1:turn-3:abc');
    const b = createSeededRng('combat-1:turn-3:abc');

    assert.deepEqual(
      [a(), a(), a(), a(), a()],
      [b(), b(), b(), b(), b()]
    );
  });

  it('returns different sequences for different seeds', () => {
    const a = createSeededRng('seed-a');
    const b = createSeededRng('seed-b');

    assert.notDeepEqual(
      [a(), a(), a()],
      [b(), b(), b()]
    );
  });

  it('supports deterministic float, integer, and choice helpers', () => {
    const rngA = createSeededRng('choice-seed');
    const rngB = createSeededRng('choice-seed');

    const valuesA = [
      randomFloat(rngA, 0.8, 1.2),
      randomInt(rngA, 0, 10),
      randomChoice(rngA, ['hi', 'mizu', 'ki']),
    ];
    const valuesB = [
      randomFloat(rngB, 0.8, 1.2),
      randomInt(rngB, 0, 10),
      randomChoice(rngB, ['hi', 'mizu', 'ki']),
    ];

    assert.deepEqual(valuesA, valuesB);
    assert.ok(valuesA[0] >= 0.8 && valuesA[0] < 1.2);
    assert.ok(valuesA[1] >= 0 && valuesA[1] < 10);
    assert.ok(['hi', 'mizu', 'ki'].includes(valuesA[2]));
  });
});
