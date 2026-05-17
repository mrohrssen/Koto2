import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.style = {};
    this.textContent = '';
    this.innerHTML = '';
    this.classList = new FakeClassList();
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  contains(target) {
    return target === this || this.children.includes(target);
  }

  getBoundingClientRect() {
    return { left: 20, top: 40, right: 80, bottom: 60, width: 60, height: 20 };
  }
}

const elements = new Map();
let playedWords = [];

function element(id) {
  if (!elements.has(id)) elements.set(id, new FakeElement());
  return elements.get(id);
}

globalThis.window = { innerWidth: 400, innerHeight: 800 };
globalThis.document = {
  getElementById: id => element(id),
  createElement: () => new FakeElement(),
  createTextNode: text => ({ textContent: text }),
  addEventListener: () => {},
};

await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    getKnownWords: () => new Set(),
    addKnownWord: () => {}
  }
});

await mock.module('../../../public/js/api.js', {
  namedExports: {
    reviewVocabWord: async () => ({ ok: true })
  }
});

await mock.module('../../../public/js/ui/word-level-up.js', {
  namedExports: {
    showWordLevelUp: () => {}
  }
});

await mock.module('../../../public/js/tts.js', {
  namedExports: {
    playDialogueWordAudio: options => { playedWords.push(options); }
  }
});

const { attachWordClickHandlers, init } = await import('../../../public/js/ui/dialogue-word-lookup.js');

describe('dialogue word lookup audio', () => {
  beforeEach(() => {
    elements.clear();
    playedWords = [];
    init({
      showToast: () => {},
      pauseAutoDismiss: () => {},
      getKanaMode: () => false
    });
  });

  it('plays clicked word audio with the dialogue speaker id', () => {
    const span = new FakeElement();
    span.dataset = {
      base: '見る',
      audioText: '見た',
      reading: 'みた',
      meaning: 'see',
      pos: 'verb'
    };
    const container = {
      querySelectorAll: () => [span]
    };

    attachWordClickHandlers(container, {
      wordAudio: { userId: 'u1', speakerId: 46 }
    });
    span.listeners.click({ currentTarget: span, stopPropagation: () => {} });

    assert.deepEqual(playedWords, [{ userId: 'u1', word: '見た', speakerId: 46 }]);
  });
});
