import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeElement {
  constructor(tag, id = null) {
    this.tag = tag;
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this._innerHTML = '';
    this._textContent = '';
    this.disabled = false;
    this.style = {};
    this.events = {};
    this.classList = {
      add: (...classes) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.forEach(cls => current.add(cls));
        this.className = [...current].join(' ');
      },
      remove: (...classes) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.forEach(cls => current.delete(cls));
        this.className = [...current].join(' ');
      }
    };
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    this.children = [];

    if (this._innerHTML.includes('fusion-result-pedestal')) {
      const pedestal = new FakeElement('div');
      pedestal.className = 'fusion-result-pedestal';
      this.appendChild(pedestal);
    }

    if (this._innerHTML.includes('fusion-start-btn')) {
      const button = new FakeElement('button');
      button.className = 'fusion-start-btn';
      this.appendChild(button);
    }
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    this._innerHTML = this._textContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
  }

  addEventListener(type, handler) {
    this.events[type] = handler;
  }

  querySelector(selector) {
    return findFirst(this, selector);
  }

  querySelectorAll(selector) {
    return findAll(this, selector);
  }
}

function matchesSelector(element, selector) {
  if (selector.startsWith('.')) {
    return element.className.split(/\s+/).includes(selector.slice(1));
  }
  return false;
}

function findFirst(root, selector) {
  for (const child of root.children) {
    if (matchesSelector(child, selector)) return child;
    const nested = findFirst(child, selector);
    if (nested) return nested;
  }
  return null;
}

function findAll(root, selector, results = []) {
  for (const child of root.children) {
    if (matchesSelector(child, selector)) results.push(child);
    findAll(child, selector, results);
  }
  return results;
}

const elementsById = new Map();

function resetDocument() {
  elementsById.clear();
  elementsById.set('scene-area', new FakeElement('div', 'scene-area'));
  elementsById.set('action-area', new FakeElement('div', 'action-area'));
}

global.document = {
  createElement: (tag) => new FakeElement(tag),
  getElementById: (id) => elementsById.get(id) || null,
  querySelector: (selector) => {
    for (const element of elementsById.values()) {
      if (matchesSelector(element, selector)) return element;
      const found = element.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
};

global.setTimeout = (fn) => {
  fn();
  return 0;
};

await mock.module('../../../public/js/ui/sprite-utils.js', {
  exports: {
    creatureSpriteHtml: (id, label, element, className) =>
      `<img class="${className}" data-creature-id="${id}" alt="${label}" data-element="${element}">`
  }
});

await mock.module('../../../public/js/ui/ui-components.js', {
  exports: {
    renderChoices: ({ cards }) => {
      const actionArea = document.getElementById('action-area');
      actionArea.children = cards.map(() => {
        const choice = new FakeElement('button');
        choice.className = 'ui-choice';
        choice.parentNode = actionArea;
        return choice;
      });
    }
  }
});

await mock.module('../../../public/js/ui/dom-effects.js', {
  exports: {
    flashElement: () => {},
    spawnParticles: () => {}
  }
});

await mock.module('../../../public/js/audio.js', {
  exports: { playSFX: () => {} }
});

await mock.module('../../../public/js/native/index.js', {
  exports: { hapticLight: () => {} }
});

await mock.module('../../../public/js/ui/tutorial-copy.js', {
  exports: { getFusionLabNarration: () => [] }
});

const { init, show } = await import('../../../public/js/ui/fusion-lab.js');

describe('fusion lab result copy', () => {
  beforeEach(() => {
    resetDocument();
    init({
      apiGetCreatureCollection: async () => ({
        catalog: [
          { id: 'hi', name: '火', nameEn: 'Fire', element: 'fire' },
          { id: 'neko', name: '猫', nameEn: 'Cat', element: 'wind' },
          { id: 'hineko', name: '火猫', nameEn: 'Fire Cat', element: 'fire' }
        ]
      }),
      apiGetFusionState: async () => ({
        fusionCores: 1,
        recipes: [{
          id: 'fire-cat',
          nameEn: 'Fire Cat',
          resultId: 'hineko',
          canFuse: true,
          cost: { fusionCores: 1 },
          ingredientRequirements: [
            { id: 'hi', owned: 1, required: 1, missing: 0 },
            { id: 'neko', owned: 1, required: 1, missing: 0 }
          ]
        }]
      }),
      apiStartFusion: async () => ({
        success: true,
        fusionCores: 0,
        state: { meta: { creatureCollection: ['hineko'] } },
        recipes: [{
          id: 'fire-cat',
          nameEn: 'Fire Cat',
          resultId: 'hineko',
          canFuse: false,
          cost: { fusionCores: 1 },
          resultOwned: 1,
          ingredientRequirements: [
            { id: 'hi', owned: 0, required: 1, missing: 1 },
            { id: 'neko', owned: 0, required: 1, missing: 1 }
          ]
        }]
      }),
      getGameState: () => ({
        meta: {
          creatureCollection: [],
          tutorialFusionDataUnlocked: ['hineko'],
          tutorialFusionCoreAwarded: false,
          tutorialFusionComplete: false
        }
      }),
      updateGameState: () => {},
      showToast: () => {}
    });
  });

  it('shows Hineko obtained after the Fire Cat fusion succeeds', async () => {
    await show();

    const beforeScene = document.getElementById('scene-area').querySelector('.fusion-lab-scene');
    assert.match(beforeScene.innerHTML, /Fire Cat/);
    assert.doesNotMatch(beforeScene.innerHTML, /obtained|\+1 Copy/);

    const startButton = beforeScene.querySelector('.fusion-start-btn');
    await startButton.events.click();

    const afterScene = document.getElementById('scene-area').querySelector('.fusion-lab-scene');
    assert.match(afterScene.innerHTML, /Hineko obtained/);
    assert.doesNotMatch(afterScene.innerHTML, /\+1 Copy|Fire Cat obtained/);
  });
});
