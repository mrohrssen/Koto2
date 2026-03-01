import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildJudgePrompt,
  parseJudgeResponse,
  buildCritiqueFeedback,
} from '../../../scripts/sprite-gate2-lib.mjs';

// ---------------------------------------------------------------------------
// parseJudgeResponse
// ---------------------------------------------------------------------------

describe('Gate 2 — parseJudgeResponse', () => {
  it('parses well-formed JSON and returns correct scores and total', () => {
    const json = JSON.stringify({
      concept: 5,
      style: 4,
      readability: 3,
      reasoning: 'Good icon overall.',
    });

    const result = parseJudgeResponse(json);

    assert.equal(result.concept, 5);
    assert.equal(result.style, 4);
    assert.equal(result.readability, 3);
    assert.equal(result.total, 12);
    assert.equal(result.passed, true);
    assert.equal(result.reasoning, 'Good icon overall.');
  });

  it('fails a candidate with low concept score', () => {
    const json = JSON.stringify({
      concept: 2,
      style: 4,
      readability: 5,
      reasoning: 'Concept not clear.',
    });

    const result = parseJudgeResponse(json);

    assert.equal(result.concept, 2);
    assert.equal(result.passed, false);
  });

  it('fails if any single score is below 3', () => {
    // style is 2, others are fine
    const json = JSON.stringify({
      concept: 4,
      style: 2,
      readability: 5,
      reasoning: 'Style mismatch.',
    });

    const result = parseJudgeResponse(json);
    assert.equal(result.passed, false);

    // readability is 1, others are fine
    const json2 = JSON.stringify({
      concept: 5,
      style: 5,
      readability: 1,
      reasoning: 'Too small to read.',
    });

    const result2 = parseJudgeResponse(json2);
    assert.equal(result2.passed, false);
  });

  it('throws on non-JSON response', () => {
    assert.throws(
      () => parseJudgeResponse('I cannot evaluate this image.'),
      { message: /Could not extract JSON/ }
    );
  });

  it('handles JSON wrapped in markdown code blocks', () => {
    const wrapped = '```json\n{\n  "concept": 4,\n  "style": 3,\n  "readability": 5,\n  "reasoning": "Wrapped in markdown."\n}\n```';

    const result = parseJudgeResponse(wrapped);

    assert.equal(result.concept, 4);
    assert.equal(result.style, 3);
    assert.equal(result.readability, 5);
    assert.equal(result.total, 12);
    assert.equal(result.passed, true);
    assert.equal(result.reasoning, 'Wrapped in markdown.');
  });
});

// ---------------------------------------------------------------------------
// buildJudgePrompt
// ---------------------------------------------------------------------------

describe('Gate 2 — buildJudgePrompt', () => {
  it('action type includes "language learner" and target word', () => {
    const prompt = buildJudgePrompt({ type: 'action', wordEn: 'bite', word: '噛む' });

    assert.ok(prompt.includes('language learner'), 'Should mention language learner');
    assert.ok(prompt.includes('bite'), 'Should include English word');
    assert.ok(prompt.includes('噛む'), 'Should include Japanese word');
  });

  it('creature type includes "distinct, memorable creature" and NOT "guess the meaning"', () => {
    const prompt = buildJudgePrompt({ type: 'creature', wordEn: 'Hikaribon', word: 'ヒカリボン' });

    assert.ok(
      prompt.includes('distinct, memorable creature'),
      'Should mention distinct, memorable creature'
    );
    assert.ok(
      !prompt.includes('guess the meaning'),
      'Should NOT mention "guess the meaning" for creature type'
    );
  });

  it('background type includes "described environment"', () => {
    const prompt = buildJudgePrompt({ type: 'background', wordEn: 'Forest Temple', word: '森の神殿' });

    assert.ok(
      prompt.includes('described environment'),
      'Should mention described environment'
    );
    assert.ok(prompt.includes('Forest Temple'), 'Should include the environment name');
  });
});

// ---------------------------------------------------------------------------
// buildCritiqueFeedback
// ---------------------------------------------------------------------------

describe('Gate 2 — buildCritiqueFeedback', () => {
  it('generates correct feedback for low concept score', () => {
    const bestResult = { concept: 2, style: 4, readability: 4, total: 10, passed: false, reasoning: 'Not clear.' };
    const feedback = buildCritiqueFeedback(bestResult, 'bite');

    assert.ok(feedback.includes('not recognizable'), 'Should mention not recognizable');
    assert.ok(feedback.includes('bite'), 'Should include the English word');
    assert.ok(!feedback.includes('art style'), 'Should NOT mention art style when style is fine');
    assert.ok(!feedback.includes('unreadable'), 'Should NOT mention unreadable when readability is fine');
  });

  it('generates combined feedback for multiple low scores', () => {
    const bestResult = { concept: 1, style: 2, readability: 2, total: 5, passed: false, reasoning: 'Everything bad.' };
    const feedback = buildCritiqueFeedback(bestResult, 'heal');

    assert.ok(feedback.includes('not recognizable'), 'Should mention not recognizable for low concept');
    assert.ok(feedback.includes('art style'), 'Should mention art style for low style');
    assert.ok(feedback.includes('unreadable'), 'Should mention unreadable for low readability');
    assert.ok(feedback.includes('heal'), 'Should include the English word');
  });
});
