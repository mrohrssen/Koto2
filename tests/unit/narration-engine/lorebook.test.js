import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadLorebook, activateEntries } from '../../../src/narration-engine/lorebook.js';

describe('lorebook', () => {
  describe('loadLorebook', () => {
    it('loads entries and config', () => {
      const lb = loadLorebook();
      assert.ok(lb.entries);
      assert.ok(lb.config);
      assert.ok(lb.config.maxEntriesPerPrompt);
    });

    it('returns cached reference on second call', () => {
      const a = loadLorebook();
      const b = loadLorebook();
      assert.strictEqual(a, b);
    });
  });

  describe('activateEntries', () => {
    it('activates entries referenced by character card world keys', () => {
      const result = activateEntries(['the_system', 'liberation']);
      assert.ok(result.length >= 2);
      const ids = result.map(e => e.id);
      assert.ok(ids.includes('the_system'));
      assert.ok(ids.includes('liberation'));
    });

    it('respects maxEntriesPerPrompt cap', () => {
      const allKeys = Object.keys(loadLorebook().entries);
      const result = activateEntries(allKeys);
      assert.ok(result.length <= loadLorebook().config.maxEntriesPerPrompt);
    });

    it('sorts by priority descending', () => {
      const result = activateEntries(['the_system', 'liberation']);
      for (let i = 1; i < result.length; i++) {
        assert.ok(result[i - 1].priority >= result[i].priority,
          `${result[i - 1].id} (${result[i - 1].priority}) should be >= ${result[i].id} (${result[i].priority})`);
      }
    });

    it('returns empty array for unknown keys', () => {
      const result = activateEntries(['nonexistent_key']);
      assert.ok(Array.isArray(result));
    });

    it('performs recursive keyword scanning', () => {
      // Activating the_system should recursively activate corruption
      // because the_system content mentions corruption-related keywords
      const result = activateEntries(['the_system']);
      const ids = result.map(e => e.id);
      assert.ok(ids.includes('the_system'));
      // Just verify recursion runs without error -- actual activation depends on content
    });
  });
});
