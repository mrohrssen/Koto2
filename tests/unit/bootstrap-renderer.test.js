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
  it('teaches first unknown word as Japanese with English annotation (i+1)', () => {
    const html = renderEnFirst('Heal all {creatures|生き物|いきもの}', new Set());
    // First (only) unknown word should be shown in Japanese with annotation
    assert.ok(html.includes('生き物'), 'should show kanji for i+1 word');
    assert.ok(html.includes('いきもの'), 'should show reading for i+1 word');
    assert.ok(html.includes('creatures'), 'should show English annotation for i+1 word');
    assert.ok(html.includes('Heal all'));
  });

  it('swaps known words to Japanese with ruby (no annotation)', () => {
    const html = renderEnFirst('Heal all {creatures|生き物|いきもの}', new Set(['生き物']));
    assert.ok(html.includes('生き物'));
    assert.ok(html.includes('いきもの'));
    assert.ok(!html.includes('bs-word-en'), 'known word should not have English annotation');
  });

  it('teaches only one unknown word when multiple are unknown', () => {
    const html = renderEnFirst(
      '{monster|モンスター|もんすたー} deals 28 {damage|ダメージ|}',
      new Set()
    );
    // First unknown (モンスター) gets taught
    assert.ok(html.includes('モンスター'), 'first unknown word should show Japanese');
    assert.ok(html.includes('monster'), 'first unknown word should have English annotation');
    // Second unknown (ダメージ) stays English
    assert.ok(html.includes('damage'), 'second unknown word should stay English');
    assert.ok(html.includes(' deals 28 '));
  });

  it('renders untagged text as-is', () => {
    const html = renderEnFirst('Hello world', new Set());
    assert.equal(html, 'Hello world');
  });

  it('teaches next unknown when some words are known', () => {
    const html = renderEnFirst(
      '{monster|モンスター|もんすたー} deals 28 {damage|ダメージ|}',
      new Set(['モンスター'])
    );
    // Known word shown in Japanese (no annotation)
    assert.ok(html.includes('モンスター'));
    // Unknown word (ダメージ) gets taught
    assert.ok(html.includes('ダメージ'), 'unknown word should show Japanese');
    assert.ok(html.includes('damage'), 'unknown word should have English annotation');
    assert.ok(html.includes(' deals 28 '));
  });

  it('shows no annotations when all words are known', () => {
    const html = renderEnFirst(
      '{monster|モンスター|もんすたー} deals 28 {damage|ダメージ|}',
      new Set(['モンスター', 'ダメージ'])
    );
    assert.ok(html.includes('モンスター'));
    assert.ok(html.includes('ダメージ'));
    assert.ok(!html.includes('bs-word-en'), 'all known = no English annotations');
  });

  it('HTML-escapes all output', () => {
    const html = renderEnFirst('{<script>|悪|あく}', new Set());
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});
