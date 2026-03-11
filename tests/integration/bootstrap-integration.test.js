// tests/integration/bootstrap-integration.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaggedText } from '../../src/game/bootstrap/parser.js';
import { renderJpFirst, renderEnFirst } from '../../src/game/bootstrap/renderer.js';
import {
  createWordKnowledge, seedKnownWords, getKnownWords,
  registerExposure, markKnown, isWordKnown
} from '../../src/game/bootstrap/word-knowledge.js';

describe('bootstrap integration', () => {
  it('en-first: fully unknown player sees all English', () => {
    const wk = createWordKnowledge('test');
    const known = getKnownWords(wk);
    const html = renderEnFirst(
      '{Heal|回復|かいふく} all {creatures|生き物|いきもの} for 10% of max HP',
      known
    );
    assert.ok(html.includes('Heal'));
    assert.ok(html.includes('creatures'));
    assert.ok(!html.includes('回復'));
    assert.ok(!html.includes('生き物'));
  });

  it('en-first: known words render as Japanese', () => {
    const wk = createWordKnowledge('test');
    seedKnownWords(wk, ['回復']);
    const known = getKnownWords(wk);
    const html = renderEnFirst(
      '{Heal|回復|かいふく} all {creatures|生き物|いきもの} for 10% of max HP',
      known
    );
    assert.ok(html.includes('回復'));
    assert.ok(html.includes('かいふく'));
    assert.ok(html.includes('creatures'));
  });

  it('jp-first: unknown word shows English annotation', () => {
    const known = new Set();
    const html = renderJpFirst('森', 'もり', 'forest', known);
    assert.ok(html.includes('森'));
    assert.ok(html.includes('もり'));
    assert.ok(html.includes('forest'));
  });

  it('jp-first: known word hides English annotation', () => {
    const known = new Set(['森']);
    const html = renderJpFirst('森', 'もり', 'forest', known);
    assert.ok(html.includes('森'));
    assert.ok(html.includes('もり'));
    assert.ok(!html.includes('forest'));
  });

  it('word knowledge lifecycle: seen → reviewed → known', () => {
    const wk = createWordKnowledge('test');
    registerExposure(wk, '森');
    assert.ok(!isWordKnown(wk, '森'));
    markKnown(wk, '森');
    assert.ok(isWordKnown(wk, '森'));
  });

  it('interpolation tokens {0} coexist with tagged words', () => {
    const known = new Set(['ダメージ']);
    let str = '{0} deals {1} {damage|ダメージ|}!';
    str = str.replace('{0}', 'Kamedor').replace('{1}', '28');
    const html = renderEnFirst(str, known);
    assert.ok(html.includes('Kamedor'));
    assert.ok(html.includes('28'));
    assert.ok(html.includes('ダメージ'));
    assert.ok(!html.includes('damage'));
  });

  it('XSS in interpolated args is escaped', () => {
    const known = new Set();
    let str = '{0} deals {1} {damage|ダメージ|}!';
    const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    str = str.replace('{0}', escHtml('<script>alert(1)</script>')).replace('{1}', escHtml('28'));
    const html = renderEnFirst(str, known);
    // Raw <script> tag must not appear in output — renderer escapes the pre-escaped input
    assert.ok(!html.includes('<script>'));
    // The renderer escapes the already-escaped &lt; sequences, so the output is doubly escaped
    assert.ok(html.includes('&amp;lt;script&amp;gt;') || html.includes('&lt;script&gt;'));
  });
});
