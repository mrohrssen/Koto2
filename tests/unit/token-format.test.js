import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  entityToToken,
  assembleFrame,
  isEligible,
  getEligibleFrameTokens,
  scoreCandidate,
  selectBestFrame,
} from '../../src/game/token-format.js';

describe('entityToToken', () => {
  it('maps item fields (word, reading, nameEn) to universal token', () => {
    const item = { word: '薬', reading: 'くすり', nameEn: 'medicine' };
    const token = entityToToken(item);
    assert.deepStrictEqual(token, {
      surface: '薬',
      base: '薬',
      reading: 'くすり',
      meaning: 'medicine',
      entity: true,
    });
  });

  it('maps creature fields (baseWord, baseReading, baseMeaning)', () => {
    const creature = { baseWord: '炎', baseReading: 'ほのお', baseMeaning: 'flame' };
    const token = entityToToken(creature);
    assert.deepStrictEqual(token, {
      surface: '炎',
      base: '炎',
      reading: 'ほのお',
      meaning: 'flame',
      entity: true,
    });
  });

  it('falls back through field names for NPCs (name, reading, nameEn)', () => {
    const npc = { name: '花子', reading: 'はなこ', nameEn: 'Hanako' };
    const token = entityToToken(npc);
    assert.deepStrictEqual(token, {
      surface: '花子',
      base: '花子',
      reading: 'はなこ',
      meaning: 'Hanako',
      entity: true,
    });
  });
});

describe('assembleFrame', () => {
  it('splices entity token into slot position', () => {
    const frame = {
      tokens: [
        { surface: 'この', base: 'この', reading: 'この', meaning: 'this' },
        { slot: 'item' },
        { surface: 'は', reading: 'は' },
      ],
      words: ['この'],
    };
    const entities = { item: { word: '薬', reading: 'くすり', nameEn: 'medicine' } };
    const result = assembleFrame(frame, entities);
    assert.equal(result.tokens.length, 3);
    assert.deepStrictEqual(result.tokens[1], {
      surface: '薬',
      base: '薬',
      reading: 'くすり',
      meaning: 'medicine',
      entity: true,
    });
  });

  it('merges entity base form into words array', () => {
    const frame = {
      tokens: [
        { surface: 'この', base: 'この', reading: 'この', meaning: 'this' },
        { slot: 'creature' },
      ],
      words: ['この'],
    };
    const entities = { creature: { baseWord: '炎', baseReading: 'ほのお', baseMeaning: 'flame' } };
    const result = assembleFrame(frame, entities);
    assert.deepStrictEqual(result.words, ['この', '炎']);
  });

  it('does NOT mutate original frame', () => {
    const frame = {
      tokens: [
        { surface: 'この', base: 'この', reading: 'この', meaning: 'this' },
        { slot: 'item' },
      ],
      words: ['この'],
    };
    const entities = { item: { word: '薬', reading: 'くすり', nameEn: 'medicine' } };
    const originalTokensLength = frame.tokens.length;
    const originalWordsLength = frame.words.length;
    assembleFrame(frame, entities);
    assert.equal(frame.tokens.length, originalTokensLength);
    assert.equal(frame.words.length, originalWordsLength);
    // Original slot token should still be a slot
    assert.equal(frame.tokens[1].slot, 'item');
  });

  it('handles frames with no slots (complete lines)', () => {
    const frame = {
      tokens: [
        { surface: 'すごい', base: 'すごい', reading: 'すごい', meaning: 'amazing' },
        { surface: '！' },
      ],
      words: ['すごい'],
    };
    const entities = {};
    const result = assembleFrame(frame, entities);
    assert.deepStrictEqual(result.tokens, frame.tokens);
    assert.deepStrictEqual(result.words, ['すごい']);
  });

  it('passes frame.overrides through into the returned object', () => {
    const frame = {
      id: 'f1',
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
      words: ['犬'],
      overrides: { '犬': 'pup' },
    };
    const result = assembleFrame(frame, {});
    assert.deepEqual(result.overrides, { '犬': 'pup' });
  });

  it('omits overrides when the frame has none', () => {
    const frame = {
      id: 'f2',
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
      words: ['犬'],
    };
    const result = assembleFrame(frame, {});
    assert.equal('overrides' in result, false);
  });
});

// Helper: content token (has base field)
const w = (surface, base) => ({ surface, base });
// Helper: entity token
const ent = (surface, base) => ({ surface, base, entity: true });
// Helper: punctuation / particle (no base field)
const p = (surface) => ({ surface });

describe('isEligible', () => {
  it('passes 0 unknowns', () => {
    const tokens = [w('猫', '猫'), p('。')];
    assert.equal(isEligible(tokens, new Set(['猫'])), true);
  });

  it('passes 1 unknown no entity (i+1)', () => {
    const tokens = [w('猫', '猫'), w('犬', '犬'), p('。')];
    assert.equal(isEligible(tokens, new Set(['猫'])), true);
  });

  it('rejects 2 unknowns no entity', () => {
    const tokens = [w('猫', '猫'), w('犬', '犬'), w('鳥', '鳥'), p('。')];
    assert.equal(isEligible(tokens, new Set(['猫'])), false);
  });

  it('allows 2 unknowns with entity', () => {
    const tokens = [ent('炎', '炎'), w('猫', '猫'), w('犬', '犬'), p('。')];
    // entity is unknown (炎) + 猫 unknown + 犬 known → 2 unknowns with entity = OK
    assert.equal(isEligible(tokens, new Set(['犬'])), true);
  });

  it('rejects 3 unknowns even with entity', () => {
    const tokens = [ent('炎', '炎'), w('猫', '猫'), w('犬', '犬'), w('鳥', '鳥'), p('。')];
    assert.equal(isEligible(tokens, new Set(['犬'])), false);
  });

  it('checks per sentence — each independent', () => {
    // Sentence 1: 1 unknown (OK), Sentence 2: 1 unknown (OK)
    const tokens = [
      w('猫', '猫'), w('犬', '犬'), p('。'),
      w('鳥', '鳥'), w('魚', '魚'), p('。'),
    ];
    assert.equal(isEligible(tokens, new Set(['猫', '鳥'])), true);
  });

  it('rejects if any sentence exceeds max', () => {
    // Sentence 1: 0 unknowns (OK), Sentence 2: 2 unknowns no entity (FAIL)
    const tokens = [
      w('猫', '猫'), p('。'),
      w('犬', '犬'), w('鳥', '鳥'), w('魚', '魚'), p('。'),
    ];
    assert.equal(isEligible(tokens, new Set(['猫', '犬'])), false);
  });

  it('handles text without sentence-ending punctuation', () => {
    // No sentence ender → treat entire token list as one sentence
    const tokens = [w('猫', '猫'), w('犬', '犬')];
    // 1 unknown, no entity → passes i+1
    assert.equal(isEligible(tokens, new Set(['猫'])), true);
  });
});

describe('scoreCandidate', () => {
  it('scores by total unknowns (higher unknowns = higher score)', () => {
    const tokens1 = [w('猫', '猫'), w('犬', '犬')];
    const tokens2 = [w('猫', '猫'), w('犬', '犬'), w('鳥', '鳥')];
    const known = new Set(['猫']);
    // tokens1: 1 unknown, tokens2: 2 unknowns → tokens2 scores higher
    assert.ok(scoreCandidate(tokens2, known) > scoreCandidate(tokens1, known));
  });

  it('breaks ties with entity presence', () => {
    const tokensNoEntity = [w('猫', '猫'), w('犬', '犬')];
    const tokensWithEntity = [ent('炎', '炎'), w('犬', '犬')];
    const known = new Set(['犬']);
    // Both have 1 unknown, same content count (2), but entity wins
    assert.ok(scoreCandidate(tokensWithEntity, known) > scoreCandidate(tokensNoEntity, known));
  });

  it('breaks further ties with content token count', () => {
    const tokensShort = [w('猫', '猫')];
    const tokensLong = [w('猫', '猫'), w('犬', '犬')];
    const known = new Set(['猫', '犬']);
    // Both have 0 unknowns, no entity, but tokensLong has more content tokens
    assert.ok(scoreCandidate(tokensLong, known) > scoreCandidate(tokensShort, known));
  });
});

describe('getEligibleFrameTokens', () => {
  it('returns {tokens, overrides?} when the frame is i+1-eligible', () => {
    const frame = {
      tokens: [w('はい', 'はい')],
      words: ['はい'],
    };
    const result = getEligibleFrameTokens(frame, new Set());
    assert.notStrictEqual(result.tokens, frame.tokens);
    assert.deepStrictEqual(result.tokens, frame.tokens);
    assert.equal('overrides' in result, false);
  });

  it('falls back to tokens when the frame exceeds i+1', () => {
    const frame = {
      tokens: [w('どの', 'どの'), w('能力', '能力'), p('？')],
      words: ['どの', '能力'],
    };
    const result = getEligibleFrameTokens(frame, new Set());
    assert.ok(Array.isArray(result.tokens));
    assert.equal(result.tokens.length, 3);
  });

  it('includes overrides when the frame has any', () => {
    const frame = {
      tokens: [w('どの', 'どの')],
      words: ['どの'],
      overrides: { 'どの': 'which / what (way)' },
    };
    const result = getEligibleFrameTokens(frame, new Set());
    assert.deepStrictEqual(result.overrides, { 'どの': 'which / what (way)' });
  });

  it('returns null for a missing frame', () => {
    assert.equal(getEligibleFrameTokens(null, new Set()), null);
  });
});

describe('selectBestFrame', () => {
  it('returns the top eligible candidate', () => {
    const known = new Set(['猫']);
    const result = selectBestFrame([
      { id: 'a', tokens: [w('猫', '猫'), p('。')], words: ['猫'] },
      { id: 'b', tokens: [w('猫', '猫'), w('犬', '犬'), p('。')], words: ['猫', '犬'] }
    ], known);
    assert.equal(result.id, 'b');
  });

  it('falls back to the first candidate when none are eligible', () => {
    const result = selectBestFrame([
      { id: 'a', tokens: [w('猫', '猫'), w('犬', '犬'), w('鳥', '鳥'), p('。')], words: ['猫', '犬', '鳥'] }
    ], new Set(['猫']));
    assert.equal(result.id, 'a');
  });

  it('randomizes among top-scoring ties when requested', () => {
    const known = new Set(['猫']);
    const candidates = [
      { id: 'a', tokens: [w('猫', '猫'), w('犬', '犬'), p('。')], words: ['猫', '犬'] },
      { id: 'b', tokens: [w('猫', '猫'), w('鳥', '鳥'), p('。')], words: ['猫', '鳥'] },
      { id: 'c', tokens: [w('猫', '猫'), p('。')], words: ['猫'] },
    ];
    const originalRandom = Math.random;
    Math.random = () => 0.75;
    try {
      const result = selectBestFrame(candidates, known, { randomizeTies: true });
      assert.equal(result.id, 'b');
    } finally {
      Math.random = originalRandom;
    }
  });

  it('returns null for an empty list', () => {
    assert.equal(selectBestFrame([], new Set()), null);
  });
});

describe('greeting selection (no slots)', () => {
  it('selects eligible greeting frame via isEligible + scoreCandidate', () => {
    const greet1 = {
      tokens: [
        { surface: 'こんにちは', base: 'こんにちは', reading: 'こんにちは', meaning: 'hello' },
        { surface: '！' },
      ],
      words: ['こんにちは'],
    };
    const greet2 = {
      tokens: [
        { surface: 'こんにちは', base: 'こんにちは', reading: 'こんにちは', meaning: 'hello' },
        { surface: '、' },
        { surface: 'どうぞ', base: 'どうぞ', reading: 'どうぞ', meaning: 'please' },
        { surface: '！' },
      ],
      words: ['こんにちは', 'どうぞ'],
    };

    const knownSet = new Set(['こんにちは']);
    const frames = [greet1, greet2];

    // Both are eligible (greet1: 0 unknowns, greet2: 1 unknown)
    const eligible = frames.filter(f => isEligible(f.tokens, knownSet));
    assert.equal(eligible.length, 2);

    // greet2 scores higher (1 unknown > 0 unknowns)
    eligible.sort((a, b) => scoreCandidate(b.tokens, knownSet) - scoreCandidate(a.tokens, knownSet));
    assert.deepEqual(eligible[0].words, ['こんにちは', 'どうぞ']);
  });
});
