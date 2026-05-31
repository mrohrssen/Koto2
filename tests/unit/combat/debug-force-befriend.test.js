import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldTriggerBefriendQuiz } from '../../../src/game/services/creature-combat-service.js';

describe('debug force befriend', () => {
  it('forces the befriend roll to succeed for a defeated eligible creature', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.99;

    try {
      const enemies = [{ hp: 0, befriended: false }];

      assert.equal(shouldTriggerBefriendQuiz(enemies, { force: true }), true);
    } finally {
      Math.random = originalRandom;
    }
  });
});
