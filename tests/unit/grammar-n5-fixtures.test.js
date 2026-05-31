import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tokenizeBatch } from '../../src/tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from '../../src/game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../../src/game/grammar/grammar-matcher.js';

const LEVELS = [
  { level: 'N5', fixturePath: join(import.meta.dirname, '../fixtures/grammar-n5.json'), expectedCount: 132 },
  { level: 'N4', fixturePath: join(import.meta.dirname, '../fixtures/grammar-n4.json'), expectedCount: 185 },
  { level: 'N3', fixturePath: join(import.meta.dirname, '../fixtures/grammar-n3.json'), expectedCount: 220 },
];

function loadFixtures(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function tokenizeFixtureSentences(items) {
  const sentences = [...new Set(items.flatMap(f => [...f.positive, ...f.negative]))];
  const batches = tokenizeBatch(sentences);
  return new Map(sentences.map((sentence, index) => [sentence, batches[index]]));
}

describe('grammar level fixtures', () => {
  const catalog = loadGrammarCatalog();
  const matchers = loadGrammarMatchers();
  const catalogById = new Map(catalog.map(point => [point.id, point]));

  for (const { level, fixturePath, expectedCount } of LEVELS) {
    describe(`${level} grammar fixtures`, () => {
      const fixtures = loadFixtures(fixturePath);
      const tokenCache = tokenizeFixtureSentences(fixtures);

      for (const fixture of fixtures) {
        const point = catalogById.get(fixture.grammarId);
        if (point?.status && point.status !== 'enabled') continue;

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

      it(`every enabled ${level} catalog entry has a matcher and fixture coverage`, () => {
        const enabledIds = catalog.filter(p => p.level === level && p.status === 'enabled').map(p => p.id);
        const matcherIds = new Set(matchers.map(m => m.grammarId));
        const fixtureIds = new Set(fixtures.map(f => f.grammarId));
        for (const id of enabledIds) {
          assert.ok(matcherIds.has(id), `${id} missing matcher`);
          assert.ok(fixtureIds.has(id), `${id} missing fixture coverage`);
        }
      });

      it(`requires complete ${level} coverage for enabled entries before release`, () => {
        const levelPoints = catalog.filter(p => p.level === level);
        const enabledIds = levelPoints.filter(p => p.status === 'enabled').map(p => p.id);
        const notDetectableIds = levelPoints.filter(p => p.status === 'cataloged-not-detectable').map(p => p.id);
        const matcherIds = new Set(matchers.map(m => m.grammarId));
        const fixtureIds = new Set(fixtures.map(f => f.grammarId));

        assert.equal(levelPoints.length, expectedCount, `Bunpro ${level} catalog entry count changed`);
        assert.equal(enabledIds.length + notDetectableIds.length, expectedCount, `all Bunpro ${level} entries need an explicit detection status`);
        for (const id of enabledIds) {
          assert.ok(matcherIds.has(id), `${id} missing matcher`);
          assert.ok(fixtureIds.has(id), `${id} missing fixture coverage`);
        }
        for (const id of notDetectableIds) {
          assert.ok(!matcherIds.has(id), `${id} is cataloged-not-detectable but still has a matcher`);
          assert.ok(!fixtureIds.has(id), `${id} is cataloged-not-detectable but still has fixture coverage`);
        }
      });

      it(`exercises every ${level} matcher row with at least one positive fixture`, () => {
        const misses = [];
        for (let matcherIndex = 0; matcherIndex < matchers.length; matcherIndex++) {
          const matcher = matchers[matcherIndex];
          if (!matcher.grammarId?.startsWith(level.toLowerCase())) continue;
          const fixture = fixtures.find(f => f.grammarId === matcher.grammarId);
          const covered = (fixture?.positive || []).some(sentence => {
            const matches = findGrammarMatches(tokenCache.get(sentence), { catalog, matchers: [matcher] });
            return matches.some(match => match.grammarId === matcher.grammarId);
          });
          if (!covered) misses.push(`${matcher.grammarId} matcher row ${matcherIndex}`);
        }
        assert.deepEqual(misses, []);
      });
    });
  }

  it('cataloged-but-not-detectable entries include an explicit reason', () => {
    for (const point of catalog.filter(p => p.status === 'cataloged-not-detectable')) {
      assert.ok(point.notDetectableReason && point.notDetectableReason.length > 10, `${point.id} missing reason`);
    }
  });
});
