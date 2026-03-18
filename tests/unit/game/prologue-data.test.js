// tests/unit/game/prologue-data.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Prologue data', () => {
  const prologue = JSON.parse(
    readFileSync(join(process.cwd(), 'data/prologue.json'), 'utf-8')
  );

  it('contains the hiragana question scene', () => {
    const scene = prologue.find(s => s.id === 'prologue-hiragana-question');
    assert.ok(scene, 'hiragana question scene should exist');
    assert.strictEqual(scene.speaker, 'Cid');
    assert.ok(scene.choices?.length === 2, 'should have 2 choices');
  });

  it('hiragana choices have correct IDs', () => {
    const scene = prologue.find(s => s.id === 'prologue-hiragana-question');
    const ids = scene.choices.map(c => c.id);
    assert.ok(ids.includes('kana-yes'), 'should have kana-yes choice');
    assert.ok(ids.includes('kana-no'), 'should have kana-no choice');
  });

  it('hiragana response scene follows the question', () => {
    const qIdx = prologue.findIndex(s => s.id === 'prologue-hiragana-question');
    const response = prologue[qIdx + 1];
    assert.strictEqual(response.id, 'prologue-hiragana-response');
    assert.strictEqual(response.conditional, 'kana-no');
  });
});
