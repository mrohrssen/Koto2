// tests/unit/game/kana-state.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMetaProgression } from '../../../src/game/state.js';

describe('kanaMode in meta-progression', () => {
  it('defaults to false in new meta-progression', () => {
    const meta = createMetaProgression();
    assert.strictEqual(meta.kanaMode, false);
  });

  it('can be set to true', () => {
    const meta = createMetaProgression();
    meta.kanaMode = true;
    assert.strictEqual(meta.kanaMode, true);
  });
});
