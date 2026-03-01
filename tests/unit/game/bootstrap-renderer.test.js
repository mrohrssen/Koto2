import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderBootstrapNarration } from '../../../src/game/bootstrap-renderer.js';
import { createWordTracker, recordExposure } from '../../../src/game/word-tracker.js';

describe('Bootstrap Renderer - renderBootstrapNarration', () => {
  it('renders stage 1 word with furigana + romaji + English', () => {
    const tracker = createWordTracker('u1');
    // 風 is brand new (0 exposures) — will be stage 1 after this render
    const html = renderBootstrapNarration('A cold {wind|風|かぜ|kaze} blew.', tracker);
    // Stage 1: kanji with furigana above, romaji + English below
    assert.ok(html.includes('<ruby>風<rt>かぜ</rt></ruby>'));
    assert.ok(html.includes('kaze'));
    assert.ok(html.includes('wind'));
    assert.ok(html.includes('A cold'));
    assert.ok(html.includes('blew.'));
  });

  it('renders stage 2 word without romaji', () => {
    const tracker = createWordTracker('u1');
    for (let i = 0; i < 4; i++) recordExposure(tracker, '水');
    const html = renderBootstrapNarration('Some {water|水|みず|mizu} here.', tracker);
    assert.ok(html.includes('<ruby>水<rt>みず</rt></ruby>'));
    assert.ok(html.includes('water'));
    assert.ok(!html.includes('mizu'));
  });

  it('renders stage 3 word with furigana only', () => {
    const tracker = createWordTracker('u1');
    for (let i = 0; i < 10; i++) recordExposure(tracker, '火');
    const html = renderBootstrapNarration('The {fire|火|ひ|hi} burns.', tracker);
    assert.ok(html.includes('<ruby>火<rt>ひ</rt></ruby>'));
    assert.ok(!html.includes('>fire<'));
    assert.ok(!html.includes('hi'));
  });

  it('skips furigana when kanji equals hiragana', () => {
    const tracker = createWordTracker('u1');
    const html = renderBootstrapNarration('You {go|いく|いく|iku} now.', tracker);
    // Should NOT have ruby (would duplicate いく over いく)
    assert.ok(!html.includes('<ruby>いく<rt>いく</rt></ruby>'));
    assert.ok(html.includes('いく'));
  });

  it('escapes HTML in plain text segments', () => {
    const tracker = createWordTracker('u1');
    const html = renderBootstrapNarration('The <b>bold</b> {wind|風|かぜ|kaze}.', tracker);
    assert.ok(html.includes('&lt;b&gt;'));
  });

  it('returns array of exposed words for tracking', () => {
    const tracker = createWordTracker('u1');
    const { html, exposedWords } = renderBootstrapNarration('A {wind|風|かぜ|kaze} and {water|水|みず|mizu}.', tracker, { returnMeta: true });
    assert.deepStrictEqual(exposedWords.sort(), ['水', '風'].sort());
  });
});
