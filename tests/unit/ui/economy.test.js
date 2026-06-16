import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

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
    this._innerHTML = String(value ?? '');
    this.children = parseElements(this._innerHTML);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  addEventListener(event, handler) {
    this.eventHandlers[event] = handler;
  }

  click() {
    return this.eventHandlers.click?.({ target: this });
  }

  closest() {
    return {
      remove() {},
    };
  }

  remove() {}

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
  const tagRe = /<(button|div|span)\b([^>]*)>/g;
  let match;
  while ((match = tagRe.exec(html))) {
    const [, tag, attrs] = match;
    const element = new FakeElement(tag);
    const classMatch = attrs.match(/class="([^"]+)"/);
    if (classMatch) element.className = classMatch[1];
    const creatureIdMatch = attrs.match(/data-creature-id="([^"]+)"/);
    if (creatureIdMatch) element.dataset.creatureId = creatureIdMatch[1];
    const sellPriceMatch = attrs.match(/data-sell-price="([^"]+)"/);
    if (sellPriceMatch) element.dataset.sellPrice = sellPriceMatch[1];
    element.disabled = /\sdisabled\b/.test(attrs);
    elements.push(element);
  }
  return elements;
}

const actionArea = new FakeElement('div');

globalThis.document = {
  querySelector: selector => actionArea.querySelector(selector),
  querySelectorAll: selector => actionArea.querySelectorAll(selector),
};

const mockSources = new Map(Object.entries({
  './sprite-utils.js': 'export const creatureSpriteHtml = () => "";',
  './narration-box.js': 'export const show = () => {};',
  './i18n.js': 'export const t = (key, ...args) => [key, ...args].join(" ");',
  './event-popup.js': 'export const credits = () => {}; export const animateCounter = () => {};',
  './dom-effects.js': 'export const pop = () => {};',
  '../../../public/js/ui/sprite-utils.js': 'export const creatureSpriteHtml = () => "";',
  '../../../public/js/ui/narration-box.js': 'export const show = () => {};',
  '../../../public/js/ui/i18n.js': 'export const t = (key, ...args) => [key, ...args].join(" ");',
  '../../../public/js/ui/event-popup.js': 'export const credits = () => {}; export const animateCounter = () => {};',
  '../../../public/js/ui/dom-effects.js': 'export const pop = () => {};',
}));

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mockSources.has(specifier)) {
      return { url: `mock:${encodeURIComponent(specifier)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('mock:')) {
      const specifier = decodeURIComponent(url.slice('mock:'.length));
      return { format: 'module', source: mockSources.get(specifier), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const economy = await import('../../../public/js/ui/economy.js');

function makeDealerState() {
  const room = { id: 'dealer-room', type: 'dealer', dealer: { soldCreatures: [] } };
  const payload = {
    kind: 'dealer',
    offeredCreatures: [
      { id: 'kitsune', name: '狐', nameEn: 'Kitsune', element: 'fire', rarity: 'common', level: 2, maxHp: 12, attack: 4, buyPrice: 25 },
    ],
    partyCreatures: [],
    credits: 30,
    canBuy: true,
    sellCount: 0,
    maxSells: 2,
  };
  return {
    phase: 'dealer',
    room,
    run: {
      currentRoom: 0,
      player: { credits: 30 },
      revealedRooms: [{ index: 0, room }],
      rooms: [room],
      exploreRunway: {
        sessionEpoch: 'ese_dealer_test',
        currentRoom: 0,
        preparedRooms: [{
          index: 0,
          roomId: 'dealer-room',
          room,
          interactionPayload: payload,
        }],
      },
    },
  };
}

describe('dealer room session UI', () => {
  beforeEach(() => {
    actionArea.innerHTML = '';
  });

  it('does not resurrect a bought offer when rerendering from the prepared payload', async () => {
    let gameState = makeDealerState();
    const session = {
      currentPreparedRoom: () => gameState.run.exploreRunway.preparedRooms[0],
      adoptRunway: runway => { gameState.run.exploreRunway = runway; },
      recordRoomAction: (kind, payload) => ({ accepted: true, entry: { kind, payload } }),
    };
    economy.init({
      getGameState: () => gameState,
      updateGameState: nextState => { gameState = nextState; },
      updateUI: () => {},
      getExploreSession: () => session,
      apiGetDealerState: async () => { throw new Error('prepared payload expected'); },
    });

    await economy.renderDealerRoom({ setContent: html => { actionArea.innerHTML = html; } });
    assert.match(actionArea.innerHTML, /Kitsune/);

    await actionArea.querySelector('.dealer-buy-btn').click();
    await economy.renderDealerRoom({ setContent: html => { actionArea.innerHTML = html; } });

    assert.doesNotMatch(actionArea.innerHTML, /Kitsune/);
    assert.equal(gameState.run.exploreRunway.preparedRooms[0].interactionPayload.canBuy, false);
    assert.equal(gameState.run.exploreRunway.preparedRooms[0].interactionPayload.credits, 5);
  });
});
