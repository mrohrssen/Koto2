import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

class FakeElement {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.eventHandlers = {};
    this.dataset = {};
    this.className = '';
    this.disabled = false;
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = parseElements(value);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set textContent(value) {
    this._innerHTML = String(value ?? '');
  }

  get textContent() {
    return this._innerHTML;
  }

  addEventListener(event, handler) {
    this.eventHandlers[event] = handler;
  }

  click() {
    return this.eventHandlers.click?.();
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    if (!selector.startsWith('.')) return [];
    const className = selector.slice(1);
    const matches = [];
    for (const child of this.children) {
      if (child.className.split(/\s+/).includes(className)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }
}

function parseElements(html) {
  const elements = [];
  const tagRe = /<(button|div|span|h3|p)\b([^>]*)>/g;
  let match;
  while ((match = tagRe.exec(html))) {
    const [, tag, attrs] = match;
    const element = new FakeElement(tag);
    const classMatch = attrs.match(/class="([^"]+)"/);
    if (classMatch) element.className = classMatch[1];
    const dataIdMatch = attrs.match(/data-id="([^"]+)"/);
    if (dataIdMatch) element.dataset.id = dataIdMatch[1];
    const dataIndexMatch = attrs.match(/data-index="([^"]+)"/);
    if (dataIndexMatch) element.dataset.index = dataIndexMatch[1];
    element.disabled = /\sdisabled\b/.test(attrs);
    elements.push(element);
  }
  return elements;
}

const actionArea = new FakeElement('div');

globalThis.document = {
  createElement: tag => new FakeElement(tag),
  getElementById: id => id === 'action-area' ? actionArea : null,
  querySelector: selector => actionArea.querySelector(selector),
  querySelectorAll: selector => actionArea.querySelectorAll(selector),
};

const campfire = await import('../../../public/js/ui/campfire.js');

function sampleState(overrides = {}) {
  return {
    ingredients: { mizu: 1, miso: 1 },
    ingredientCatalog: [
      { id: 'mizu', word: '水', nameEn: 'Water' },
      { id: 'miso', word: '味噌', nameEn: 'Miso' },
    ],
    discoveredRecipes: [{
      id: 'miso-soup',
      word: '味噌汁',
      rarity: 'common',
      ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
      effectDescription: 'Restores 20% MP.',
    }],
    room: { cookedDish: null },
    ...overrides,
  };
}

describe('campfire UI', () => {
  beforeEach(() => {
    actionArea.innerHTML = '';
  });

  it('renders ingredient and recipe tabs', () => {
    campfire.renderForTest(sampleState());

    assert.ok(actionArea.querySelector('.campfire-tab'));
    assert.equal(actionArea.querySelectorAll('.campfire-tab').length, 2);
    assert.ok(actionArea.querySelector('.campfire-ingredient'));
  });

  it('enables cook only after selecting 1 to 5 ingredients', () => {
    campfire.renderForTest(sampleState());
    assert.equal(actionArea.querySelector('.campfire-cook-btn').disabled, true);

    actionArea.querySelector('.campfire-ingredient').click();

    assert.equal(actionArea.querySelector('.campfire-cook-btn').disabled, false);
  });

  it('shows cooked dish effects before target selection', () => {
    campfire.renderForTest(sampleState({
      room: {
        cookedDish: {
          id: 'miso-soup',
          word: '味噌汁',
          nameEn: 'Miso soup',
          effectDescription: 'Restores 20% MP.',
        }
      }
    }), {
      getGameState: () => ({
        run: {
          creatureParty: {
            active: [{ id: 'hi', name: '火', hp: 10, maxHp: 20, mp: 3, maxMp: 10 }]
          }
        }
      })
    });

    assert.ok(actionArea.querySelector('.campfire-result'));
    assert.ok(actionArea.querySelector('.campfire-target'));
  });

  it('calls feed callback with selected target index', async () => {
    let fedIndex = null;
    campfire.renderForTest(sampleState({
      room: {
        cookedDish: {
          id: 'miso-soup',
          word: '味噌汁',
          effectDescription: 'Restores 20% MP.',
        }
      }
    }), {
      getGameState: () => ({
        run: {
          creatureParty: {
            active: [{ id: 'hi', name: '火', hp: 10, maxHp: 20, mp: 3, maxMp: 10 }]
          }
        }
      }),
      apiFeedCampfireDish: async index => {
        fedIndex = index;
        return { state: { phase: 'room' } };
      },
      updateGameState: () => {},
      updateUI: () => {},
    });

    await actionArea.querySelector('.campfire-target').click();

    assert.equal(fedIndex, 0);
  });
});
