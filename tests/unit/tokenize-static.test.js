import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';

const FRAMES_PATH = join(import.meta.dirname, '../../data/dialogue/frames.json');

describe('tokenize-static output (frames.json)', () => {
  let frames;

  it('loads frames.json', () => {
    frames = JSON.parse(readFileSync(FRAMES_PATH, 'utf-8'));
    assert.ok(Array.isArray(frames));
    assert.ok(frames.length > 0);
  });

  it('every frame has required fields', () => {
    for (const frame of frames) {
      assert.ok(frame.id, `frame missing id`);
      assert.ok(frame.category, `frame ${frame.id} missing category`);
      assert.ok(frame.raw, `frame ${frame.id} missing raw`);
      assert.ok(Array.isArray(frame.tokens), `frame ${frame.id} missing tokens`);
      assert.ok(Array.isArray(frame.words), `frame ${frame.id} missing words`);
    }
  });

  it('slot tokens appear at correct positions', () => {
    const polite = frames.find(f => f.id === 'buy_polite');
    assert.deepEqual(polite.tokens[0], { slot: 'item' }, 'buy_polite: slot should be first');

    const excuse = frames.find(f => f.id === 'buy_excuse_me');
    assert.ok(excuse.tokens[0].base === 'すみません', 'buy_excuse_me: すみません should be first');
    const slotIdx = excuse.tokens.findIndex(t => t.slot === 'item');
    assert.ok(slotIdx > 0, 'buy_excuse_me: slot should come after すみません');
  });

  it('particles are surface-only (no base field)', () => {
    for (const frame of frames) {
      for (const token of frame.tokens) {
        if (token.slot) continue;
        if (['を', 'が', 'に', 'は', 'で'].includes(token.surface)) {
          assert.equal(token.base, undefined,
            `particle ${token.surface} in frame ${frame.id} should not have base`);
        }
      }
    }
  });

  it('content words have base, reading, and meaning', () => {
    const polite = frames.find(f => f.id === 'buy_polite');
    const kudasai = polite.tokens.find(t => t.base === 'くださる');
    assert.ok(kudasai, 'should have くださる content token');
    assert.ok(kudasai.reading, 'くださる should have reading');
    assert.equal(typeof kudasai.meaning, 'string', 'くださる should have meaning');
  });

  it('words array matches content tokens', () => {
    for (const frame of frames) {
      const contentBases = frame.tokens.filter(t => t.base).map(t => t.base);
      assert.deepEqual(frame.words, contentBases,
        `frame ${frame.id} words should match content token bases`);
    }
  });

  it('merges adjacent tokens into dictionary entries (すみません, ありがとうございます)', () => {
    const excuse = frames.find(f => f.id === 'buy_excuse_me');
    const sumimasen = excuse.tokens.find(t => t.base === 'すみません');
    assert.ok(sumimasen, 'should merge すみ+ませ+ん into すみません');

    const thanks = frames.find(f => f.id === 'buy_thanks');
    const arigatou = thanks.tokens.find(t => t.base === 'ありがとうございます');
    assert.ok(arigatou, 'should merge ありがとう+ございます into ありがとうございます');
  });
});
