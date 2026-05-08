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
    this.attributes = {};
    this.style = {};
    this.parentNode = null;
    this.classList = {
      add: (...classes) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.forEach(className => current.add(className));
        this.className = [...current].join(' ');
      }
    };
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

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertAdjacentHTML(position, html) {
    if (position !== 'beforeend') throw new Error(`Unsupported insertAdjacentHTML position: ${position}`);
    this._innerHTML += String(html ?? '');
    const nextChildren = parseElements(this._innerHTML, this);
    this.children = nextChildren;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  closest() {
    return null;
  }

  click() {
    return this.eventHandlers.click?.({ target: this });
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

function parseElements(html, parentNode = null) {
  const elements = [];
  const tagRe = /<(button|div|span|h3|p|img|ruby|rt|canvas)\b([^>]*)>/g;
  let match;
  while ((match = tagRe.exec(html))) {
    const [, tag, attrs] = match;
    const element = new FakeElement(tag);
    element.parentNode = parentNode;
    const classMatch = attrs.match(/class="([^"]+)"/);
    if (classMatch) element.className = classMatch[1];
    const dataIdMatch = attrs.match(/data-id="([^"]+)"/);
    if (dataIdMatch) element.dataset.id = dataIdMatch[1];
    const dataIndexMatch = attrs.match(/data-index="([^"]+)"/);
    if (dataIndexMatch) element.dataset.index = dataIndexMatch[1];
    const dataTabMatch = attrs.match(/data-tab="([^"]+)"/);
    if (dataTabMatch) element.dataset.tab = dataTabMatch[1];
    element.disabled = /\sdisabled\b/.test(attrs);
    elements.push(element);
  }
  return elements;
}

const actionArea = new FakeElement('div');
const sceneArea = new FakeElement('div');

function renderedHtml(element = null) {
  if (!element) return `${renderedHtml(actionArea)}\n${renderedHtml(sceneArea)}`;
  return [element.innerHTML, ...element.children.map(child => renderedHtml(child))].join('\n');
}

globalThis.document = {
  createElement: tag => new FakeElement(tag),
  getElementById: id => {
    if (id === 'action-area') return actionArea;
    if (id === 'scene-area') return sceneArea;
    return null;
  },
  querySelector: selector => actionArea.querySelector(selector),
  querySelectorAll: selector => actionArea.querySelectorAll(selector),
};

const campfire = await import('../../../public/js/ui/campfire.js');

function sampleState(overrides = {}) {
  return {
    ingredients: { mizu: 1, miso: 1 },
    ingredientCatalog: [
      { id: 'mizu', word: '水', reading: 'みず', nameEn: 'Water', meaning: 'water' },
      { id: 'miso', word: '味噌', reading: 'みそ', nameEn: 'Miso', meaning: 'miso' },
    ],
    discoveredRecipes: [{
      id: 'miso-soup',
      word: '味噌汁',
      reading: 'みそしる',
      nameEn: 'Miso soup',
      meaning: 'miso soup',
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
    sceneArea.innerHTML = '';
  });

  it('renders ingredient and recipe tabs', () => {
    campfire.renderForTest(sampleState());

    assert.ok(actionArea.querySelector('.campfire-tab'));
    assert.equal(actionArea.querySelectorAll('.campfire-tab').length, 2);
    assert.match(renderedHtml(), />Ingredients</);
    assert.match(renderedHtml(), />Recipes</);
    assert.ok(actionArea.querySelector('.campfire-ingredient-card'));
  });

  it('renders English tabs and Cook button label', () => {
    campfire.renderForTest(sampleState());

    assert.match(renderedHtml(), />Ingredients</);
    assert.match(renderedHtml(), />Recipes</);
    assert.match(renderedHtml(), />Cook</);
    assert.doesNotMatch(renderedHtml(), />材料</);
    assert.doesNotMatch(renderedHtml(), />料理する</);
  });

  it('renders ingredient cards with icon fallback and Japanese renderer output', () => {
    campfire.renderForTest(sampleState());

    assert.ok(actionArea.querySelector('.campfire-ingredient-card'));
    assert.ok(actionArea.querySelector('.campfire-ingredient-icon'));
    assert.match(renderedHtml(), /<ruby>/);
    assert.match(renderedHtml(), /<rt>/);
    assert.match(renderedHtml(), /water|Water/);
  });

  it('renders selected ingredients in the scene slot preview', () => {
    campfire.renderForTest(sampleState());

    actionArea.querySelector('.campfire-ingredient-card').click();

    assert.ok(sceneArea.querySelector('.campfire-slot-preview'));
    assert.match(renderedHtml(), /Cooking slots/);
    assert.match(renderedHtml(), /1 \/ 5/);
  });

  it('enables cook only after selecting 1 to 5 ingredients', () => {
    campfire.renderForTest(sampleState());
    assert.equal(actionArea.querySelector('.campfire-cook-btn').disabled, true);
    assert.equal(actionArea.querySelector('.campfire-skip-btn').disabled, false);

    actionArea.querySelector('.campfire-ingredient-card').click();

    assert.equal(actionArea.querySelector('.campfire-cook-btn').disabled, false);
  });

  it('skip completes the campfire without cooking and clears the campfire scene', async () => {
    let skipCalled = false;
    let updatedState = null;
    sceneArea.innerHTML = '<canvas class="pixi-canvas"></canvas>';
    campfire.renderForTest(sampleState(), {
      apiSkipCampfire: async () => {
        skipCalled = true;
        return { state: { phase: 'room' } };
      },
      updateGameState: state => { updatedState = state; },
      updateUI: () => {},
    });

    await actionArea.querySelector('.campfire-skip-btn').click();

    assert.equal(skipCalled, true);
    assert.deepEqual(updatedState, { phase: 'room' });
    assert.equal(sceneArea.querySelector('.campfire-scene'), null);
    assert.ok(sceneArea.querySelector('.pixi-canvas'));
  });

  it('manual multi-ingredient selection sends every selected ingredient to cook', async () => {
    let cookedIngredients = null;
    campfire.renderForTest(sampleState(), {
      apiCookAtCampfire: async ingredients => {
        cookedIngredients = ingredients;
        return sampleState({ room: { cookedDish: { id: 'miso-soup', word: '味噌汁' } } });
      }
    });

    const cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[0].click();
    cards[1].click();
    await actionArea.querySelector('.campfire-cook-btn').click();

    assert.deepEqual(cookedIngredients, [
      { id: 'mizu', quantity: 1 },
      { id: 'miso', quantity: 1 },
    ]);
  });

  it('renders recipe cards with English status and rendered recipe names', () => {
    campfire.renderForTest(sampleState());

    actionArea.querySelectorAll('.campfire-tab')[1].click();

    assert.ok(actionArea.querySelector('.campfire-recipe-card'));
    assert.ok(actionArea.querySelector('.campfire-ingredient-icon'));
    assert.match(renderedHtml(), /Ready/);
    assert.match(renderedHtml(), /<ruby>/);
    assert.match(renderedHtml(), /miso soup|Miso soup/);
  });

  it('clicking a recipe selects all recipe ingredients before cooking', async () => {
    let cookedIngredients = null;
    campfire.renderForTest(sampleState(), {
      apiCookAtCampfire: async ingredients => {
        cookedIngredients = ingredients;
        return sampleState({ room: { cookedDish: { id: 'miso-soup', word: '味噌汁' } } });
      }
    });

    actionArea.querySelectorAll('.campfire-tab')[1].click();
    actionArea.querySelector('.campfire-recipe-card').click();
    await actionArea.querySelector('.campfire-cook-btn').click();

    assert.deepEqual(cookedIngredients, [
      { id: 'mizu', quantity: 1 },
      { id: 'miso', quantity: 1 },
    ]);
  });

  it('shows cooked dish visually before target selection', () => {
    campfire.renderForTest(sampleState({
      room: {
        cookedDish: {
          id: 'miso-soup',
          word: '味噌汁',
          reading: 'みそしる',
          nameEn: 'Miso soup',
          meaning: 'miso soup',
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

    assert.ok(sceneArea.querySelector('.campfire-cooked-dish-display'));
    assert.match(renderedHtml(), /Miso soup|miso soup/);
    assert.match(renderedHtml(), /Restores 20% MP\./);
    assert.match(renderedHtml(), /Choose target/);
    assert.ok(actionArea.querySelector('.ui-choice'));
  });

  it('does not use raw ingredient images for cooked single-ingredient fallback dishes', () => {
    campfire.renderForTest(sampleState({
      room: {
        cookedDish: {
          id: 'cooked-kudamono',
          word: '果物',
          reading: 'くだもの',
          nameEn: 'Cooked Fruit',
          meaning: 'cooked fruit',
          ingredients: [{ id: 'kudamono', quantity: 1 }],
          effectDescription: 'Restores 12% HP.',
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

    assert.match(renderedHtml(sceneArea), /\/assets\/sprites\/items\/cooked-kudamono\.webp/);
    assert.doesNotMatch(renderedHtml(sceneArea), /\/assets\/sprites\/items\/kudamono\.webp/);
  });

  it('calls feed callback with selected target index and clears the campfire scene', async () => {
    let fedIndex = null;
    sceneArea.innerHTML = '<canvas class="pixi-canvas"></canvas>';
    campfire.renderForTest(sampleState({
      room: {
        cookedDish: {
          id: 'miso-soup',
          word: '味噌汁',
          reading: 'みそしる',
          nameEn: 'Miso soup',
          meaning: 'miso soup',
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

    await actionArea.querySelector('.ui-choice').click();

    assert.equal(fedIndex, 0);
    assert.equal(sceneArea.querySelector('.campfire-scene'), null);
    assert.ok(sceneArea.querySelector('.pixi-canvas'));
  });
});
