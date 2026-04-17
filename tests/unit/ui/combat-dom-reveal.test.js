import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const slotHtml = () => ({
  dataset: { index: '0', creatureId: 'tetsu', hp: '10' },
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  querySelectorAll: () => [],
  querySelector: () => ({ classList: { remove() { this.removed = true; } }, style: {}, textContent: '' }),
});

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
await mock.module('../../../public/js/ui/romaji.js', { namedExports: { toRomaji: (s) => s } });
let sceneRef = null;
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => ({ currentScene: sceneRef }) },
});

describe('showFormation reveal-on-reuse', () => {
  it('calls revealFormationInfo when an existing Pixi sprite is already in place', async () => {
    // Scene has a formation ctx with a sprite already resting (not _entering).
    // showFormation called again with the same creature should trigger a
    // reveal on the DOM slot, not wait for a nonexistent entrance animation.
    const revealCalls = [];
    const existingSprite = { _entering: false };
    sceneRef = {
      disposed: false,
      formation: {
        lastFormationInput: { enemy: { creatures: [{ uid: 'tetsu-1', id: 'tetsu' }] } },
        creatureSprites: { enemy: new Map([['tetsu-1', existingSprite]]) },
      },
    };
    // Patch document.querySelector so the reveal call finds the slot.
    const origDoc = globalThis.document;
    const origWindow = globalThis.window;
    globalThis.document = {
      querySelector: (sel) => {
        if (sel.includes('formation-info')) {
          return { classList: { remove: (cls) => revealCalls.push({ sel, cls }) } };
        }
        return null;
      },
      createElement: () => {
        const el = {
          className: '',
          dataset: {},
          style: {},
          classList: {
            _set: new Set(),
            add(...cls) { cls.forEach(c => this._set.add(c)); },
            remove(...cls) { cls.forEach(c => this._set.delete(c)); },
            toggle(cls) { this._set.has(cls) ? this._set.delete(cls) : this._set.add(cls); },
            contains(cls) { return this._set.has(cls); },
          },
          children: [],
          setAttribute() {},
          appendChild(child) { this.children.push(child); },
          textContent: '',
        };
        return el;
      },
    };
    globalThis.window = {};
    try {
      const { showFormation } = await import(`../../../public/js/ui/combat-dom.js?v=${Date.now()}`);
      await showFormation('enemy', [{ id: 'tetsu', uid: 'tetsu-1', hp: 10, maxHp: 100 }]);
    } finally {
      globalThis.document = origDoc;
      globalThis.window = origWindow;
    }
    assert.ok(
      revealCalls.some(c => c.cls === 'formation-info--hidden'),
      'expected revealFormationInfo to remove the hidden class'
    );
  });
});
