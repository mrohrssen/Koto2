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

  it('slot tokens appear at correct position (first token for {item}... frames)', () => {
    const buySimple = frames.find(f => f.id === 'buy_simple');
    assert.ok(buySimple, 'buy_simple frame should exist');
    assert.deepEqual(buySimple.tokens[0], { slot: 'item' });
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
    const buySimple = frames.find(f => f.id === 'buy_simple');
    const kudasai = buySimple.tokens.find(t => t.base === 'くださる');
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

  it('demotes です to surface-only when not merged', () => {
    const buyWant = frames.find(f => f.id === 'buy_want');
    const desu = buyWant.tokens.find(t => t.surface === 'です');
    assert.ok(desu, 'should have です token');
    assert.equal(desu.base, undefined, 'です should be surface-only (demoted)');
  });

  it('merges adjacent tokens into dictionary entries (一つ, お願いします, すみません)', () => {
    const buyCount = frames.find(f => f.id === 'buy_counting');
    const hitotsu = buyCount.tokens.find(t => t.base === '一つ');
    assert.ok(hitotsu, 'should merge 一+つ into 一つ');
    assert.equal(hitotsu.surface, '一つ');

    const buyPlease = frames.find(f => f.id === 'buy_please_give');
    const onegai = buyPlease.tokens.find(t => t.base === 'お願いします');
    assert.ok(onegai, 'should merge お+願い+し+ます into お願いします');

    const buyExcuse = frames.find(f => f.id === 'buy_excuse_me');
    const sumimasen = buyExcuse.tokens.find(t => t.base === 'すみません');
    assert.ok(sumimasen, 'should merge すみ+ませ+ん into すみません');
    assert.equal(sumimasen.meaning, 'excuse me/sorry');
  });
});
