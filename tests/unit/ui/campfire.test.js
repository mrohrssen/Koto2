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
      },
      remove: (...classes) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.forEach(className => current.delete(className));
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

const exposureBuffer = await import('../../../public/js/ui/exposure-buffer.js');
const campfire = await import('../../../public/js/ui/campfire.js');

function sampleState(overrides = {}) {
  return {
    ingredients: { mizu: 1, miso: 1, toufu: 1 },
    ingredientCatalog: [
      { id: 'mizu', word: '水', reading: 'みず', nameEn: 'Water', meaning: 'water' },
      { id: 'miso', word: '味噌', reading: 'みそ', nameEn: 'Miso', meaning: 'miso' },
      { id: 'toufu', word: '豆腐', reading: 'とうふ', nameEn: 'Tofu', meaning: 'tofu' },
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
    cookableRecipeHints: [
      {
        id: 'miso-soup',
        rarity: 'common',
        totalQuantity: 2,
        ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
      },
      {
        id: 'tofu-miso-soup',
        rarity: 'uncommon',
        totalQuantity: 3,
        ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }, { id: 'toufu', quantity: 1 }],
      },
    ],
    yesTokens: {
      tokens: [{ surface: 'はい', base: 'はい', reading: 'はい', pos: 'Interjection' }],
      overrides: {},
    },
    noTokens: {
      tokens: [{ surface: 'いいえ', base: 'いいえ', reading: 'いいえ', pos: 'Interjection' }],
      overrides: {},
    },
    room: { cookedDish: null },
    ...overrides,
  };
}

function openCooking() {
  actionArea.querySelector('.ui-btn')?.click();
}

describe('campfire UI', () => {
  beforeEach(() => {
    exposureBuffer.teardown();
    actionArea.innerHTML = '';
    sceneArea.innerHTML = '';
    sceneArea.className = '';
  });

  it('starts with an English cooking prompt and rendered Japanese yes/no buttons', () => {
    campfire.renderForTest(sampleState());

    assert.match(renderedHtml(actionArea), /Would you like to cook\?/);
    assert.match(renderedHtml(actionArea), /はい/);
    assert.match(renderedHtml(actionArea), /いいえ/);
    assert.match(renderedHtml(actionArea), /<ruby>/);
    assert.equal(actionArea.querySelectorAll('.ui-btn').length, 2);
    assert.equal(actionArea.querySelector('.campfire-panel'), null);
    assert.equal(actionArea.querySelector('.ui-choice'), null);
  });

  it('shows a persistent campfire scene during the entry prompt without cooking focus', () => {
    campfire.renderForTest(sampleState());

    assert.ok(sceneArea.querySelector('.campfire-scene--entry'));
    assert.match(renderedHtml(sceneArea), /\/assets\/sprites\/objects\/campfire\.webp/);
    assert.doesNotMatch(sceneArea.className, /campfire-focus-active/);
  });

  it('uses existing heading and button UI classes for the entry prompt', () => {
    campfire.renderForTest(sampleState());

    assert.ok(actionArea.querySelector('.ui-choice-heading'));
    assert.equal(actionArea.querySelector('.campfire-entry-heading'), null);
    assert.equal(actionArea.querySelectorAll('.ui-btn').length, 2);
  });

  it('choosing yes opens the existing campfire cooking panel and scene slots', () => {
    campfire.renderForTest(sampleState());

    openCooking();

    assert.ok(actionArea.querySelector('.campfire-panel'));
    assert.ok(sceneArea.querySelector('.campfire-slot-preview'));
    assert.ok(sceneArea.querySelector('.campfire-scene--cooking'));
    assert.match(renderedHtml(), />Ingredients</);
    assert.match(renderedHtml(), />Recipes</);
    assert.match(renderedHtml(), />Cook</);
    assert.match(renderedHtml(sceneArea), /Cooking slots/);
    assert.match(renderedHtml(sceneArea), /\/assets\/sprites\/objects\/campfire\.webp/);
  });

  it('toggles cooking focus class on the scene area only while cooking', async () => {
    campfire.renderForTest(sampleState(), {
      apiSkipCampfire: async () => ({ state: { phase: 'room' } }),
      completeCampfireAndProceed: async () => {},
    });

    assert.doesNotMatch(sceneArea.className, /campfire-focus-active/);

    openCooking();
    assert.match(sceneArea.className, /campfire-focus-active/);

    await actionArea.querySelector('.campfire-skip-btn').click();
    assert.doesNotMatch(sceneArea.className, /campfire-focus-active/);
  });

  it('choosing no skips the campfire and invokes the completion proceed callback', async () => {
    let skipCalled = false;
    let proceeded = false;
    campfire.renderForTest(sampleState(), {
      apiSkipCampfire: async () => {
        skipCalled = true;
        return { state: { phase: 'room' }, skipped: true };
      },
      completeCampfireAndProceed: async state => {
        proceeded = state.phase === 'room';
      },
    });

    await actionArea.querySelectorAll('.ui-btn')[1].click();

    assert.equal(skipCalled, true);
    assert.equal(proceeded, true);
  });

  it('clears the entry prompt immediately when choosing no', async () => {
    let resolveSkip;
    const skipPromise = new Promise(resolve => { resolveSkip = resolve; });
    campfire.renderForTest(sampleState(), {
      apiSkipCampfire: () => skipPromise,
      completeCampfireAndProceed: async () => {},
    });

    actionArea.querySelectorAll('.ui-btn')[1].click();

    assert.equal(actionArea.querySelectorAll('.ui-btn').length, 0);
    assert.doesNotMatch(renderedHtml(actionArea), /Would you like to cook\?/);

    resolveSkip({ state: { phase: 'room' }, skipped: true });
    await skipPromise;
  });

  it('renders ingredient and recipe tabs', () => {
    campfire.renderForTest(sampleState());
    openCooking();

    assert.ok(actionArea.querySelector('.campfire-tab'));
    assert.equal(actionArea.querySelectorAll('.campfire-tab').length, 2);
    assert.match(renderedHtml(), />Ingredients</);
    assert.match(renderedHtml(), />Recipes</);
    assert.ok(actionArea.querySelector('.campfire-ingredient-card'));
  });

  it('renders English tabs and Cook button label', () => {
    campfire.renderForTest(sampleState());
    openCooking();

    assert.match(renderedHtml(), />Ingredients</);
    assert.match(renderedHtml(), />Recipes</);
    assert.match(renderedHtml(), />Cook</);
    assert.doesNotMatch(renderedHtml(), />材料</);
    assert.doesNotMatch(renderedHtml(), />料理する</);
  });

  it('renders ingredient cards with icon fallback and Japanese renderer output', () => {
    campfire.renderForTest(sampleState());
    openCooking();

    assert.ok(actionArea.querySelector('.campfire-ingredient-card'));
    assert.ok(actionArea.querySelector('.campfire-ingredient-icon'));
    assert.match(renderedHtml(), /<ruby>/);
    assert.match(renderedHtml(), /<rt>/);
    assert.match(renderedHtml(), /water|Water/);
  });

  it('records ingredient exposure only when an ingredient is added to the cooking slots', async () => {
    const posted = [];
    campfire.renderForTest(sampleState());
    exposureBuffer.init({
      postFn: async words => posted.push(...words),
      debounceMs: 100000,
      document: null,
      window: null,
      onlineTarget: null,
    });

    openCooking();
    await exposureBuffer.flushNow();

    assert.deepEqual(posted, []);

    actionArea.querySelector('.campfire-ingredient-card').click();
    await exposureBuffer.flushNow();

    assert.deepEqual(posted, [
      { word: '水', meaning: 'Water' },
    ]);
  });

  it('renders selected ingredients in the scene slot preview', () => {
    campfire.renderForTest(sampleState());
    openCooking();

    actionArea.querySelector('.campfire-ingredient-card').click();

    assert.ok(sceneArea.querySelector('.campfire-slot-preview'));
    assert.match(renderedHtml(), /Cooking slots/);
    assert.match(renderedHtml(), /1 \/ 5/);
  });

  it('enables cook only after selecting 1 to 5 ingredients', () => {
    campfire.renderForTest(sampleState());
    openCooking();
    assert.equal(actionArea.querySelector('.campfire-cook-btn').disabled, true);
    assert.equal(actionArea.querySelector('.campfire-skip-btn').disabled, false);

    actionArea.querySelector('.campfire-ingredient-card').click();

    assert.equal(actionArea.querySelector('.campfire-cook-btn').disabled, false);
  });

  it('glows ingredients that belong to a cookable real recipe path', () => {
    campfire.renderForTest(sampleState());
    openCooking();

    const cards = actionArea.querySelectorAll('.campfire-ingredient-card');

    assert.match(cards[0].className, /recipe-valid/);
    assert.match(cards[1].className, /recipe-valid/);
    assert.match(cards[2].className, /recipe-valid/);
  });

  it('disables ingredients that cannot be used in any cookable recipe path', () => {
    campfire.renderForTest(sampleState({
      ingredients: { mizu: 1, miso: 1, sakana: 1 },
      ingredientCatalog: [
        { id: 'mizu', word: '水', reading: 'みず', nameEn: 'Water', meaning: 'water' },
        { id: 'miso', word: '味噌', reading: 'みそ', nameEn: 'Miso', meaning: 'miso' },
        { id: 'sakana', word: '魚', reading: 'さかな', nameEn: 'Fish', meaning: 'fish' },
      ],
      cookableRecipeHints: [
        {
          id: 'miso-soup',
          rarity: 'common',
          totalQuantity: 2,
          ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
        },
      ],
    }));
    openCooking();

    const cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    assert.equal(cards[2].disabled, true);
    assert.match(cards[2].className, /disabled/);

    cards[2].click();

    assert.match(renderedHtml(), /0\/1/);
    assert.equal(actionArea.querySelector('.campfire-cook-btn').disabled, true);
  });

  it('prunes unrelated ingredient glow after selecting an ingredient', () => {
    campfire.renderForTest(sampleState({
      ingredients: { mizu: 1, miso: 1, sakana: 1, yasai: 1 },
      ingredientCatalog: [
        { id: 'mizu', word: '水', reading: 'みず', nameEn: 'Water', meaning: 'water' },
        { id: 'miso', word: '味噌', reading: 'みそ', nameEn: 'Miso', meaning: 'miso' },
        { id: 'sakana', word: '魚', reading: 'さかな', nameEn: 'Fish', meaning: 'fish' },
        { id: 'yasai', word: '野菜', reading: 'やさい', nameEn: 'Vegetable', meaning: 'vegetable' },
      ],
      cookableRecipeHints: [
        {
          id: 'miso-soup',
          rarity: 'common',
          totalQuantity: 2,
          ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
        },
        {
          id: 'fish-greens',
          rarity: 'common',
          totalQuantity: 2,
          ingredients: [{ id: 'sakana', quantity: 1 }, { id: 'yasai', quantity: 1 }],
        },
      ],
    }));
    openCooking();

    actionArea.querySelectorAll('.campfire-ingredient-card')[0].click();
    const cards = actionArea.querySelectorAll('.campfire-ingredient-card');

    assert.match(cards[0].className, /recipe-valid/);
    assert.match(cards[1].className, /recipe-valid/);
    assert.doesNotMatch(cards[2].className, /recipe-valid/);
    assert.doesNotMatch(cards[3].className, /recipe-valid/);
  });

  it('pulses the fireplace only when a real recipe is complete', () => {
    campfire.renderForTest(sampleState());
    openCooking();

    let cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[0].click();
    assert.equal(sceneArea.querySelector('.campfire-focus-wrap--recipe-ready'), null);

    cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[1].click();
    assert.ok(sceneArea.querySelector('.campfire-focus-wrap--recipe-ready'));
  });

  it('keeps stronger recipe extensions glowing after a smaller recipe is complete', () => {
    campfire.renderForTest(sampleState());
    openCooking();

    let cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[0].click();
    cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[1].click();
    cards = actionArea.querySelectorAll('.campfire-ingredient-card');

    assert.ok(sceneArea.querySelector('.campfire-focus-wrap--recipe-ready'));
    assert.match(cards[2].className, /recipe-valid/);
  });

  it('does not pulse the fireplace for fallback-only selections', () => {
    campfire.renderForTest(sampleState({
      ingredients: { niku: 1 },
      ingredientCatalog: [
        { id: 'niku', word: '肉', reading: 'にく', nameEn: 'Meat', meaning: 'meat' },
      ],
      cookableRecipeHints: [],
    }));
    openCooking();

    actionArea.querySelector('.campfire-ingredient-card').click();

    assert.equal(sceneArea.querySelector('.campfire-focus-wrap--recipe-ready'), null);
    assert.doesNotMatch(actionArea.querySelector('.campfire-ingredient-card').className, /recipe-valid/);
  });

  it('keeps duplicate-quantity recipe paths glowing before completion', () => {
    campfire.renderForTest(sampleState({
      ingredients: { tamago: 2 },
      ingredientCatalog: [
        { id: 'tamago', word: '卵', reading: 'たまご', nameEn: 'Egg', meaning: 'egg' },
      ],
      cookableRecipeHints: [{
        id: 'double-egg',
        rarity: 'common',
        totalQuantity: 2,
        ingredients: [{ id: 'tamago', quantity: 2 }],
      }],
    }));
    openCooking();

    actionArea.querySelector('.campfire-ingredient-card').click();

    assert.match(actionArea.querySelector('.campfire-ingredient-card').className, /recipe-valid/);
    assert.equal(sceneArea.querySelector('.campfire-focus-wrap--recipe-ready'), null);
  });

  it('skip completes the campfire without cooking and clears the campfire scene', async () => {
    let skipCalled = false;
    let proceeded = false;
    sceneArea.innerHTML = '<canvas class="pixi-canvas"></canvas>';
    campfire.renderForTest(sampleState(), {
      apiSkipCampfire: async () => {
        skipCalled = true;
        return { state: { phase: 'room' } };
      },
      completeCampfireAndProceed: async state => { proceeded = state.phase === 'room'; },
    });

    openCooking();
    await actionArea.querySelector('.campfire-skip-btn').click();

    assert.equal(skipCalled, true);
    assert.equal(proceeded, true);
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
    openCooking();

    const cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[0].click();
    cards[1].click();
    await actionArea.querySelector('.campfire-cook-btn').click();

    assert.deepEqual(cookedIngredients, [
      { id: 'mizu', quantity: 1 },
      { id: 'miso', quantity: 1 },
    ]);
  });

  it('records one exposure for the cooked dish returned by cooking', async () => {
    const posted = [];
    campfire.renderForTest(sampleState(), {
      apiCookAtCampfire: async () => sampleState({
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
      })
    });
    exposureBuffer.init({
      postFn: async words => posted.push(...words),
      debounceMs: 100000,
      document: null,
      window: null,
      onlineTarget: null,
    });
    openCooking();

    const cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[0].click();
    cards[1].click();
    await exposureBuffer.flushNow();
    posted.length = 0;

    await actionArea.querySelector('.campfire-cook-btn').click();
    await exposureBuffer.flushNow();

    assert.deepEqual(posted, [
      { word: '味噌汁', meaning: 'Miso soup' },
    ]);
  });

  it('renders recipe cards with English status and rendered recipe names', () => {
    campfire.renderForTest(sampleState());
    openCooking();

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
    openCooking();

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
