import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRoundCorpus,
  scoreRoundCorpus,
} from '../../scripts/score-grammar-corpus.js';

describe('grammar round corpus scorer', () => {
  it('validates required corpus fields', () => {
    assert.throws(
      () => validateRoundCorpus([{ id: 'bad-case' }]),
      /missing sentence/
    );
  });

  it('rejects duplicate sentences and invalid case kinds', () => {
    const validCase = {
      id: 'case-001',
      sentence: 'A',
      level: 'N3',
      targetGrammarIds: ['n3-test-a'],
      expected: [],
      kind: 'near-miss-negative',
      source: 'unit',
      rationale: 'Negative test case.'
    };

    assert.throws(
      () => validateRoundCorpus([
        validCase,
        { ...validCase, id: 'case-002' }
      ]),
      /duplicate sentence/
    );
    assert.throws(
      () => validateRoundCorpus([{ ...validCase, kind: 'bad-kind' }]),
      /invalid kind/
    );
  });

  it('scores precision, recall, F1, and sentence accuracy', () => {
    const corpus = [
      {
        id: 'positive',
        sentence: 'A',
        level: 'N3',
        targetGrammarIds: ['n3-test-a'],
        expected: ['n3-test-a'],
        kind: 'positive',
        source: 'unit',
        rationale: 'Positive test case.'
      },
      {
        id: 'negative',
        sentence: 'B',
        level: 'N3',
        targetGrammarIds: ['n3-test-a'],
        expected: [],
        kind: 'near-miss-negative',
        source: 'unit',
        rationale: 'Negative test case.'
      }
    ];
    const observedBySentence = new Map([
      ['A', ['n3-test-a']],
      ['B', ['n3-test-a']]
    ]);

    const score = scoreRoundCorpus(corpus, sentence => observedBySentence.get(sentence) || []);

    assert.equal(score.totalCases, 2);
    assert.equal(score.correctCases, 1);
    assert.equal(score.falsePositiveCount, 1);
    assert.equal(score.missCount, 0);
    assert.equal(score.accuracy, 0.5);
    assert.equal(score.precision, 0.5);
    assert.equal(score.recall, 1);
    assert.equal(Number(score.f1.toFixed(3)), 0.667);
  });
});
