import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const fakeFormation = {
  innerHTML: '',
  style: { opacity: '' },
  classList: { toggle() {} },
  querySelectorAll: () => [],
  appendChild() {},
};

await mock.module('../../../public/js/dom.js', {
  namedExports: {
    dom: {
      sceneBackground: { style: {} },
      playerFormation: fakeFormation,
      enemyFormation:  fakeFormation,
      enemySprite:     { src: '', classList: { add() {}, remove() {} }, style: {}, onerror: null, onload: null },
      enemyName:       { textContent: '' },
      enemyInfo:       { classList: { add() {}, remove() {} } },
      enemyHpFill:     { style: { width: '' } },
      enemyHpText:     { textContent: '' },
      enemyHpBar:      { style: { display: '' } },
      enemySkillBar:   { innerHTML: '', style: { display: '' } },
      npcDisplay:      { classList: { add() {}, remove() {}, contains: () => false }, appendChild() {} },
      sceneToast:      { textContent: '', classList: { add() {}, remove() {} } },
    },
  },
});
await mock.module('../../../public/js/ui/sprite-utils.js', { namedExports: { SPRITE_VERSION: 'test' } });
await mock.module('../../../public/js/ui/romaji.js', {
  namedExports: {
    katakanaToHiragana: s => s,
    pronunciationReading: s => s,
    pronunciationReadingInfo: s => ({ reading: s, reasons: [] }),
    toPronunciationRomaji: s => s,
    toRomaji: (s) => s,
  },
});
let sceneRef = null;
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => ({ currentScene: sceneRef }) },
});

function buildFakeDocument(removeCalls) {
  return {
    // Record every classList.remove on every createElement'd node. The reveal
    // path drops formation-info--hidden from the in-hand infoBox built here.
    createElement: () => {
      const classSet = new Set();
      const el = {
        _classSet: classSet,
        className: '',
        dataset: {},
        style: {},
        classList: {
          add(...cls) { cls.forEach(c => classSet.add(c)); },
          remove(...cls) { cls.forEach(c => { classSet.delete(c); removeCalls.push(c); }); },
          toggle(cls) { classSet.has(cls) ? classSet.delete(cls) : classSet.add(cls); },
          contains(cls) { return classSet.has(cls); },
        },
        children: [],
        setAttribute() {},
        appendChild(child) { this.children.push(child); },
        textContent: '',
      };
      return el;
    },
  };
}

describe('showFormation reveal-on-reuse', () => {
  it('removes formation-info--hidden when an existing enemy Pixi sprite is past entrance', async () => {
    const existingSprite = { _entering: false };
    sceneRef = {
      disposed: false,
      formation: {
        lastFormationInput: { enemy: { creatures: [{ uid: 'tetsu-1', id: 'tetsu' }] } },
        creatureSprites: { enemy: new Map([['tetsu-1', existingSprite]]) },
      },
    };
    const removeCalls = [];
    const origDoc = globalThis.document;
    const origWindow = globalThis.window;
    globalThis.document = buildFakeDocument(removeCalls);
    globalThis.window = {};
    try {
      const { showFormation } = await import(`../../../public/js/ui/combat-dom.js?v=${Date.now()}`);
      await showFormation('enemy', [{ id: 'tetsu', uid: 'tetsu-1', hp: 10, maxHp: 100 }]);
    } finally {
      globalThis.document = origDoc;
      globalThis.window = origWindow;
    }
    assert.ok(
      removeCalls.includes('formation-info--hidden'),
      'expected the reveal path to remove formation-info--hidden on the in-hand infoBox'
    );
  });

  it('does NOT remove formation-info--hidden when the Pixi sprite is still entering', async () => {
    const enteringSprite = { _entering: true };
    sceneRef = {
      disposed: false,
      formation: {
        lastFormationInput: { enemy: { creatures: [{ uid: 'tetsu-1', id: 'tetsu' }] } },
        creatureSprites: { enemy: new Map([['tetsu-1', enteringSprite]]) },
      },
    };
    const removeCalls = [];
    const origDoc = globalThis.document;
    const origWindow = globalThis.window;
    globalThis.document = buildFakeDocument(removeCalls);
    globalThis.window = {};
    try {
      const { showFormation } = await import(`../../../public/js/ui/combat-dom.js?v=${Date.now()}`);
      await showFormation('enemy', [{ id: 'tetsu', uid: 'tetsu-1', hp: 10, maxHp: 100 }]);
    } finally {
      globalThis.document = origDoc;
      globalThis.window = origWindow;
    }
    assert.ok(
      !removeCalls.includes('formation-info--hidden'),
      'reveal should be gated on !_entering — the entrance animation is expected to fire the reveal'
    );
  });

  it('does not throw when no scene is mounted', async () => {
    sceneRef = null;
    const removeCalls = [];
    const origDoc = globalThis.document;
    const origWindow = globalThis.window;
    globalThis.document = buildFakeDocument(removeCalls);
    globalThis.window = {};
    try {
      const { showFormation } = await import(`../../../public/js/ui/combat-dom.js?v=${Date.now()}`);
      await assert.doesNotReject(() =>
        showFormation('enemy', [{ id: 'tetsu', uid: 'tetsu-1', hp: 10, maxHp: 100 }])
      );
    } finally {
      globalThis.document = origDoc;
      globalThis.window = origWindow;
    }
  });
});
