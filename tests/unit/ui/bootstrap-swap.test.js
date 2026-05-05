import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderEnFirst, renderJpSentence, setKnownWords } from '../../../public/js/ui/bootstrap-client.js';

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

  it('appends sentence punctuation inside the previous Japanese word span', () => {
    const result = renderJpSentence([
      { surface: '待つ', baseForm: '待つ', reading: 'まつ', meaning: 'wait', pos: 'verb' },
      { surface: '。', pos: 'punctuation' },
    ], new Set(), null, {}, true);

    assert.match(result, /<\/ruby>。<span class="jp-stack-en">wait<\/span>/);
    assert.doesNotMatch(result, /class="jp-punct"/);
  });
});
