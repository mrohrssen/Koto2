import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

let playWordCalls = [];
let prefetchWordCalls = [];

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

function createSessionRecorder({ accepted = true } = {}) {
  const actions = [];
  return {
    actions,
    getExploreSession: () => ({
      recordRoomAction(kind, payload = {}) {
        const action = { kind, payload };
        actions.push(action);
        return accepted
          ? { accepted: true, entry: { actionId: `run_es_test_${String(actions.length).padStart(8, '0')}` } }
          : { accepted: false, reason: 'testReject' };
      },
    }),
  };
}

function sampleGameState(overrides = {}) {
  const room = {
    id: 'campfire-room',
    type: 'campfire',
    campfire: { cookedDish: null, completed: false },
  };
  return {
    phase: 'campfire',
    room: { ...room, campfire: { ...room.campfire } },
    run: {
      currentRoom: 0,
      revealedRooms: [{ index: 0, room: { ...room, campfire: { ...room.campfire } } }],
      rooms: [{ ...room, campfire: { ...room.campfire } }],
      creatureParty: {
        active: [{ id: 'hi', name: '火', nameEn: 'Hi', hp: 10, maxHp: 20, mp: 3, maxMp: 10, level: 3 }],
      },
      cooking: {
        ingredients: { mizu: 1, miso: 1, toufu: 1 },
      },
    },
    ...overrides,
  };
}

function activeCampfireCapability({ offlineReady = true, paused = false } = {}) {
  const gameState = sampleGameState();
  gameState.run.active = true;
  gameState.run.mode = 'standard';
  const room = gameState.room;
  const base = sampleState();
  const payload = {
    ...base,
    kind: 'campfire',
    roomId: room.id,
    ingredientCount: 3,
    recipes: [...base.discoveredRecipes],
    room,
  };
  const prepared = {
    index: 0,
    roomId: room.id,
    room,
    acceptedActions: ['campfire.cook', 'campfire.feed', 'campfire.skip', 'proceed'],
    offlineReady,
    missingPayloadReasons: offlineReady ? [] : ['campfire.yesTokens'],
    interactionPayload: offlineReady ? payload : { ...payload, yesTokens: null },
  };
  gameState.run.exploreRunway = {
    sessionEpoch: 'ese_4444444444444444',
    currentRoom: 0,
    preparedRooms: [prepared],
  };
  const session = {
    currentPreparedRoom: () => prepared,
    isPaused: () => paused,
    pause: () => { paused = true; },
    adoptRunway: () => {},
  };
  return { gameState, payload, prepared, session };
}

describe('campfire UI', () => {
  beforeEach(() => {
    exposureBuffer.teardown();
    actionArea.innerHTML = '';
    sceneArea.innerHTML = '';
    sceneArea.className = '';
    playWordCalls = [];
    prefetchWordCalls = [];
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

  it('uses safe English labels when frame tokens are unavailable', () => {
    campfire.renderForTest(sampleState({ yesTokens: null, noTokens: null }));

    assert.match(renderedHtml(actionArea), /Yes/);
    assert.match(renderedHtml(actionArea), /No/);
    assert.doesNotMatch(renderedHtml(actionArea), /はい|いいえ/);
  });

  it('shows a valid active standard capability without calling the legacy API', async () => {
    const value = activeCampfireCapability();
    let legacyCalls = 0;
    campfire.init({
      getGameState: () => value.gameState,
      getExploreSession: () => value.session,
      apiGetCampfire: async () => { legacyCalls += 1; return null; },
    });

    await campfire.show();

    assert.equal(legacyCalls, 0);
    assert.equal(value.session.isPaused(), false);
    assert.equal(actionArea.querySelectorAll('.ui-btn').length, 2);
  });

  it('clears and pauses an invalid active standard capability without legacy fallback', async () => {
    const value = activeCampfireCapability({ offlineReady: false });
    let legacyCalls = 0;
    campfire.init({
      getGameState: () => value.gameState,
      getExploreSession: () => value.session,
      apiGetCampfire: async () => { legacyCalls += 1; return sampleState(); },
    });

    await campfire.show();

    assert.equal(legacyCalls, 0);
    assert.equal(value.session.isPaused(), true);
    assert.equal(actionArea.innerHTML, '');
    assert.equal(sceneArea.querySelector('.campfire-scene'), null);
  });

  it('rejects stale nested campfire room state before rendering cooked, feed, or completion UI', async () => {
    for (const staleRoom of [
      {
        id: 'previous-campfire-room',
        type: 'campfire',
        campfire: { cookedDish: { id: 'stale-dish' }, completed: true, fedTargetIndex: 0 },
      },
      {
        id: 'campfire-room',
        type: 'shrine',
        campfire: { cookedDish: { id: 'stale-dish' }, completed: true, fedTargetIndex: 0 },
      },
    ]) {
      const value = activeCampfireCapability();
      value.prepared.interactionPayload.room = staleRoom;
      let legacyCalls = 0;
      campfire.renderForTest(sampleState({
        room: {
          cookedDish: {
            id: 'stale-dish',
            word: '料理',
            reading: 'りょうり',
            nameEn: 'Stale dish',
            effectDescription: 'Should never remain visible.',
          },
          completed: true,
          fedTargetIndex: 0,
        },
      }));
      campfire.init({
        getGameState: () => value.gameState,
        getExploreSession: () => value.session,
        apiGetCampfire: async () => { legacyCalls += 1; return sampleState(); },
      });

      await campfire.show();

      assert.equal(legacyCalls, 0);
      assert.equal(value.session.isPaused(), true);
      assert.equal(actionArea.innerHTML, '');
      assert.equal(sceneArea.querySelector('.campfire-scene'), null);
    }
  });

  it('retains the legacy API for runs without an active standard session', async () => {
    let legacyCalls = 0;
    campfire.init({
      getGameState: () => sampleGameState(),
      getExploreSession: () => null,
      apiGetCampfire: async () => { legacyCalls += 1; return sampleState(); },
    });

    await campfire.show();

    assert.equal(legacyCalls, 1);
    assert.equal(actionArea.querySelectorAll('.ui-btn').length, 2);
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
    assert.match(renderedHtml(), />Add more ingredients</);
    assert.match(renderedHtml(sceneArea), /Cooking slots/);
    assert.match(renderedHtml(sceneArea), /\/assets\/sprites\/objects\/campfire\.webp/);
  });

  it('toggles cooking focus class on the scene area only while cooking', async () => {
    const session = createSessionRecorder();
    campfire.renderForTest(sampleState(), {
      ...session,
      getGameState: () => sampleGameState(),
      updateGameState: () => {},
      updateUI: () => {},
    });

    assert.doesNotMatch(sceneArea.className, /campfire-focus-active/);

    openCooking();
    assert.match(sceneArea.className, /campfire-focus-active/);

    await actionArea.querySelector('.campfire-skip-btn').click();
    assert.doesNotMatch(sceneArea.className, /campfire-focus-active/);
  });

  it('choosing no records a skip action and refreshes the room', async () => {
    const session = createSessionRecorder();
    let gameState = sampleGameState();
    let updateUiCalls = 0;
    campfire.renderForTest(sampleState(), {
      ...session,
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
      updateUI: () => { updateUiCalls += 1; },
    });

    await actionArea.querySelectorAll('.ui-btn')[1].click();

    assert.deepEqual(session.actions, [{ kind: 'campfire.skip', payload: {} }]);
    assert.equal(gameState.phase, 'room');
    assert.equal(gameState.room.campfire.completed, true);
    assert.equal(gameState.room.campfire.skipped, true);
    assert.equal(gameState.room.interacted, true);
    assert.equal(updateUiCalls, 1);
  });

  it('clears the entry prompt immediately when choosing no', async () => {
    const session = createSessionRecorder();
    campfire.renderForTest(sampleState(), {
      ...session,
      getGameState: () => sampleGameState(),
      updateGameState: () => {},
      updateUI: () => {},
    });

    await actionArea.querySelectorAll('.ui-btn')[1].click();

    assert.equal(actionArea.querySelectorAll('.ui-btn').length, 0);
    assert.doesNotMatch(renderedHtml(actionArea), /Would you like to cook\?/);
  });

  it('leaves the entry prompt visible and shows retry copy for rejected skip actions', async () => {
    const session = createSessionRecorder({ accepted: false });
    const gameState = sampleGameState();
    const messages = [];
    campfire.renderForTest(sampleState(), {
      ...session,
      getGameState: () => gameState,
      updateGameState: () => { throw new Error('skip rejection must not update game state'); },
      showCampfireFailure: message => messages.push(message),
    });

    await actionArea.querySelectorAll('.ui-btn')[1].click();

    assert.deepEqual(messages, ['Connection is spotty. Your progress will sync when you reconnect.']);
    assert.deepEqual(session.actions, [{ kind: 'campfire.skip', payload: {} }]);
    assert.match(renderedHtml(actionArea), /Would you like to cook\?/);
  });

  it('keeps cooking UI visible and shows retry copy for rejected cooking skip actions', async () => {
    const session = createSessionRecorder({ accepted: false });
    const gameState = sampleGameState();
    const messages = [];
    let updateUiCalls = 0;
    campfire.renderForTest(sampleState(), {
      ...session,
      getGameState: () => gameState,
      updateGameState: () => { throw new Error('skip rejection must not update game state'); },
      updateUI: () => { updateUiCalls += 1; },
      showCampfireFailure: message => messages.push(message),
    });

    openCooking();
    await actionArea.querySelector('.campfire-skip-btn').click();

    assert.deepEqual(messages, ['Connection is spotty. Your progress will sync when you reconnect.']);
    assert.deepEqual(session.actions, [{ kind: 'campfire.skip', payload: {} }]);
    assert.equal(updateUiCalls, 0);
    assert.ok(actionArea.querySelector('.campfire-panel'));
    assert.ok(sceneArea.querySelector('.campfire-scene'));
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

  it('renders English tabs and asks for more ingredients until a recipe is ready', () => {
    campfire.renderForTest(sampleState());
    openCooking();

    assert.match(renderedHtml(), />Ingredients</);
    assert.match(renderedHtml(), />Recipes</);
    assert.match(renderedHtml(), />Add more ingredients</);
    assert.doesNotMatch(renderedHtml(), />材料</);
    assert.doesNotMatch(renderedHtml(), />料理する</);

    let cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[0].click();
    assert.match(renderedHtml(), />Add more ingredients</);

    cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[1].click();
    assert.match(renderedHtml(), />Cook</);
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

  it('prefetches ingredient words and speaks only when an ingredient is added to the cooking slots', () => {
    campfire.renderForTest(sampleState(), {
      playTTS: word => { playWordCalls.push(word); },
      prefetchTTS: word => { prefetchWordCalls.push(word); },
    });

    openCooking();

    assert.deepEqual(prefetchWordCalls, ['水', '味噌', '豆腐']);

    actionArea.querySelector('.campfire-ingredient-card').click();
    assert.deepEqual(playWordCalls, ['水']);

    actionArea.querySelector('.campfire-ingredient-card').click();
    assert.deepEqual(playWordCalls, ['水']);
  });

  it('renders selected ingredients in the scene slot preview', () => {
    campfire.renderForTest(sampleState());
    openCooking();

    actionArea.querySelector('.campfire-ingredient-card').click();

    assert.ok(sceneArea.querySelector('.campfire-slot-preview'));
    assert.match(renderedHtml(), /Cooking slots/);
    assert.match(renderedHtml(), /1 \/ 5/);
  });

  it('shakes and does not cook when the selected ingredients do not complete a recipe', async () => {
    let cookCalls = 0;
    campfire.renderForTest(sampleState(), {
      apiCookAtCampfire: async () => {
        cookCalls += 1;
        return sampleState();
      },
    });
    openCooking();

    await actionArea.querySelector('.campfire-cook-btn').click();

    assert.equal(cookCalls, 0);
    assert.match(actionArea.querySelector('.campfire-cook-btn').className, /campfire-cook-btn--shake/);
    assert.equal(actionArea.querySelector('.campfire-skip-btn').disabled, false);

    actionArea.querySelector('.campfire-ingredient-card').click();
    await actionArea.querySelector('.campfire-cook-btn').click();

    assert.equal(cookCalls, 0);
    assert.match(actionArea.querySelector('.campfire-cook-btn').className, /campfire-cook-btn--shake/);
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
    assert.equal(actionArea.querySelector('.campfire-cook-btn').disabled, false);
    assert.match(renderedHtml(), />Add more ingredients</);
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
    const session = createSessionRecorder();
    let gameState = sampleGameState();
    let updateUiCalls = 0;
    sceneArea.innerHTML = '<canvas class="pixi-canvas"></canvas>';
    campfire.renderForTest(sampleState(), {
      ...session,
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
      updateUI: () => { updateUiCalls += 1; },
    });

    openCooking();
    await actionArea.querySelector('.campfire-skip-btn').click();

    assert.deepEqual(session.actions, [{ kind: 'campfire.skip', payload: {} }]);
    assert.equal(gameState.phase, 'room');
    assert.equal(gameState.room.campfire.skipped, true);
    assert.equal(gameState.room.interacted, true);
    assert.equal(updateUiCalls, 1);
    assert.equal(sceneArea.querySelector('.campfire-scene'), null);
    assert.ok(sceneArea.querySelector('.pixi-canvas'));
  });

  it('manual multi-ingredient selection records every selected ingredient to cook', async () => {
    const session = createSessionRecorder();
    campfire.renderForTest(sampleState(), {
      ...session,
      getGameState: () => sampleGameState(),
      updateGameState: () => {},
    });
    openCooking();

    const cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[0].click();
    cards[1].click();
    await actionArea.querySelector('.campfire-cook-btn').click();

    assert.deepEqual(session.actions, [{
      kind: 'campfire.cook',
      payload: {
        ingredients: [
          { id: 'mizu', quantity: 1 },
          { id: 'miso', quantity: 1 },
        ],
      },
    }]);
  });

  it('records cooking on the explore session and mutates the local campfire state', async () => {
    const session = createSessionRecorder();
    let gameState = sampleGameState();
    campfire.renderForTest(sampleState(), {
      ...session,
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
    });
    openCooking();

    const cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[0].click();
    cards[1].click();
    await actionArea.querySelector('.campfire-cook-btn').click();

    assert.deepEqual(session.actions[0], {
      kind: 'campfire.cook',
      payload: {
        ingredients: [
          { id: 'mizu', quantity: 1 },
          { id: 'miso', quantity: 1 },
        ],
      },
    });
    assert.equal(gameState.phase, 'campfire');
    assert.equal(gameState.room.campfire.cookedDish.word, '味噌汁');
    assert.deepEqual(gameState.run.cooking.ingredients, { toufu: 1 });
  });

  it('chooses the same best matching recipe as the server resolver', async () => {
    const session = createSessionRecorder();
    let gameState = sampleGameState();
    const rareMisoSoup = {
      id: 'rare-miso-soup',
      word: '特別味噌汁',
      reading: 'とくべつみそしる',
      nameEn: 'Special miso soup',
      meaning: 'special miso soup',
      rarity: 'rare',
      ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
      effectDescription: 'Restores more MP.',
    };
    campfire.renderForTest(sampleState({
      discoveredRecipes: [
        sampleState().discoveredRecipes[0],
        rareMisoSoup,
      ],
      recipes: [
        sampleState().discoveredRecipes[0],
        rareMisoSoup,
      ],
      cookableRecipeHints: [
        {
          id: 'miso-soup',
          rarity: 'common',
          totalQuantity: 2,
          ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
        },
        {
          id: 'rare-miso-soup',
          rarity: 'rare',
          totalQuantity: 2,
          ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
        },
      ],
    }), {
      ...session,
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
    });
    openCooking();

    const cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[0].click();
    cards[1].click();
    await actionArea.querySelector('.campfire-cook-btn').click();

    assert.equal(gameState.room.campfire.cookedDish.id, 'rare-miso-soup');
    assert.equal(gameState.room.campfire.cookedDish.word, '特別味噌汁');
  });

  it('updates the prepared runway campfire payload after local cooking', async () => {
    const session = createSessionRecorder();
    let gameState = sampleGameState();
    gameState.run.exploreRunway = {
      sessionEpoch: 'ese_campfire_test',
      currentRoom: 0,
      preparedRooms: [{
        index: 0,
        roomId: 'campfire-room',
        room: gameState.room,
        interactionPayload: sampleState({ kind: 'campfire', room: gameState.room }),
      }],
    };
    campfire.renderForTest(sampleState(), {
      ...session,
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
    });
    openCooking();

    const cards = actionArea.querySelectorAll('.campfire-ingredient-card');
    cards[0].click();
    cards[1].click();
    await actionArea.querySelector('.campfire-cook-btn').click();

    const payload = gameState.run.exploreRunway.preparedRooms[0].interactionPayload;
    assert.deepEqual(payload.ingredients, { toufu: 1 });
    assert.equal(payload.room.campfire.cookedDish.word, '味噌汁');
  });

  it('records one exposure for the cooked dish returned by cooking', async () => {
    const posted = [];
    const session = createSessionRecorder();
    campfire.renderForTest(sampleState(), {
      ...session,
      getGameState: () => sampleGameState(),
      updateGameState: () => {},
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

  it('hydrates prepared runway recipe ids before rendering recipe cards', () => {
    const recipe = sampleState().discoveredRecipes[0];
    campfire.renderForTest(sampleState({
      discoveredRecipes: ['miso-soup'],
      recipes: [recipe],
    }));
    openCooking();

    actionArea.querySelectorAll('.campfire-tab')[1].click();

    assert.ok(actionArea.querySelector('.campfire-recipe-card'));
    assert.match(renderedHtml(), /Miso soup|miso soup/);
    assert.doesNotMatch(renderedHtml(), />miso-soup</);
  });

  it('clicking a recipe selects all recipe ingredients before cooking', async () => {
    const session = createSessionRecorder();
    campfire.renderForTest(sampleState(), {
      ...session,
      getGameState: () => sampleGameState(),
      updateGameState: () => {},
    });
    openCooking();

    actionArea.querySelectorAll('.campfire-tab')[1].click();
    actionArea.querySelector('.campfire-recipe-card').click();
    await actionArea.querySelector('.campfire-cook-btn').click();

    assert.deepEqual(session.actions[0], {
      kind: 'campfire.cook',
      payload: {
        ingredients: [
          { id: 'mizu', quantity: 1 },
          { id: 'miso', quantity: 1 },
        ],
      },
    });
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

  it('records feed target index and clears the campfire scene', async () => {
    const session = createSessionRecorder();
    sceneArea.innerHTML = '<canvas class="pixi-canvas"></canvas>';
    let gameState = sampleGameState({
      room: {
        id: 'campfire-room',
        type: 'campfire',
        campfire: {
          cookedDish: {
            id: 'miso-soup',
            word: '味噌汁',
            reading: 'みそしる',
            nameEn: 'Miso soup',
            meaning: 'miso soup',
            effectDescription: 'Restores 20% MP.',
          },
        },
      },
    });
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
      ...session,
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
      updateUI: () => {},
    });

    await actionArea.querySelector('.ui-choice').click();

    assert.deepEqual(session.actions, [{ kind: 'campfire.feed', payload: { targetCreatureIndex: 0 } }]);
    assert.equal(gameState.phase, 'room');
    assert.equal(gameState.room.campfire.fed, true);
    assert.equal(gameState.room.campfire.completed, true);
    assert.equal(gameState.room.campfire.targetCreatureIndex, 0);
    assert.equal(sceneArea.querySelector('.campfire-scene'), null);
    assert.ok(sceneArea.querySelector('.pixi-canvas'));
  });
});
