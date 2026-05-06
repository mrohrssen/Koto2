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
    tokens: [
      {
        surface: '花',
        reading: 'はな',
        romaji: 'hana',
        baseForm: '花',
        role: 'noun subject',
        meaning: 'the creature Flower',
        detail: 'Marked as a Koto creature in this sentence.',
        entity: {
          id: 'hana',
          type: 'creature',
          displayName: 'Flower',
          kotoMeaning: 'the creature Flower',
          ordinaryMeaning: 'flower / blossom'
        }
      },
      { surface: 'は', reading: 'は', romaji: 'wa', baseForm: 'は', role: 'topic marker', meaning: 'marks the topic', detail: 'Read 花は as as for Flower.' },
      { surface: '森', reading: 'もり', romaji: 'mori', baseForm: '森', role: 'place noun', meaning: 'forest' },
      { surface: 'で', reading: 'で', romaji: 'de', baseForm: 'で', role: 'location particle', meaning: 'marks where the action happens' },
      { surface: '光', reading: 'ひかり', romaji: 'hikari', baseForm: '光', role: 'object noun', meaning: 'light' },
      { surface: 'を', reading: 'を', romaji: 'o', baseForm: 'を', role: 'object marker', meaning: 'marks what was seen' },
      { surface: '見た', reading: 'みた', romaji: 'mita', baseForm: '見る', role: 'past verb', meaning: 'saw' },
      { surface: '。', reading: '。', romaji: '.', baseForm: '。', role: 'punctuation', meaning: 'sentence ending punctuation' }
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

  it('rejects token mismatches and token count mismatches', () => {
    const badSurface = validLesson();
    badSurface.tokens[0] = { ...badSurface.tokens[0], surface: '猫' };
    assert.equal(validateLearnLesson(badSurface, { sourceText: '花は森で光を見た。', tokens: normalizeLearnTokens(tokens), entities }).ok, false);

    const shortLesson = validLesson({ tokens: validLesson().tokens.slice(0, 2) });
    assert.equal(validateLearnLesson(shortLesson, { sourceText: '花は森で光を見た。', tokens: normalizeLearnTokens(tokens), entities }).ok, false);
  });

  it('rejects extra Japanese examples not present in trusted source data', () => {
    const bad = validLesson({
      grammarHints: [{ title: 'Example.', body: '猫は走った means the cat ran.' }]
    });
    assert.equal(validateLearnLesson(bad, { sourceText: '花は森で光を見た。', tokens: normalizeLearnTokens(tokens), entities: normalizeLearnEntities(entities) }).ok, false);
  });

  it('requires protected entity lesson data and an entity tip', () => {
    const noEntity = validLesson();
    delete noEntity.tokens[0].entity;
    assert.equal(validateLearnLesson(noEntity, { sourceText: '花は森で光を見た。', tokens: normalizeLearnTokens(tokens), entities: normalizeLearnEntities(entities) }).ok, false);

    const noTip = validLesson({ otherTips: [{ title: 'Reading habit.', body: 'Scan to 見た first.' }] });
    assert.equal(validateLearnLesson(noTip, { sourceText: '花は森で光を見た。', tokens: normalizeLearnTokens(tokens), entities: normalizeLearnEntities(entities) }).ok, false);
  });

  it('rejects markdown, HTML, filler, quizzes, and SRS instructions in strings', () => {
    assert.equal(validateLearnLesson(validLesson({ translation: '<b>Flower</b> saw a light.' }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
    assert.equal(validateLearnLesson(validLesson({ otherTips: [{ title: 'Quiz.', body: 'What does 光 mean?' }] }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
    assert.equal(validateLearnLesson(validLesson({ grammarHints: [{ title: 'N/A', body: 'No notes' }] }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
  });
});
