import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- DOM stubs --------------------------------------------------------------
function classListStub() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)),
    contains: (name) => classes.has(name),
    reset: () => classes.clear(),
  };
}

const domStub = {
  npcDisplay:    { classList: classListStub() },
  enemyName:     { textContent: '', innerHTML: '' },
  enemyInfo:     { classList: classListStub() },
  enemyHpBar:    { style: { display: '' } },
  enemySkillBar: { innerHTML: '', style: { display: '' } },
  enemySprite:   { src: '', classList: classListStub(), onerror: null, onload: null },
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

const { showNpcInDisplay, showNpcTrainer } = await import('../../../public/js/ui/exploration-dom.js');

describe('showNpcTrainer', () => {
  beforeEach(() => {
    sceneRef = null;
    domStub.enemyName.textContent = '';
    domStub.enemyName.innerHTML = '';
    domStub.enemyInfo.classList.reset();
    domStub.npcDisplay.classList.reset();
    domStub.enemySprite.classList.reset();
  });

  it('does not throw ReferenceError when called with skipPixi: false and no scene mounted', () => {
    assert.doesNotThrow(() =>
      showNpcTrainer('Boy', 'boy-1', { role: 'trainer' }, { skipPixi: false })
    );
  });

  it('shows room NPC sprites without the combat enemy name pill', () => {
    showNpcInDisplay('Cid', '/assets/sprites/npcs/cid.webp?v=test', { skipPixi: true });

    assert.equal(domStub.npcDisplay.classList.contains('visible'), true);
    assert.equal(domStub.enemyInfo.classList.contains('visible'), false);
    assert.equal(domStub.enemyName.textContent, '');
  });

  it('shows trainer NPC sprites without the combat enemy name pill', () => {
    showNpcTrainer('Fumi', 'fumi', { role: 'guide' }, { skipPixi: true });

    assert.equal(domStub.npcDisplay.classList.contains('visible'), true);
    assert.equal(domStub.enemyInfo.classList.contains('visible'), false);
    assert.equal(domStub.enemyName.innerHTML, '');
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
