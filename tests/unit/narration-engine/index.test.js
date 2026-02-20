import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDialogueFromCache,
  getAllDialogueCache,
  clearDialogueCache,
  queueMissingDialogues,
  logEncounter,
  regenerateDialogue,
  setMemoryFlag,
  updateMemoryBond,
  setNarrative
} from '../../../src/narration-engine/index.js';

describe('narration-engine public interface', () => {
  describe('exports', () => {
    it('exports all public functions', () => {
      assert.strictEqual(typeof getDialogueFromCache, 'function');
      assert.strictEqual(typeof queueMissingDialogues, 'function');
      assert.strictEqual(typeof logEncounter, 'function');
      assert.strictEqual(typeof regenerateDialogue, 'function');
      assert.strictEqual(typeof setMemoryFlag, 'function');
      assert.strictEqual(typeof updateMemoryBond, 'function');
      assert.strictEqual(typeof setNarrative, 'function');
    });
  });

  describe('getDialogueFromCache', () => {
    it('returns null for unknown user/npc', () => {
      const result = getDialogueFromCache('test-user-999', 'npc_01');
      assert.strictEqual(result, null);
    });
  });

  describe('logEncounter', () => {
    it('logs an encounter without throwing', () => {
      assert.doesNotThrow(() => {
        logEncounter('test-user-log', 'npc_01', 'positive', 'Test encounter');
      });
    });
  });

  describe('setMemoryFlag', () => {
    it('sets flag without throwing', () => {
      assert.doesNotThrow(() => {
        setMemoryFlag('test-user-flag', 'npc_01', 'liberated', true);
      });
    });
  });

  describe('updateMemoryBond', () => {
    it('updates bond without throwing', () => {
      assert.doesNotThrow(() => {
        updateMemoryBond('test-user-bond', 'npc_01', 1);
      });
    });
  });

  describe('creature entity type support', () => {
    it('getDialogueFromCache accepts entityType', () => {
      const result = getDialogueFromCache('test-user-creature', 'kamedor', 'creature');
      assert.strictEqual(result, null);
    });

    it('logEncounter accepts entityType', () => {
      assert.doesNotThrow(() => {
        logEncounter('test-user-creature-log', 'kamedor', 'befriend-attempt', 'Tried to befriend', 'creature');
      });
    });

    it('setMemoryFlag accepts entityType', () => {
      assert.doesNotThrow(() => {
        setMemoryFlag('test-user-creature-flag', 'kamedor', 'befriended', true, 'creature');
      });
    });

    it('getAllDialogueCache accepts entityType', () => {
      const result = getAllDialogueCache('test-user-creature-all', 'creature');
      assert.deepStrictEqual(result, {});
    });

    it('clearDialogueCache accepts entityType', () => {
      assert.doesNotThrow(() => {
        clearDialogueCache('test-user-creature-clear', 'creature');
      });
    });

    it('updateMemoryBond accepts entityType', () => {
      assert.doesNotThrow(() => {
        updateMemoryBond('test-user-creature-bond', 'kamedor', 1, 'creature');
      });
    });

    it('setNarrative accepts entityType', () => {
      assert.doesNotThrow(() => {
        setNarrative('test-user-creature-narrative', 'kamedor', 'Became friends', 'creature');
      });
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
