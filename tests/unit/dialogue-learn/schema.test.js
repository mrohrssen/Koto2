import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARN_LESSON_SCHEMA_VERSION,
  buildLearnEntitySignature,
  normalizeLearnEntities,
  normalizeLearnTokens,
  parseLearnLessonJson,
  validateLearnLesson
} from '../../../src/dialogue-learn/schema.js';

const tokens = [
  { surface: '花', reading: 'はな', baseForm: '花', pos: 'noun', meaning: 'flower / blossom', entity: true },
  { surface: 'は', reading: 'は', baseForm: 'は', pos: 'particle' },
  { surface: '森', reading: 'もり', baseForm: '森', pos: 'noun', meaning: 'forest' },
  { surface: 'で', reading: 'で', baseForm: 'で', pos: 'particle' },
  { surface: '光', reading: 'ひかり', baseForm: '光', pos: 'noun', meaning: 'light' },
  { surface: 'を', reading: 'を', baseForm: 'を', pos: 'particle' },
  { surface: '見た', reading: 'みた', baseForm: '見る', pos: 'verb', meaning: 'saw' },
  { surface: '。', reading: '。', baseForm: '。', pos: 'punctuation' }
];

const entities = [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }];

function validLesson(overrides = {}) {
  return {
    schemaVersion: LEARN_LESSON_SCHEMA_VERSION,
    sourceText: '花は森で光を見た。',
    pronunciation: { kana: 'はな は もり で ひかり を みた', romaji: 'hana wa mori de hikari o mita' },
    translation: 'Flower saw a light in the forest.',
    breakdown: [
      {
        kind: 'entity',
        text: '花',
        reading: 'はな',
        meaning: 'Flower, the creature',
        explanation: 'In this Koto line, 花 refers to the creature named Flower. In ordinary Japanese, 花 means flower / blossom.'
      },
      { kind: 'particle', text: 'は', reading: 'わ', meaning: 'topic marker', explanation: 'After Flower, は marks who the sentence is about.' },
      { kind: 'phrase', text: '森で', reading: 'もりで', meaning: 'in the forest', explanation: '森 means forest. で marks the place where the action happens.' },
      { kind: 'phrase', text: '光を', reading: 'ひかりを', meaning: 'a light', explanation: '光 is what was seen. を marks the direct object.' },
      { kind: 'verb', text: '見た', reading: 'みた', meaning: 'saw', explanation: '見た is the past form of 見る, to see.' }
    ],
    grammarHints: [
      { title: 'Verb goes last.', body: 'Japanese sentences put the verb at the end. Read to the end first to find 見た, saw.' },
      { title: 'を marks the object.', body: '光を tells you 光 is what got seen.' }
    ],
    otherTips: [
      { title: 'Entity vs ordinary noun.', body: 'In this Koto sentence, 花 is the creature Flower. In ordinary Japanese, 花 means flower / blossom.' }
    ],
    ...overrides
  };
}

describe('dialogue learn schema', () => {
  it('normalizes tokens and entities for prompting and validation', () => {
    assert.deepEqual(normalizeLearnTokens(tokens).map(token => token.surface), ['花', 'は', '森', 'で', '光', 'を', '見た', '。']);
    assert.deepEqual(normalizeLearnEntities(entities), [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }]);
  });

  it('builds order-independent entity signatures with ordinary meanings when available', () => {
    const normalizedTokens = normalizeLearnTokens(tokens);
    assert.equal(
      buildLearnEntitySignature(entities, normalizedTokens),
      'creature:hana:花:Flower:flower / blossom'
    );
  });

  it('parses strict JSON without markdown wrappers', () => {
    assert.deepEqual(parseLearnLessonJson(JSON.stringify(validLesson())).sourceText, '花は森で光を見た。');
    assert.equal(parseLearnLessonJson('```json\n{}\n```'), null);
    assert.equal(parseLearnLessonJson('Here is the JSON: {}'), null);
  });

  it('accepts a valid Standard Study Card lesson', () => {
    const result = validateLearnLesson(validLesson(), {
      sourceText: '花は森で光を見た。',
      tokens: normalizeLearnTokens(tokens),
      entities: normalizeLearnEntities(entities)
    });
    assert.deepEqual(result, { ok: true, lesson: validLesson() });
  });

  it('rejects missing, extra, or wrong top-level schema fields', () => {
    const missing = validLesson();
    delete missing.translation;
    assert.equal(validateLearnLesson(missing, { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
    assert.equal(validateLearnLesson(validLesson({ extra: true }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
    assert.equal(validateLearnLesson(validLesson({ schemaVersion: 999 }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
  });

  it('accepts AI-authored breakdowns that group parser hints into phrases', () => {
    const groupedLesson = validLesson({
      breakdown: [
        { kind: 'entity', text: '花は', reading: 'はなは', meaning: 'as for Flower', explanation: 'The AI may explain the entity together with its topic particle.' },
        { kind: 'phrase', text: '森で', reading: 'もりで', meaning: 'in the forest', explanation: 'This phrase gives the location of the action.' },
        { kind: 'phrase', text: '光を見た', reading: 'ひかりをみた', meaning: 'saw a light', explanation: 'The object and verb can be taught together as the main action.' }
      ]
    });
    const result = validateLearnLesson(groupedLesson, {
      sourceText: '花は森で光を見た。',
      tokens: normalizeLearnTokens(tokens),
      entities: normalizeLearnEntities(entities)
    });
    assert.equal(result.ok, true);
  });

  it('does not judge Japanese analysis against parser hints', () => {
    const aiLedLesson = validLesson({
      breakdown: [
        { kind: 'grammar', text: '光を見た', reading: 'ひかりをみた', meaning: 'noticed a light', explanation: 'The AI can choose a natural explanation that is not copied from parser meanings.' }
      ],
      grammarHints: [{ title: 'Natural reading.', body: 'The model may explain nuance without matching tokenizer boundaries.' }]
    });
    assert.equal(validateLearnLesson(aiLedLesson, { sourceText: '花は森で光を見た。', tokens: normalizeLearnTokens(tokens), entities: normalizeLearnEntities(entities) }).ok, true);
  });

  it('rejects malformed breakdown items without enforcing token correspondence', () => {
    const missingText = validLesson({
      breakdown: [{ kind: 'phrase', reading: 'もりで', meaning: 'in the forest', explanation: 'Missing text is invalid JSON shape for this UI.' }]
    });
    assert.equal(validateLearnLesson(missingText, { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
  });

  it('does not judge lesson prose beyond JSON shape and bounded fields', () => {
    assert.equal(validateLearnLesson(validLesson({ translation: '<b>Flower</b> saw a light.' }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, true);
    assert.equal(validateLearnLesson(validLesson({ otherTips: [{ title: 'Quiz.', body: 'What does 光 mean?' }] }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, true);
    assert.equal(validateLearnLesson(validLesson({ grammarHints: [{ title: 'N/A', body: 'No notes' }] }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, true);
  });
});
