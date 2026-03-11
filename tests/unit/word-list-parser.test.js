import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseWordList } from '../../src/game/bootstrap/word-list-parser.js';

describe('parseWordList', () => {
  it('parses one word per line', () => {
    const words = parseWordList('森\n火\n水\n');
    assert.deepStrictEqual(words, ['森', '火', '水']);
  });

  it('handles Windows line endings', () => {
    const words = parseWordList('森\r\n火\r\n水\r\n');
    assert.deepStrictEqual(words, ['森', '火', '水']);
  });

  it('skips blank lines', () => {
    const words = parseWordList('森\n\n火\n\n');
    assert.deepStrictEqual(words, ['森', '火']);
  });

  it('trims whitespace', () => {
    const words = parseWordList('  森  \n  火  \n');
    assert.deepStrictEqual(words, ['森', '火']);
  });

  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(parseWordList(''), []);
  });

  it('deduplicates words', () => {
    const words = parseWordList('森\n森\n火\n');
    assert.deepStrictEqual(words, ['森', '火']);
  });

  it('skips lines with only ASCII (likely comments or headers)', () => {
    const words = parseWordList('# My word list\n森\nknown words:\n火\n');
    assert.deepStrictEqual(words, ['森', '火']);
  });
});
