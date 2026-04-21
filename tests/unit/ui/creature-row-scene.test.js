/**
 * Unit tests for setupCreatureRowListeners(scene).
 *
 * Task 15 (bulletproof rendering): the scene-based API is additive and
 * not yet called from any scene. These tests verify contract:
 *  1. It throws when `scene` is missing.
 *  2. It registers both listeners via `scene.addListener`, hooking the
 *     `dom.playerFormation` 'click' and `document` 'click' handlers.
 *
 * We mock globals BEFORE importing the module so dom.js / bootstrap-client
 * don't explode during module load.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ============ DOM MOCK SETUP ============
// Must be installed before importing creature-row.js since it imports dom.js,
// which calls document.getElementById at access time, and bootstrap-client,
// which reads document-ish globals during import.

const mockFormation = {
  addEventListener(_event, _handler) { /* no-op — init() uses this path */ },
  querySelector() { return null; }
};

global.document = {
  getElementById: () => mockFormation,
  addEventListener() { /* no-op */ },
  querySelector: () => null,
  querySelectorAll: () => []
};
global.window = global.window || { addEventListener: () => {} };
global.requestAnimationFrame = global.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
global.cancelAnimationFrame = global.cancelAnimationFrame || ((id) => clearTimeout(id));
global.performance = global.performance || { now: () => Date.now() };

// Import after globals are set
const { setupCreatureRowListeners } = await import('../../../public/js/ui/creature-row.js');

// ============ HELPERS ============

function makeFakeScene() {
  const calls = [];
  return {
    calls,
    addListener(target, event, handler, options) {
      calls.push({ target, event, handler, options });
      return handler;
    }
  };
}

// ============ TESTS ============

describe('setupCreatureRowListeners', () => {
  it('throws when scene is null', () => {
    assert.throws(
      () => setupCreatureRowListeners(null),
      /scene is required/
    );
  });

  it('throws when scene is undefined', () => {
    assert.throws(
      () => setupCreatureRowListeners(undefined),
      /scene is required/
    );
  });

  it('calls scene.addListener twice with a click handler on the formation and on document', () => {
    const scene = makeFakeScene();
    setupCreatureRowListeners(scene);

    assert.equal(scene.calls.length, 2);

    // First call: formation slot click
    assert.equal(scene.calls[0].target, mockFormation,
      'first listener should be registered on dom.playerFormation');
    assert.equal(scene.calls[0].event, 'click');
    assert.equal(typeof scene.calls[0].handler, 'function');

    // Second call: document-level click to hide popup
    assert.equal(scene.calls[1].target, global.document,
      'second listener should be registered on document');
    assert.equal(scene.calls[1].event, 'click');
    assert.equal(typeof scene.calls[1].handler, 'function');
  });
});
