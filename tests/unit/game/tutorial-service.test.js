import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMetaProgression } from '../../../src/game/state.js';

describe('tutorial state', () => {
  it('new meta has tutorialStep 0 and tutorialFireDropsGifted false', () => {
    const meta = createMetaProgression();
    assert.equal(meta.tutorialStep, 0);
    assert.equal(meta.tutorialFireDropsGifted, false);
  });

  it('existing saves without tutorialStep get migrated to 7', () => {
    const oldMeta = { prologueComplete: true, lifetimeStats: { totalRuns: 5 } };
    if (oldMeta.tutorialStep === undefined) {
      oldMeta.tutorialStep = 7;
      oldMeta.tutorialFireDropsGifted = false;
    }
    assert.equal(oldMeta.tutorialStep, 7);
    assert.equal(oldMeta.tutorialFireDropsGifted, false);
  });
});
