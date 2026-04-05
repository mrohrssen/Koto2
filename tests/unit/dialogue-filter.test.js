import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLineEligible,
  filterEligibleScripts,
  selectNpcLine,
  selectBark,
  selectCidScript,
} from '../../src/game/dialogue-filter.js';

describe('dialogue-filter', () => {
  const tok = (surface, baseForm, pos = '名詞') => ({ surface, baseForm, pos, reading: '' });
  const punct = (ch) => ({ surface: ch, baseForm: ch, pos: '記号', reading: '' });
  const line = (text, tokenDefs) => ({
    text,
    _tokens: tokenDefs,
    _contentWords: tokenDefs.filter(t => t.pos !== '記号').map(t => t.baseForm),
  });

  describe('isLineEligible', () => {
    it('passes a line with 0 unknown words', () => {
      const l = line('すごい！', [tok('すごい', 'すごい'), punct('！')]);
      assert.equal(isLineEligible(l, new Set(['すごい'])), true);
    });

    it('passes a single-sentence line with exactly 1 unknown (i+1)', () => {
      const l = line('いっしょに いく？', [
        tok('一緒', '一緒'), tok('に', 'に', '助詞'), tok('行く', '行く', '動詞'), punct('？'),
      ]);
      assert.equal(isLineEligible(l, new Set(['に', '行く'])), true);
    });

    it('checks i+1 per sentence — two sentences each with 1 unknown passes', () => {
      const l = line('こんにちは！いっしょに いく？', [
        tok('こんにちは', 'こんにちは', '感動詞'), punct('！'),
        tok('一緒', '一緒'), tok('に', 'に', '助詞'), tok('行く', '行く', '動詞'), punct('？'),
      ]);
      assert.equal(isLineEligible(l, new Set(['に', '行く'])), true);
    });

    it('rejects when any sentence has 2+ unknown words', () => {
      const l = line('こんにちは！いっしょに いく？', [
        tok('こんにちは', 'こんにちは', '感動詞'), punct('！'),
        tok('一緒', '一緒'), tok('に', 'に', '助詞'), tok('行く', '行く', '動詞'), punct('？'),
      ]);
      assert.equal(isLineEligible(l, new Set()), false);
    });

    it('passes a punctuation-only line', () => {
      const l = line('！', [punct('！')]);
      assert.equal(isLineEligible(l, new Set()), true);
    });
  });

  describe('filterEligibleScripts', () => {
    it('returns only scripts where ALL lines are eligible', () => {
      const scripts = [
        { id: 's0', lines: [line('こんにちは！', [tok('こんにちは', 'こんにちは', '感動詞'), punct('！')])] },
        { id: 's1', lines: [
          line('こんにちは！', [tok('こんにちは', 'こんにちは', '感動詞'), punct('！')]),
          line('いっしょに いく？', [tok('一緒', '一緒'), tok('に', 'に', '助詞'), tok('行く', '行く', '動詞'), punct('？')]),
        ]},
      ];
      const known = new Set(['こんにちは', '行く', 'に']);
      const eligible = filterEligibleScripts(scripts, known);
      assert.equal(eligible.length, 2);
    });

    it('at 0 known, only single-word-per-sentence scripts eligible', () => {
      const scripts = [
        { id: 's0', lines: [line('こんにちは！', [tok('こんにちは', 'こんにちは', '感動詞'), punct('！')])] },
        { id: 's1', lines: [line('いっしょに いく？', [tok('一緒', '一緒'), tok('に', 'に', '助詞'), tok('行く', '行く', '動詞'), punct('？')])] },
      ];
      const eligible = filterEligibleScripts(scripts, new Set());
      assert.equal(eligible.length, 1);
      assert.equal(eligible[0].id, 's0');
    });
  });

  describe('selectCidScript', () => {
    it('prefers unseen scripts', () => {
      const scripts = [
        { id: 's0', lines: [line('a', [tok('a', 'a')])] },
        { id: 's1', lines: [line('b', [tok('b', 'b')])] },
      ];
      const selected = selectCidScript(scripts, new Set(['a']), ['s0']);
      assert.equal(selected.id, 's1');
    });

    it('returns null for empty eligible', () => {
      assert.equal(selectCidScript([], new Set(), []), null);
    });
  });

  describe('selectNpcLine', () => {
    it('returns an eligible line', () => {
      const lines = [
        line('こんにちは！', [tok('こんにちは', 'こんにちは', '感動詞'), punct('！')]),
      ];
      const selected = selectNpcLine(lines, new Set());
      assert.ok(selected);
      assert.equal(selected.text, 'こんにちは！');
    });

    it('returns null when no lines eligible', () => {
      const lines = [
        line('a b c', [tok('a', 'a'), tok('b', 'b'), tok('c', 'c')]),
      ];
      assert.equal(selectNpcLine(lines, new Set()), null);
    });
  });

  describe('selectBark', () => {
    it('returns a bark from the specified trigger', () => {
      const barkPool = {
        onHit: [line('いたい！', [tok('痛い', '痛い'), punct('！')])],
      };
      const bark = selectBark(barkPool, 'onHit', new Set());
      assert.ok(bark);
    });

    it('returns null for unknown trigger', () => {
      assert.equal(selectBark({}, 'nonexistent', new Set()), null);
    });
  });
});
