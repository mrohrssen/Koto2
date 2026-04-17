import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const domStub = {
  playerFormation: { innerHTML: '', style: { opacity: '' }, querySelectorAll: () => [] },
  enemyFormation:  { innerHTML: '', style: { opacity: '' }, querySelectorAll: () => [] },
  creaturePopup:   { innerHTML: '', classList: { add() {}, remove() {} }, style: {} },
};

await mock.module('../../../public/js/dom.js', { namedExports: { dom: domStub } });
await mock.module('../../../public/js/ui/combat-dom.js', {
  namedExports: { showFormation: () => {}, hideFormation: () => {} },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: { renderJpSentence: () => '', getKnownWords: () => new Set(), entityToToken: (x) => x },
});
let initialized = false;
let sceneRef = null;
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: {
    getSceneManager: () => ({ currentScene: sceneRef }),
    isSceneManagerInitialized: () => initialized,
  },
});

const { render } = await import('../../../public/js/ui/creature-row.js');

describe('creature-row.render scene guards', () => {
  it('silently does nothing when scene manager not initialized (expected boot phase)', () => {
    initialized = false;
    assert.doesNotThrow(() => render([{ id: 'hi', uid: 'hi-1' }]));
  });

  it('logs error when scene manager is initialized but has no current scene', () => {
    initialized = true;
    sceneRef = null;
    const errors = [];
    const origErr = console.error;
    console.error = (...a) => errors.push(a);
    try { render([{ id: 'hi', uid: 'hi-1' }]); } finally { console.error = origErr; }
    assert.ok(
      errors.some(e => /creature-row.*no.*scene/i.test(String(e[0]))),
      'expected loud error about missing scene'
    );
  });

  it('does not call disposed scene syncCreatures', () => {
    initialized = true;
    let syncCalled = false;
    sceneRef = {
      disposed: true,
      entered: true,
      syncCreatures: async () => { syncCalled = true; },
      formation: { lastFormationInput: {} },
    };
    const errors = [];
    const origErr = console.error;
    console.error = (...a) => errors.push(a);
    try { render([{ id: 'hi', uid: 'hi-1' }]); } finally { console.error = origErr; }
    assert.strictEqual(syncCalled, false, 'disposed scene should not receive syncCreatures');
  });
});
