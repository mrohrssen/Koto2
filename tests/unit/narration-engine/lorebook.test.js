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
    it('activates entries by key', () => {
      const result = activateEntries(['the_world', 'the_disruption']);
      assert.ok(result.length >= 2);
      const ids = result.map(e => e.id);
      assert.ok(ids.includes('the_world'));
      assert.ok(ids.includes('the_disruption'));
    });

    it('respects maxEntriesPerPrompt cap', () => {
      const allKeys = Object.keys(loadLorebook().entries);
      const result = activateEntries(allKeys);
      assert.ok(result.length <= loadLorebook().config.maxEntriesPerPrompt);
    });

    it('sorts by priority descending', () => {
      const result = activateEntries(['the_world', 'the_disruption']);
      for (let i = 1; i < result.length; i++) {
        assert.ok(result[i - 1].priority >= result[i].priority,
          `${result[i - 1].id} (${result[i - 1].priority}) should be >= ${result[i].id} (${result[i].priority})`);
      }
    });

    it('returns empty array for unknown keys', () => {
      const result = activateEntries(['nonexistent_key']);
      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    });

    it('performs recursive keyword scanning', () => {
      // the_world content mentions "disruption" which is a keyword for the_disruption
      const result = activateEntries(['the_world']);
      const ids = result.map(e => e.id);
      assert.ok(ids.includes('the_world'));
      assert.ok(ids.includes('the_disruption'), 'should recursively activate the_disruption via keyword match');
    });
  });
});
