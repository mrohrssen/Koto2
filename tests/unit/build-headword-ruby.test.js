import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildHeadwordRuby } from '../../public/js/ui/romaji.js';

describe('buildHeadwordRuby', () => {
  it('beginner mode, pure hiragana word: ruby with romaji on top', () => {
    const html = buildHeadwordRuby('たべる', 'たべる', false);
    assert.equal(html, '<ruby>たべる<rt>taberu</rt></ruby>');
  });

  it('beginner mode, kanji base with hiragana reading: still shows reading + romaji (kanji ignored in beginner mode)', () => {
    const html = buildHeadwordRuby('食べる', 'たべる', false);
    assert.equal(html, '<ruby>たべる<rt>taberu</rt></ruby>');
  });

  it('kanji mode, kanji base differs from reading: ruby with hiragana on top, kanji below', () => {
    const html = buildHeadwordRuby('食べる', 'たべる', true);
    assert.equal(html, '<ruby>食べる<rt>たべる</rt></ruby>');
  });

  it('kanji mode, kana-only word (base === reading): bare reading, no ruby', () => {
    const html = buildHeadwordRuby('かわいい', 'かわいい', true);
    assert.equal(html, 'かわいい');
  });

  it('empty reading: bare base, no ruby (both modes)', () => {
    assert.equal(buildHeadwordRuby('dog', '', false), 'dog');
    assert.equal(buildHeadwordRuby('dog', '', true), 'dog');
  });

  it('escapes HTML in base and reading to prevent injection', () => {
    const html = buildHeadwordRuby('<script>x</script>', 'reading', true);
    assert.equal(html, '<ruby>&lt;script&gt;x&lt;/script&gt;<rt>reading</rt></ruby>');
  });

  it('escapes ampersands and quotes', () => {
    const html = buildHeadwordRuby('a&b"c', 'a&b"c', true);
    assert.equal(html, 'a&amp;b&quot;c');
  });
});
