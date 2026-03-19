// tests/unit/game/prologue-data.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Prologue data', () => {
  const prologue = JSON.parse(
    readFileSync(join(process.cwd(), 'data/prologue.json'), 'utf-8')
  );

  // Hiragana mode was removed in Koto2 Task 4.1. These tests verify the
  // current prologue structure instead of the old kana-mode scenes.

  it('contains the starter selection scene at the end', () => {
    const lastScene = prologue[prologue.length - 1];
    assert.strictEqual(lastScene.id, 'prologue-starter-selection');
    assert.ok(lastScene.choices?.length >= 2, 'starter selection should have choices');
  });

  it('has at least 15 prologue scenes', () => {
    assert.ok(prologue.length >= 15, `Expected >= 15 scenes, got ${prologue.length}`);
  });

  it('does not contain hiragana question scene (removed in Koto2)', () => {
    const scene = prologue.find(s => s.id === 'prologue-hiragana-question');
    assert.strictEqual(scene, undefined, 'hiragana question scene should not exist');
  });
});
