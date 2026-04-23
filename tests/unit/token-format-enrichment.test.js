import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleFrame,
  getEligibleFrameTokens,
  selectBestFrame,
} from '../../src/game/token-format.js';

const dict = new Map([
  ['犬', { reading: 'いぬ', definitions: [{ en: 'dog', primary: true }] }],
]);

describe('token-format enrichment', () => {
  it('assembleFrame stamps meaning on non-entity tokens when dict is supplied', () => {
    const frame = {
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }],
      words: ['犬'],
    };
    const out = assembleFrame(frame, {}, { dict });
    assert.equal(out.tokens[0].meaning, 'dog');
  });

  it('assembleFrame preserves entity.meaning from spliced entities', () => {
    const frame = {
      tokens: [{ slot: 'creature' }],
      words: [],
    };
    const entities = { creature: { baseWord: '犬', baseReading: 'いぬ', baseMeaning: 'Pup-mon' } };
    const out = assembleFrame(frame, entities, { dict });
    assert.equal(out.tokens[0].meaning, 'Pup-mon');
    assert.equal(out.tokens[0].entity, true);
  });

  it('assembleFrame leaves tokens unmeaning when dict is omitted', () => {
    const frame = {
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }],
      words: ['犬'],
    };
    const out = assembleFrame(frame, {});
    assert.equal(out.tokens[0].meaning, undefined);
  });

  it('getEligibleFrameTokens passes overrides through to enrichment', () => {
    const frame = {
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }],
      words: ['犬'],
      overrides: { 犬: 'pup' },
    };
    const known = new Set(['犬']);
    const out = getEligibleFrameTokens(frame, known, { dict });
    assert.equal(out.tokens[0].meaning, 'pup');
  });

  it('selectBestFrame enriches the winning candidate', () => {
    const candidates = [
      { tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }] },
    ];
    const known = new Set(['犬']);
    const best = selectBestFrame(candidates, known, { dict });
    assert.equal(best.tokens[0].meaning, 'dog');
  });
});
