import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  getBackgroundMode,
  getRunBackgroundKey,
} = await import('../../../public/js/pixi/background-routing.js');

describe('background routing', () => {
  it('uses no Pixi area background outside an active run', () => {
    assert.equal(getRunBackgroundKey({ phase: 'hub', run: null, pvpActive: false }), null);
    assert.equal(getBackgroundMode({ desiredKey: null, pvpActive: false }), 'none');
  });

  it('uses the new battlefield renderer for every active run phase', () => {
    const state = {
      phase: 'friendlyNpc',
      run: {
        active: true,
        currentArea: { id: 'hajimari-no-hiroba', parallaxId: 'starter_meadow' },
      },
      pvpActive: false,
    };

    assert.equal(getRunBackgroundKey(state), 'starter_meadow');
    assert.equal(getBackgroundMode({ desiredKey: 'starter_meadow', pvpActive: false }), 'battlefield');
  });

  it('uses the PvP arena background while PvP battle is active', () => {
    assert.equal(getRunBackgroundKey({ phase: 'pvp_arena', run: null, pvpActive: true }), 'pvp_arena');
    assert.equal(getBackgroundMode({ desiredKey: 'pvp_arena', pvpActive: true }), 'battlefield');
  });
});
