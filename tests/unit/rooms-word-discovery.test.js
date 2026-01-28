import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { ROOM_TYPES, generateFloorRooms, WORDS_PER_DISCOVERY } from '../../src/game/rooms.js';

describe('Word Discovery Room', () => {
  it('should have wordDiscovery room type constant', () => {
    assert.strictEqual(ROOM_TYPES.wordDiscovery, 'wordDiscovery');
  });

  it('should export WORDS_PER_DISCOVERY constant', () => {
    assert.strictEqual(WORDS_PER_DISCOVERY, 2);
  });

  it('should generate wordDiscovery rooms in floor generation', () => {
    // Run generation 100 times to verify room type can appear
    let foundWordDiscovery = false;
    for (let i = 0; i < 100; i++) {
      const rooms = generateFloorRooms(1, 5);
      if (rooms.some(r => r.type === 'wordDiscovery')) {
        foundWordDiscovery = true;
        break;
      }
    }
    assert.strictEqual(foundWordDiscovery, true, 'wordDiscovery room should appear in floor generation');
  });

  it('should create wordDiscovery room with correct structure', () => {
    // Force random to produce wordDiscovery (40% threshold = shrine + quiz, next 20% = wordDiscovery)
    const originalRandom = Math.random;
    Math.random = () => 0.45; // 40-60% range = wordDiscovery

    try {
      const rooms = generateFloorRooms(1, 1);
      const room = rooms[0];

      assert.strictEqual(room.type, 'wordDiscovery');
      assert.deepStrictEqual(room.wordDiscovery, {
        wordsToLearn: 2,
        wordsLearned: 0,
        wordIds: [],
        completed: false
      });
    } finally {
      Math.random = originalRandom;
    }
  });
});
