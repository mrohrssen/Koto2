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
  const tok = (surface, base) => ({ surface, base, reading: '', meaning: '' });
  const punct = (ch) => ({ surface: ch });
  const line = (text, tokenDefs) => ({
    raw: text,
    tokens: tokenDefs,
    words: tokenDefs.filter(t => t.base).map(t => t.base),
  });

  describe('isLineEligible', () => {
    it('passes a line with 0 unknown words', () => {
      const l = line('すごい！', [tok('すごい', 'すごい'), punct('！')]);
      assert.equal(isLineEligible(l, new Set(['すごい'])), true);
    });

    it('passes a single-sentence line with exactly 1 unknown (i+1)', () => {
      const l = line('いっしょに いく？', [
        tok('一緒', '一緒'), punct('に'), tok('行く', '行く'), punct('？'),
      ]);
      assert.equal(isLineEligible(l, new Set(['行く'])), true);
    });

    it('checks i+1 per sentence — two sentences each with 1 unknown passes', () => {
      const l = line('こんにちは！いっしょに いく？', [
        tok('こんにちは', 'こんにちは'), punct('！'),
        tok('一緒', '一緒'), punct('に'), tok('行く', '行く'), punct('？'),
      ]);
      assert.equal(isLineEligible(l, new Set(['行く'])), true);
    });

    it('rejects when any sentence has 2+ unknown words', () => {
      const l = line('こんにちは！いっしょに いく？', [
        tok('こんにちは', 'こんにちは'), punct('！'),
        tok('一緒', '一緒'), punct('に'), tok('行く', '行く'), punct('？'),
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
        { id: 's0', lines: [line('こんにちは！', [tok('こんにちは', 'こんにちは'), punct('！')])] },
        { id: 's1', lines: [
          line('こんにちは！', [tok('こんにちは', 'こんにちは'), punct('！')]),
          line('いっしょに いく？', [tok('一緒', '一緒'), punct('に'), tok('行く', '行く'), punct('？')]),
        ]},
      ];
      const known = new Set(['こんにちは', '行く']);
      const eligible = filterEligibleScripts(scripts, known);
      assert.equal(eligible.length, 2);
    });

    it('at 0 known, only single-word-per-sentence scripts eligible', () => {
      const scripts = [
        { id: 's0', lines: [line('こんにちは！', [tok('こんにちは', 'こんにちは'), punct('！')])] },
        { id: 's1', lines: [line('いっしょに いく？', [tok('一緒', '一緒'), punct('に'), tok('行く', '行く'), punct('？')])] },
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
        line('こんにちは！', [tok('こんにちは', 'こんにちは'), punct('！')]),
      ];
      const selected = selectNpcLine(lines, new Set());
      assert.ok(selected);
      assert.equal(selected.raw, 'こんにちは！');
    });

    it('falls back to line with fewest unknowns when none eligible', () => {
      const lines = [
        line('a b c', [tok('a', 'a'), tok('b', 'b'), tok('c', 'c')]),
      ];
      const result = selectNpcLine(lines, new Set());
      assert.ok(result);
      assert.equal(result.raw, 'a b c');
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
