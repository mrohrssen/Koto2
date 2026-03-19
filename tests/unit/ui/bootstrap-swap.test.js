import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderEnFirst, setKnownWords } from '../../../public/js/ui/bootstrap-client.js';

describe('Koto2 bootstrap slot swap', () => {
  beforeEach(() => {
    setKnownWords(new Set(['亀']));
  });

  it('should show hiragana as base text instead of kanji', () => {
    const result = renderEnFirst('{turtle|亀|かめ}');
    assert.ok(result.includes('かめ'), 'Should show hiragana as base text');
    assert.ok(result.includes('kame'), 'Should show romaji as annotation');
    assert.ok(!result.includes('亀'), 'Should not show kanji');
  });
});
