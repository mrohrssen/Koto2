import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFrame } from '../../scripts/validate-dialogue.js';

const dict = new Map([
  ['犬', { reading: 'いぬ', definitions: [{ en: 'dog', primary: true }] }],
  ['猫', { reading: 'ねこ', definitions: [{ en: 'cat', primary: true }] }],
]);

describe('validateFrame', () => {
  it('passes a frame with valid words and no overrides', () => {
    const frame = {
      id: 'f1',
      category: 'bark_onHit',
      words: ['犬'],
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
    };
    assert.deepEqual(validateFrame(frame, dict), []);
  });

  it('flags words missing from the dictionary', () => {
    const frame = {
      id: 'f2',
      category: 'bark_onHit',
      words: ['狐'],
      tokens: [{ surface: '狐', base: '狐', reading: 'きつね', pos: 'Noun' }],
    };
    const errs = validateFrame(frame, dict);
    assert.equal(errs.length, 1);
    assert.match(errs[0], /狐.*not in dictionary/);
  });

  it('flags bark frames with more than 3 content words', () => {
    const frame = {
      id: 'f3',
      category: 'bark_onHit',
      words: ['犬', '猫', '犬', '猫'],
      tokens: [],
    };
    const errs = validateFrame(frame, dict);
    assert.ok(errs.some(e => /bark.*max 3/.test(e)));
  });

  it('passes a valid override', () => {
    const frame = {
      id: 'f4',
      category: 'bark_onHit',
      words: ['犬'],
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
      overrides: { '犬': 'pup (context)' },
    };
    assert.deepEqual(validateFrame(frame, dict), []);
  });

  it('flags an override key that is not a base form in the frame', () => {
    const frame = {
      id: 'f5',
      category: 'bark_onHit',
      words: ['犬'],
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
      overrides: { '猫': 'kitten' },
    };
    const errs = validateFrame(frame, dict);
    assert.ok(errs.some(e => /override key "猫"/.test(e)));
  });

  it('flags empty override values', () => {
    const frame = {
      id: 'f6',
      category: 'bark_onHit',
      words: ['犬'],
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
      overrides: { '犬': '   ' },
    };
    const errs = validateFrame(frame, dict);
    assert.ok(errs.some(e => /non-empty string/.test(e)));
  });

  it('flags overrides that are not an object', () => {
    const frame = {
      id: 'f7',
      category: 'bark_onHit',
      words: ['犬'],
      tokens: [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }],
      overrides: ['not', 'an', 'object'],
    };
    const errs = validateFrame(frame, dict);
    assert.ok(errs.some(e => /plain object/.test(e)));
  });

  it('allows an override for a word not in the dict (rare but legitimate)', () => {
    const frame = {
      id: 'f8',
      category: 'bark_onHit',
      words: ['犬'],
      tokens: [
        { surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' },
        { surface: 'ぴよん', base: 'ぴよん', reading: 'ぴよん', pos: 'Interjection' },
      ],
      overrides: { 'ぴよん': 'boing' },
    };
    // Only dict-miss on 'ぴよん'; override itself is valid.
    const errs = validateFrame(frame, dict);
    assert.equal(errs.length, 1);
    assert.match(errs[0], /ぴよん.*not in dictionary/);
  });
});
