import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createMetaProgression } from '../../../src/game/state.js';

describe('japaneseDisplayMode in meta-progression', () => {
  it('defaults to hiragana for existing player safety', () => {
    const meta = createMetaProgression();
    assert.equal(meta.japaneseDisplayMode, 'hiragana');
    assert.equal(meta.kanaMode, false);
  });
});
