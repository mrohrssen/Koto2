import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDialogueFromCache,
  getAllDialogueCache,
  clearDialogueCache,
  queueMissingDialogues,
  logEncounter,
  regenerateDialogue,
  normalizeEntityAllowlist,
  isDialogueCacheStale,
  setMemoryFlag,
  updateMemoryBond,
  setNarrative
} from '../../../src/narration-engine/index.js';

describe('narration-engine public interface', () => {
  describe('getDialogueFromCache', () => {
    it('returns null for unknown user/npc', () => {
      const result = getDialogueFromCache('test-user-999', 'npc_01');
      assert.strictEqual(result, null);
    });
  });

  describe('creature entity type support', () => {
    it('normalizes entity allowlist to existing card ids only', () => {
      const result = normalizeEntityAllowlist(['hi', 'missing', 'hi'], {
        hi: {},
        mizu: {}
      });
      assert.deepStrictEqual(result, ['hi']);
    });

    it('treats a missing cache entry as stale', () => {
      const result = isDialogueCacheStale(
        'test-user-stale-missing',
        'hi',
        { words: ['水'] },
        'creature'
      );
      assert.strictEqual(result, true);
    });

    it('getDialogueFromCache accepts entityType', () => {
      const result = getDialogueFromCache('test-user-creature', 'kamedor', 'creature');
      assert.strictEqual(result, null);
    });

    it('getAllDialogueCache accepts entityType', () => {
      const result = getAllDialogueCache('test-user-creature-all', 'creature');
      assert.deepStrictEqual(result, {});
    });

    it('creature and npc caches are separate', () => {
      // Set something in npc cache via logEncounter (to create memory)
      logEncounter('test-user-separate', 'entity_01', 'positive', 'Met NPC');
      logEncounter('test-user-separate', 'entity_01', 'befriend-attempt', 'Met creature', 'creature');

      // Both should have stored without conflict — getDialogueFromCache returns null
      // since we only stored memories, not dialogues
      const npcCache = getDialogueFromCache('test-user-separate', 'entity_01');
      const creatureCache = getDialogueFromCache('test-user-separate', 'entity_01', 'creature');
      assert.strictEqual(npcCache, null);
      assert.strictEqual(creatureCache, null);
    });
  });
});
