import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDialogueFromCache,
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
});
