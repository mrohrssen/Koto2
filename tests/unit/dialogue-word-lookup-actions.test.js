import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

let reviewResponse = { ok: true, mastered: true };
let levelUpCalls = [];

await mock.module('../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    getKnownWords: () => new Set(),
    addKnownWord: () => {}
  }
});

await mock.module('../../public/js/api.js', {
  namedExports: {
    reviewVocabWord: async () => reviewResponse
  }
});

await mock.module('../../public/js/ui/word-level-up.js', {
  namedExports: {
    showWordLevelUp: (...args) => {
      levelUpCalls.push(args);
    }
  }
});

await mock.module('../../public/js/ui/romaji.js', {
  namedExports: {
    buildHeadwordRuby: word => word
  }
});

function createClassList() {
  const values = new Set();
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    contains: value => values.has(value)
  };
}

function createElement(id = '') {
  return {
    id,
    style: {},
    dataset: {},
    className: '',
    innerHTML: '',
    textContent: '',
    children: [],
    classList: createClassList(),
    listeners: new Map(),
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    contains(target) {
      return target === this;
    },
    getBoundingClientRect() {
      return { left: 20, top: 20, width: 40, height: 20 };
    },
    click() {
      return this.listeners.get('click')?.({
        stopPropagation() {},
        target: this,
        currentTarget: this
      });
    }
  };
}

function setupDom() {
  const elements = new Map();
  for (const id of [
    'lookup-popup',
    'lookup-popup-word',
    'lookup-popup-pos',
    'lookup-popup-meanings',
    'lookup-popup-state',
    'lookup-state-dot',
    'lookup-state-text',
    'lookup-action-forgot',
    'lookup-action-knew',
    'lookup-popup-close'
  ]) {
    elements.set(id, createElement(id));
  }

  const container = createElement('container');
  const wordSpan = createElement('word-span');
  wordSpan.dataset.base = '知る';
  wordSpan.dataset.reading = 'しる';
  wordSpan.dataset.meaning = 'know';
  wordSpan.dataset.meanings = JSON.stringify([{ en: 'know' }]);
  container.querySelectorAll = selector => selector === '.jp-word' ? [wordSpan] : [];

  globalThis.window = {
    innerWidth: 390,
    innerHeight: 844
  };
  globalThis.document = {
    body: createElement('body'),
    getElementById: id => elements.get(id) || null,
    createElement: tag => createElement(tag),
    createTextNode: text => ({ textContent: text }),
    addEventListener() {}
  };

  return {
    elements,
    container,
    wordSpan,
    popup: elements.get('lookup-popup'),
    knewBtn: elements.get('lookup-action-knew'),
    forgotBtn: elements.get('lookup-action-forgot')
  };
}

describe('dialogue-word-lookup review actions', () => {
  let lookup;

  beforeEach(async () => {
    reviewResponse = { ok: true, mastered: true };
    levelUpCalls = [];
    lookup = await import(`../../public/js/ui/dialogue-word-lookup.js?test=${Date.now()}-${Math.random()}`);
  });

  it('closes the popup after a successful I knew it review', async () => {
    const dom = setupDom();
    lookup.init({ showToast: () => {}, pauseAutoDismiss: () => {} });
    lookup.attachWordClickHandlers(dom.container);

    dom.wordSpan.click();
    assert.equal(dom.popup.classList.contains('visible'), true);

    await dom.knewBtn.click();
    assert.equal(dom.popup.classList.contains('visible'), false);
  });

  it('closes the popup after a successful I forgot review', async () => {
    const dom = setupDom();
    lookup.init({ showToast: () => {}, pauseAutoDismiss: () => {} });
    lookup.attachWordClickHandlers(dom.container);

    dom.wordSpan.click();
    await dom.forgotBtn.click();

    assert.equal(dom.popup.classList.contains('visible'), false);
  });

  it('keeps the popup open when review fails', async () => {
    const dom = setupDom();
    reviewResponse = { ok: false };
    lookup.init({ showToast: () => {}, pauseAutoDismiss: () => {} });
    lookup.attachWordClickHandlers(dom.container);

    dom.wordSpan.click();
    await dom.knewBtn.click();

    assert.equal(dom.popup.classList.contains('visible'), true);
  });

  it('shows the Fusion Core popup and applies returned game state', async () => {
    const dom = setupDom();
    let stateUpdate = null;
    reviewResponse = {
      ok: true,
      mastered: true,
      fusionCoreDrop: {
        awarded: true,
        message: 'Obtained 1x Fusion Core!'
      },
      state: { meta: { fusionCores: 1 } }
    };
    lookup.init({
      showToast: () => {},
      pauseAutoDismiss: () => {},
      onStateUpdate: state => {
        stateUpdate = state;
      }
    });
    lookup.attachWordClickHandlers(dom.container);

    dom.wordSpan.click();
    await dom.knewBtn.click();

    assert.equal(levelUpCalls.length, 2);
    assert.deepEqual(levelUpCalls[1][2], { message: 'Obtained 1x Fusion Core!' });
    assert.deepEqual(stateUpdate, { meta: { fusionCores: 1 } });
  });
});
