import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { sceneKindForPhase } from '../../../public/js/scenes/phase-scene-map.js';

describe('phase scene mapping', () => {
  it('treats skillMaster as exploration because it renders in the active run area', () => {
    assert.equal(sceneKindForPhase('skillMaster'), 'exploration');
  });

  it('keeps no-save and hub phases on the hub scene', () => {
    assert.equal(sceneKindForPhase('no_save'), 'hub');
    assert.equal(sceneKindForPhase('hub'), 'hub');
    assert.equal(sceneKindForPhase('area_selection'), 'hub');
  });

  it('leaves owner-driven phases to their existing transition code', () => {
    assert.equal(sceneKindForPhase('combat'), 'external');
    assert.equal(sceneKindForPhase('room'), 'external');
  });
});
