import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tokenizeBatch } from '../../src/tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from '../../src/game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../../src/game/grammar/grammar-matcher.js';

const EXPECTED_LIVE_QUOTE_HITS = 157;
const EXPECTED_LIVE_QUOTE_EXPECTATIONS = 157;
const EXPECTED_QUOTED_TEXT_NEGATIVE_EXPECTATIONS = 157;
const EXPECTED_FIXTURE_NEGATIVE_EXPECTATIONS = 132;

function stripSentencePunctuation(sentence) {
  return String(sentence || '').replace(/[。！？!?]+$/u, '');
}

function buildNaturalizedCases(fixtures, enabledIds) {
  const cases = [];
  for (const fixture of fixtures) {
    if (!enabledIds.has(fixture.grammarId)) continue;

    for (const positive of fixture.positive || []) {
      const quoted = stripSentencePunctuation(positive);
      cases.push({
        kind: 'live-quote-positive',
        grammarId: fixture.grammarId,
        sentence: `昨日、友達は「${quoted}」と言いました。`,
        expected: true,
      });
      cases.push({
        kind: 'quoted-text-negative',
        grammarId: fixture.grammarId,
        sentence: `ノートに「${quoted}」とだけ書きました。`,
        expected: false,
      });
    }

    for (const negative of fixture.negative || []) {
      cases.push({
        kind: 'fixture-negative',
        grammarId: fixture.grammarId,
        sentence: negative,
        expected: false,
      });
    }
  }
  return cases;
}

function scoreTargetSpecificCases(cases, { catalog, matchers }) {
  const tokenized = tokenizeBatch(cases.map(testCase => testCase.sentence));
  const misses = [];
  const falsePositives = [];
  let expectedCount = 0;
  let hitCount = 0;
  let negativeExposureCount = 0;

  for (let index = 0; index < cases.length; index++) {
    const testCase = cases[index];
    const observed = new Set(
      findGrammarMatches(tokenized[index], { catalog, matchers }).map(match => match.grammarId)
    );

    if (testCase.expected) {
      expectedCount += 1;
      if (observed.has(testCase.grammarId)) {
        hitCount += 1;
      } else {
        misses.push(`${testCase.grammarId} missed ${testCase.kind}: ${testCase.sentence}`);
      }
      continue;
    }

    negativeExposureCount += 1;
    if (observed.has(testCase.grammarId)) {
      falsePositives.push(`${testCase.grammarId} matched ${testCase.kind}: ${testCase.sentence}`);
    }
  }

  return {
    expectedCount,
    hitCount,
    hitRate: expectedCount === 0 ? 1 : hitCount / expectedCount,
    negativeExposureCount,
    falsePositiveCount: falsePositives.length,
    misses,
    falsePositives,
  };
}

describe('N5 naturalized grammar stress', () => {
  const catalog = loadGrammarCatalog();
  const matchers = loadGrammarMatchers();
  const enabledN5Ids = new Set(
    catalog.filter(point => point.level === 'N5' && point.status === 'enabled').map(point => point.id)
  );
  const fixtures = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/grammar-n5.json'), 'utf-8'));
  const cases = buildNaturalizedCases(fixtures, enabledN5Ids);
  const score = scoreTargetSpecificCases(cases, { catalog, matchers });
  const liveQuoteExpectations = cases.filter(testCase => testCase.kind === 'live-quote-positive').length;
  const quotedTextNegativeExpectations = cases.filter(testCase => testCase.kind === 'quoted-text-negative').length;
  const fixtureNegativeExpectations = cases.filter(testCase => testCase.kind === 'fixture-negative').length;
  const quotedTextFalsePositives = score.falsePositives.filter(line => line.includes('quoted-text-negative'));
  const fixtureNegativeFalsePositives = score.falsePositives.filter(line => line.includes('fixture-negative'));

  it('preserves the exact generated N5 quote harness metrics', () => {
    assert.equal(
      liveQuoteExpectations,
      EXPECTED_LIVE_QUOTE_EXPECTATIONS,
      `live quoted speech expectation count changed: ${liveQuoteExpectations}/${EXPECTED_LIVE_QUOTE_EXPECTATIONS}`
    );
    assert.equal(
      score.hitCount,
      EXPECTED_LIVE_QUOTE_HITS,
      `live quoted speech hits: ${score.hitCount}/${liveQuoteExpectations}; ` +
        `misses: ${score.misses.slice(0, 40).join(' | ')}`
    );
    assert.equal(
      quotedTextNegativeExpectations,
      EXPECTED_QUOTED_TEXT_NEGATIVE_EXPECTATIONS,
      `generated quoted-text target expectation count changed: ` +
        `${quotedTextNegativeExpectations}/${EXPECTED_QUOTED_TEXT_NEGATIVE_EXPECTATIONS}`
    );
    assert.equal(
      quotedTextFalsePositives.length,
      0,
      `generated quoted-text target false positives: ` +
        `${quotedTextFalsePositives.length}/${quotedTextNegativeExpectations}; ` +
        `${quotedTextFalsePositives.slice(0, 40).join(' | ')}`
    );
    assert.equal(
      fixtureNegativeExpectations,
      EXPECTED_FIXTURE_NEGATIVE_EXPECTATIONS,
      `fixture-negative target expectation count changed: ` +
        `${fixtureNegativeExpectations}/${EXPECTED_FIXTURE_NEGATIVE_EXPECTATIONS}`
    );
    assert.equal(
      fixtureNegativeFalsePositives.length,
      0,
      `fixture-negative target false positives: ` +
        `${fixtureNegativeFalsePositives.length}/${fixtureNegativeExpectations}; ` +
        `${fixtureNegativeFalsePositives.slice(0, 40).join(' | ')}`
    );
  });
});
