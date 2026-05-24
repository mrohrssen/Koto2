import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tokenizeBatch } from '../../src/tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from '../../src/game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../../src/game/grammar/grammar-matcher.js';

const FIXTURE_PATH = join(import.meta.dirname, '../fixtures/grammar-n5.json');
const fixtures = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

function tokenizeFixtureSentences(items) {
  const sentences = [...new Set(items.flatMap(f => [...f.positive, ...f.negative]))];
  const batches = tokenizeBatch(sentences);
  return new Map(sentences.map((sentence, index) => [sentence, batches[index]]));
}

describe('N5 grammar fixtures', () => {
  const catalog = loadGrammarCatalog();
  const matchers = loadGrammarMatchers();
  const tokenCache = tokenizeFixtureSentences(fixtures);

  for (const fixture of fixtures) {
    it(`${fixture.grammarId} matches positive examples`, () => {
      for (const sentence of fixture.positive) {
        const matches = findGrammarMatches(tokenCache.get(sentence), { catalog, matchers });
        assert.ok(
          matches.some(m => m.grammarId === fixture.grammarId),
          `${fixture.grammarId} should match ${sentence}`
        );
      }
    });

    it(`${fixture.grammarId} rejects negative examples`, () => {
      for (const sentence of fixture.negative) {
        const matches = findGrammarMatches(tokenCache.get(sentence), { catalog, matchers });
        assert.equal(
          matches.some(m => m.grammarId === fixture.grammarId),
          false,
          `${fixture.grammarId} should not match ${sentence}`
        );
      }
    });
  }

  it('every enabled N5 catalog entry has a matcher and fixture coverage', () => {
    const enabledIds = catalog.filter(p => p.level === 'N5' && p.status === 'enabled').map(p => p.id);
    const matcherIds = new Set(matchers.map(m => m.grammarId));
    const fixtureIds = new Set(fixtures.map(f => f.grammarId));
    for (const id of enabledIds) {
      assert.ok(matcherIds.has(id), `${id} missing matcher`);
      assert.ok(fixtureIds.has(id), `${id} missing fixture coverage`);
    }
  });

  it('requires complete N5 coverage before release', () => {
    const n5Points = catalog.filter(p => p.level === 'N5');
    const enabledIds = n5Points.filter(p => p.status === 'enabled').map(p => p.id);
    const notDetectableIds = n5Points.filter(p => p.status === 'cataloged-not-detectable').map(p => p.id);
    const matcherIds = new Set(matchers.map(m => m.grammarId));
    const fixtureIds = new Set(fixtures.map(f => f.grammarId));

    assert.equal(n5Points.length, 132, 'Bunpro N5 catalog entry count changed');
    assert.deepEqual(notDetectableIds, [], `N5 entries still not detectable: ${notDetectableIds.join(', ')}`);
    assert.equal(enabledIds.length, 132, 'all Bunpro N5 entries must be enabled');
    for (const id of enabledIds) {
      assert.ok(matcherIds.has(id), `${id} missing matcher`);
      assert.ok(fixtureIds.has(id), `${id} missing fixture coverage`);
    }
  });

  it('exercises every matcher row with at least one positive fixture', () => {
    const misses = [];
    for (let matcherIndex = 0; matcherIndex < matchers.length; matcherIndex++) {
      const matcher = matchers[matcherIndex];
      const fixture = fixtures.find(f => f.grammarId === matcher.grammarId);
      const covered = (fixture?.positive || []).some(sentence => {
        const matches = findGrammarMatches(tokenCache.get(sentence), { catalog, matchers: [matcher] });
        return matches.some(match => match.grammarId === matcher.grammarId);
      });
      if (!covered) misses.push(`${matcher.grammarId} matcher row ${matcherIndex}`);
    }
    assert.deepEqual(misses, []);
  });

  it('cataloged-but-not-detectable entries include an explicit reason', () => {
    for (const point of catalog.filter(p => p.status === 'cataloged-not-detectable')) {
      assert.ok(point.notDetectableReason && point.notDetectableReason.length > 10, `${point.id} missing reason`);
    }
  });
});
