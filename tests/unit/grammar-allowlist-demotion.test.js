import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDemoted } from '../../scripts/tokenize-static.js';

const st = (surface, baseForm, pos, extra = {}) => ({ surface, baseForm, pos, ...extra });

describe('frames-pipeline demotion via shared allowlist', () => {
  it('demotes くださる so shopPurchase templates stop counting it', () => {
    assert.equal(isDemoted(st('ください', 'くださる', '動詞')), true);
  });

  it('demotes なる (now unified with する/ある/いる)', () => {
    assert.equal(isDemoted(st('なる', 'なる', '動詞')), true);
  });

  it('demotes noise interjections and greetings by surface, even when dictionary-merged', () => {
    assert.equal(isDemoted(st('ああ', 'ああ', '感動詞')), true);
    assert.equal(isDemoted(st('こんにちは', 'こんにちは', '感動詞', { _isMerged: true })), true);
    assert.equal(isDemoted(st('すみません', 'すみません', '感動詞', { _isMerged: true })), true);
  });

  it('keeps merged content compounds as content (POS bypass preserved)', () => {
    assert.equal(isDemoted(st('大丈夫', '大丈夫', '形状詞', { _isMerged: true })), false);
  });

  it('keeps question words and teachable exclamations as content', () => {
    assert.equal(isDemoted(st('何', '何', '代名詞')), false);
    assert.equal(isDemoted(st('ごめん', 'ごめん', '感動詞')), false);
  });

  it('still demotes particles and punctuation', () => {
    assert.equal(isDemoted(st('を', 'を', '助詞')), true);
    assert.equal(isDemoted(st('！', '！', '補助記号')), true);
  });
});
