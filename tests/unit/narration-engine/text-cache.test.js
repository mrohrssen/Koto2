import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TextCache } from '../../../src/narration-engine/text-cache.js';

describe('TextCache', () => {
  let cache;

  beforeEach(() => {
    cache = new TextCache({ inMemory: true });
  });

  const sampleDialogue = {
    npcId: 'npc_01',
    generatedAt: new Date().toISOString(),
    vocabSnapshot: 100,
    memorySnapshot: { encounters: 2, bond: 1, liberated: true },
    greeting: '\u3084\u3042\uff01',
    defeatLine: '\u3046\u3046\u2026',
    freedLine: '\u3042\u308a\u304c\u3068\u3046\uff01',
    rounds: [
      { npcLine: '\u5143\u6c17\uff1f', options: [
        { text: '\u5143\u6c17\u3060\u3088', tone: 'positive' },
        { text: '\u307e\u3042\u307e\u3042', tone: 'neutral' },
        { text: '\u3046\u308b\u3055\u3044', tone: 'negative' }
      ]}
    ]
  };

  describe('get/set', () => {
    it('returns null for missing entry', () => {
      assert.strictEqual(cache.get('npc_01'), null);
    });

    it('stores and retrieves dialogue', () => {
      cache.set('npc_01', sampleDialogue);
      const result = cache.get('npc_01');
      assert.strictEqual(result.greeting, '\u3084\u3042\uff01');
      assert.strictEqual(result.rounds.length, 1);
    });
  });

  describe('isStale', () => {
    it('returns true when no cached entry', () => {
      assert.strictEqual(cache.isStale('npc_01', 100, {}), true);
    });

    it('returns false when vocab and memory unchanged', () => {
      cache.set('npc_01', sampleDialogue);
      assert.strictEqual(cache.isStale('npc_01', 100, { encounters: 2, bond: 1, liberated: true }), false);
    });

    it('returns true when vocab grew past threshold', () => {
      cache.set('npc_01', sampleDialogue);
      assert.strictEqual(cache.isStale('npc_01', 200, { encounters: 2, bond: 1, liberated: true }), true);
    });

    it('returns true when memory changed', () => {
      cache.set('npc_01', sampleDialogue);
      assert.strictEqual(cache.isStale('npc_01', 100, { encounters: 3, bond: 1, liberated: true }), true);
    });
  });

  describe('getPreviousLines', () => {
    it('returns empty array when no cache', () => {
      assert.deepStrictEqual(cache.getPreviousLines('npc_01'), []);
    });

    it('extracts greeting and round lines from cached dialogue', () => {
      cache.set('npc_01', sampleDialogue);
      const lines = cache.getPreviousLines('npc_01');
      assert.ok(lines.includes('\u3084\u3042\uff01'));
      assert.ok(lines.includes('\u5143\u6c17\uff1f'));
    });
  });

  describe('remove', () => {
    it('removes a cached entry', () => {
      cache.set('npc_01', sampleDialogue);
      cache.remove('npc_01');
      assert.strictEqual(cache.get('npc_01'), null);
    });
  });
});
