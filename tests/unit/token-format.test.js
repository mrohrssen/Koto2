import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  entityToToken,
  assembleFrame,
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
});
