import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadGrammarCatalog,
  loadGrammarMatchers,
  getGrammarPointMap,
} from '../../src/game/grammar/grammar-loader.js';

describe('grammar-loader', () => {
  it('loads Koto grammar catalog entries keyed by id', () => {
    const catalog = loadGrammarCatalog();
    const point = catalog.find(p => p.id === 'n5-wa-topic');
    assert.ok(point, 'n5-wa-topic should exist');
    assert.equal(point.level, 'N5');
    assert.equal(point.lesson, 1);
    assert.equal(point.title, 'は');
    assert.equal(point.meaning, 'as for');
    assert.equal(point.readingOverride, 'わ');
    assert.ok(point.shortExplanation.length > 0);
    assert.ok(point.tempSourceDeleteTagLater.includes('bunpro.jp/grammar_points/'));
  });

  it('loads matchers that reference existing catalog entries', () => {
    const catalogMap = getGrammarPointMap(loadGrammarCatalog());
    const matchers = loadGrammarMatchers();
    assert.ok(matchers.some(m => m.grammarId === 'n5-wa-topic'));
    for (const matcher of matchers) {
      assert.ok(catalogMap.has(matcher.grammarId), `missing catalog entry for ${matcher.grammarId}`);
      assert.equal(typeof matcher.priority, 'number', `${matcher.grammarId} matcher missing numeric priority`);
    }
  });

  it('rejects duplicate catalog ids', () => {
    assert.throws(
      () => getGrammarPointMap([{ id: 'x' }, { id: 'x' }]),
      /Duplicate grammar catalog id: x/
    );
  });
});
