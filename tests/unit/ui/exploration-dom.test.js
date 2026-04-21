import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- DOM stubs --------------------------------------------------------------
const domStub = {
  npcDisplay:    { classList: { add() {}, remove() {}, contains: () => false } },
  enemyName:     { textContent: '', innerHTML: '' },
  enemyInfo:     { classList: { add() {}, remove() {} } },
  enemyHpBar:    { style: { display: '' } },
  enemySkillBar: { innerHTML: '', style: { display: '' } },
  enemySprite:   { src: '', classList: { add() {}, remove() {} }, onerror: null, onload: null },
  playerFormation: { innerHTML: '', style: { opacity: '' }, querySelectorAll: () => [] },
  enemyFormation:  { innerHTML: '', style: { opacity: '' }, querySelectorAll: () => [] },
};

await mock.module('../../../public/js/dom.js', { namedExports: { dom: domStub } });
await mock.module('../../../public/js/ui/sprite-utils.js', { namedExports: { SPRITE_VERSION: 'test' } });
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: () => '',
    getKnownWords: () => new Set(),
    entityToToken: (x) => x,
    esc: (s) => s,
  },
});
await mock.module('../../../public/js/ui/combat-dom.js', {
  namedExports: { hideFormation: () => {}, hideEnemy: () => {} },
});
// getSceneManager returns null so we hit the "no scene" path — this is the
// exact path that was throwing the ReferenceError on production.
let sceneRef = null;
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => ({ currentScene: sceneRef }) },
});

const { showNpcTrainer } = await import('../../../public/js/ui/exploration-dom.js');

describe('showNpcTrainer', () => {
  beforeEach(() => { sceneRef = null; });

  it('does not throw ReferenceError when called with skipPixi: false and no scene mounted', () => {
    assert.doesNotThrow(() =>
      showNpcTrainer('Boy', 'boy-1', { role: 'trainer' }, { skipPixi: false })
    );
  });
});

describe('sceneShowNpc', () => {
  it('logs an error when called with no active scene (missed HubScene invariant)', async () => {
    sceneRef = null; // no active scene
    const errors = [];
    const origErr = console.error;
    console.error = (...a) => errors.push(a);
    try {
      // showCid() exercises sceneShowNpc internally via showNpcInDisplay.
      const { showCid } = await import(`../../../public/js/ui/exploration-dom.js?v=${Date.now()}`);
      showCid();
    } finally {
      console.error = origErr;
    }
    assert.ok(
      errors.some(e => /sceneShowNpc.*no.*scene|active scene/i.test(String(e[0]))),
      'expected a loud error about missing active scene'
    );
  });
});
