import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tokenizeBatch } from '../../src/tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from '../../src/game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../../src/game/grammar/grammar-matcher.js';

const STRESS_PATH = join(import.meta.dirname, '../fixtures/grammar-n5-stress.json');
const stressCases = JSON.parse(readFileSync(STRESS_PATH, 'utf-8'));
const MIN_HIT_RATE = 0.98;

describe('N5 grammar stress metrics', () => {
  const catalog = loadGrammarCatalog();
  const enabledIds = new Set(catalog.filter(p => p.level === 'N5' && p.status === 'enabled').map(p => p.id));
  const matchers = loadGrammarMatchers();
  const sentences = stressCases.map(c => c.sentence);
  const tokenized = tokenizeBatch(sentences);

  it('has no false positives on adjudicated stress cases', () => {
    const failures = [];
    for (let i = 0; i < stressCases.length; i++) {
      const testCase = stressCases[i];
      const expected = new Set(testCase.expected || []);
      const observed = findGrammarMatches(tokenized[i], { catalog, matchers }).map(m => m.grammarId);
      for (const id of observed) {
        if (enabledIds.has(id) && !expected.has(id)) {
          failures.push(`${testCase.sentence}: unexpected ${id}; expected [${[...expected].join(', ')}]`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });

  it('hits at least 98 percent of adjudicated in-scope positives', () => {
    let expectedCount = 0;
    let hitCount = 0;
    const misses = [];

    for (let i = 0; i < stressCases.length; i++) {
      const testCase = stressCases[i];
      const knownMisses = new Set(testCase.knownMisses || []);
      const expected = (testCase.expected || []).filter(id => enabledIds.has(id) && !knownMisses.has(id));
      const observed = new Set(findGrammarMatches(tokenized[i], { catalog, matchers }).map(m => m.grammarId));
      for (const id of expected) {
        expectedCount += 1;
        if (observed.has(id)) {
          hitCount += 1;
        } else {
          misses.push(`${testCase.sentence}: missed ${id}`);
        }
      }
    }

    const hitRate = expectedCount === 0 ? 1 : hitCount / expectedCount;
    assert.ok(hitRate >= MIN_HIT_RATE, `hit rate ${hitRate.toFixed(3)} below ${MIN_HIT_RATE}; misses: ${misses.join(' | ')}`);
  });

  it('requires every accepted miss to have a reason', () => {
    for (const testCase of stressCases) {
      if ((testCase.knownMisses || []).length > 0) {
        assert.ok(testCase.notes && testCase.notes.length > 20, `${testCase.sentence} has knownMisses without a clear note`);
      }
    }
  });
});
