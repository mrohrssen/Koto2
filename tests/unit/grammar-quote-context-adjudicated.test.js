import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeBatch } from '../../src/tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from '../../src/game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../../src/game/grammar/grammar-matcher.js';

const TARGET_EXPECTATIONS = [
  {
    kind: 'live-quoted-speech',
    grammarId: 'n5-wo-object',
    sentence: '友達は「本を読む」と言って、笑った。',
    expectedPresent: true,
  },
  {
    kind: 'live-quoted-speech',
    grammarId: 'n5-wo-object',
    sentence: '母は「水を飲みます」と言って、笑った。',
    expectedPresent: true,
  },
  {
    kind: 'live-quoted-speech',
    grammarId: 'n5-wo-object',
    sentence: '学生は「本を読みます」と、先生に言った。',
    expectedPresent: true,
  },
  {
    kind: 'live-quoted-speech',
    grammarId: 'n5-te-iru-progressive',
    sentence: '先生は「本を読んでいる」と言って、笑った。',
    expectedPresent: true,
  },
  {
    kind: 'live-quoted-speech',
    grammarId: 'n5-desu-copula',
    sentence: '店員は「学生です」と言って、うなずいた。',
    expectedPresent: true,
  },
  {
    kind: 'live-quoted-speech',
    grammarId: 'n5-masu-polite',
    sentence: '母は「行きます」と言って、手を振った。',
    expectedPresent: true,
  },
  {
    kind: 'live-quoted-speech',
    grammarId: 'n5-ne-confirmation',
    sentence: '祖母は「大丈夫ね」と言って、笑った。',
    expectedPresent: true,
  },
  {
    kind: 'live-quoted-speech',
    grammarId: 'n5-tte-quotation',
    sentence: '兄は「行くって」と言って、笑った。',
    expectedPresent: true,
  },
  {
    kind: 'copied-quoted-text',
    grammarId: 'n5-wo-object',
    sentence: 'ノートに「本を読む」と、書きました。',
    expectedPresent: false,
  },
  {
    kind: 'displayed-quoted-text',
    grammarId: 'n5-wo-object',
    sentence: '黒板に「本を読む」とあります。',
    expectedPresent: false,
  },
  {
    kind: 'displayed-quoted-text',
    grammarId: 'n5-wo-object',
    sentence: '例文として「本を読む」と、表示しました。',
    expectedPresent: false,
  },
  {
    kind: 'copied-quoted-text',
    grammarId: 'n5-wo-object',
    sentence: 'ノートに「本を読む」と書きました。',
    expectedPresent: false,
  },
  {
    kind: 'displayed-quoted-text',
    grammarId: 'n5-wo-object',
    sentence: '画面に「本を読む」と表示しました。',
    expectedPresent: false,
  },
  {
    kind: 'displayed-quoted-text',
    grammarId: 'n5-wo-object',
    sentence: 'プリントに「本を読む」と、あります。',
    expectedPresent: false,
  },
  {
    kind: 'copied-quoted-text',
    grammarId: 'n5-te-iru-progressive',
    sentence: 'ノートに「本を読んでいる」と書きました。',
    expectedPresent: false,
  },
  {
    kind: 'displayed-quoted-text',
    grammarId: 'n5-desu-copula',
    sentence: '黒板に「学生です」とあります。',
    expectedPresent: false,
  },
  {
    kind: 'displayed-quoted-text',
    grammarId: 'n5-masu-polite',
    sentence: '例文として「行きます」と表示した。',
    expectedPresent: false,
  },
  {
    kind: 'copied-quoted-text',
    grammarId: 'n5-ne-confirmation',
    sentence: 'ノートに「大丈夫ね」と書きました。',
    expectedPresent: false,
  },
];

function scoreQuoteContextTargets(expectations, { catalog, matchers }) {
  const tokenized = tokenizeBatch(expectations.map(expectation => expectation.sentence));
  const failures = [];
  let passedTargetExpectations = 0;
  let liveFalseNegatives = 0;
  let copiedMentionedDisplayedFalsePositives = 0;

  for (let index = 0; index < expectations.length; index++) {
    const expectation = expectations[index];
    const observedIds = new Set(
      findGrammarMatches(tokenized[index], { catalog, matchers }).map(match => match.grammarId)
    );
    const observedPresent = observedIds.has(expectation.grammarId);
    const passed = observedPresent === expectation.expectedPresent;
    if (passed) {
      passedTargetExpectations += 1;
      continue;
    }

    if (expectation.expectedPresent) {
      liveFalseNegatives += 1;
    } else {
      copiedMentionedDisplayedFalsePositives += 1;
    }
    failures.push(
      `${expectation.grammarId} ${expectation.expectedPresent ? 'missing' : 'unexpected'} ` +
      `${expectation.kind}: ${expectation.sentence}`
    );
  }

  const totalTargetExpectations = expectations.length;
  return {
    totalTargetExpectations,
    passedTargetExpectations,
    quoteContextTargetAccuracy: passedTargetExpectations / totalTargetExpectations,
    liveFalseNegatives,
    copiedMentionedDisplayedFalsePositives,
    failures,
  };
}

function formatQuoteContextScore(score) {
  return [
    `quote_context_target_accuracy: ${score.passedTargetExpectations}/${score.totalTargetExpectations}`,
    `live quoted speech false negatives: ${score.liveFalseNegatives}`,
    `copied/mentioned/displayed quoted-text false positives: ${score.copiedMentionedDisplayedFalsePositives}`,
    `failures: ${score.failures.join(' | ')}`,
  ].join('; ');
}

describe('N5 quote-context adjudicated targets', () => {
  const catalog = loadGrammarCatalog();
  const matchers = loadGrammarMatchers();
  const score = scoreQuoteContextTargets(TARGET_EXPECTATIONS, { catalog, matchers });

  it('meets the hand-adjudicated quote-context target expectations', () => {
    assert.equal(
      score.passedTargetExpectations,
      score.totalTargetExpectations,
      formatQuoteContextScore(score)
    );
  });
});
