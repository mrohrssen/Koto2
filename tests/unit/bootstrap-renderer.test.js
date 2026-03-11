// tests/unit/bootstrap-renderer.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderJpFirst, renderEnFirst } from '../../src/game/bootstrap/renderer.js';

describe('renderJpFirst', () => {
  it('shows English annotation when word is unknown', () => {
    const html = renderJpFirst('森', 'もり', 'forest', new Set());
    assert.ok(html.includes('<ruby>'));
    assert.ok(html.includes('森'));
    assert.ok(html.includes('もり'));
    assert.ok(html.includes('forest'));
  });

  it('hides English annotation when word is known', () => {
    const html = renderJpFirst('森', 'もり', 'forest', new Set(['森']));
    assert.ok(html.includes('<ruby>'));
    assert.ok(html.includes('森'));
    assert.ok(html.includes('もり'));
    assert.ok(!html.includes('forest'));
  });

  it('handles empty reading (katakana words)', () => {
    const html = renderJpFirst('クリティカル', '', 'critical', new Set());
    assert.ok(html.includes('クリティカル'));
    assert.ok(html.includes('critical'));
    assert.ok(!html.includes('<rt>'));
  });
});

describe('renderEnFirst', () => {
  it('renders tagged text with all words unknown as English', () => {
    const html = renderEnFirst('Heal all {creatures|生き物|いきもの}', new Set());
    assert.ok(html.includes('creatures'));
    assert.ok(!html.includes('生き物'));
    assert.ok(html.includes('Heal all'));
  });

  it('swaps known words to Japanese with ruby', () => {
    const html = renderEnFirst('Heal all {creatures|生き物|いきもの}', new Set(['生き物']));
    assert.ok(!html.includes('>creatures<'));
    assert.ok(html.includes('生き物'));
    assert.ok(html.includes('いきもの'));
  });

  it('renders untagged text as-is', () => {
    const html = renderEnFirst('Hello world', new Set());
    assert.equal(html, 'Hello world');
  });

  it('handles mixed tagged and untagged text', () => {
    const html = renderEnFirst(
      '{monster|モンスター|もんすたー} deals 28 {damage|ダメージ|}',
      new Set(['ダメージ'])
    );
    assert.ok(html.includes('monster'));
    assert.ok(html.includes('ダメージ'));
    assert.ok(html.includes(' deals 28 '));
  });

  it('HTML-escapes all output', () => {
    const html = renderEnFirst('{<script>|悪|あく}', new Set());
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});
