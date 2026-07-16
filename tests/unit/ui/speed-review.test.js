import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

function createClassList() {
  const classes = new Set();
  return {
    add: className => classes.add(className),
    remove: className => classes.delete(className),
    contains: className => classes.has(className),
    toggle: (className, force) => {
      if (force === true) {
        classes.add(className);
        return true;
      }
      if (force === false) {
        classes.delete(className);
        return false;
      }
      if (classes.has(className)) {
        classes.delete(className);
        return false;
      }
      classes.add(className);
      return true;
    },
  };
}

function createElement(id) {
  const listeners = new Map();
  const attributes = new Map();
  let innerHTML = '';
  const flashCard = {
    style: {
      setProperty(name, value) {
        this[name] = value;
      },
    },
    classList: createClassList(),
    addEventListener: (type, listener) => {
      if (!listeners.has(`card:${type}`)) listeners.set(`card:${type}`, []);
      listeners.get(`card:${type}`).push(listener);
    },
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 200, height: 120 }),
    dispatchCardEvent(type, event = {}) {
      for (const listener of listeners.get(`card:${type}`) || []) {
        listener(event);
      }
    },
  };
  return {
    id,
    get innerHTML() { return innerHTML; },
    set innerHTML(value) {
      innerHTML = value;
      if (id.startsWith('speed-review-slot-')) {
        for (const key of [...listeners.keys()]) {
          if (key.startsWith('card:')) listeners.delete(key);
        }
      }
    },
    textContent: '',
    style: {},
    disabled: false,
    classList: createClassList(),
    addEventListener: (type, listener) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: name => attributes.get(name),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }),
    querySelector: selector => {
      if (selector === '.flash-card' && id.startsWith('speed-review-slot-')) {
        return flashCard;
      }
      return null;
    },
    dispatchEvent(type, event = {}) {
      for (const listener of listeners.get(type) || []) {
        listener(event);
      }
    },
    flashCard,
    remove: () => {},
  };
}

let elements;
let levelUpCalls;

await mock.module('animejs', {
  namedExports: { animate: () => {} },
});
await mock.module('../../../public/js/audio.js', {
  namedExports: {
    playSFX: () => {},
    playBGMRandomStart: () => {},
    playBGM: () => {},
  },
});
await mock.module('../../../public/js/ui/takeover.js', {
  namedExports: {
    open: () => {},
    close: () => {},
  },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: { setKnownWords: () => {} },
});
await mock.module('../../../public/js/ui/word-level-up.js', {
  namedExports: {
    showWordLevelUp: (...args) => {
      levelUpCalls.push(args);
    },
  },
});

const { init, start } = await import('../../../public/js/ui/speed-review.js');

describe('speed review word display', () => {
  beforeEach(() => {
    if (!elements) elements = new Map();
    levelUpCalls = [];
    globalThis.setTimeout = () => 1;
    globalThis.clearTimeout = () => {};
    globalThis.document = {
      body: { appendChild: () => {} },
      createElement: () => {
        let html = '';
        return {
          className: '',
          style: {
            setProperty(name, value) {
              this[name] = value;
            },
          },
          set textContent(value) {
            html = String(value || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          },
          get innerHTML() {
            return html;
          },
          addEventListener: () => {},
          remove: () => {},
        };
      },
      getElementById: id => {
        if (!elements.has(id)) elements.set(id, createElement(id));
        return elements.get(id);
      },
    };
  });

  afterEach(() => {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  });

  it('shows romaji above hiragana on both sides when romaji annotations are enabled', () => {
    const started = start([
      { word: '食べる', reading: 'たべる', meanings: ['eat'] },
    ], { showRomaji: true });

    assert.equal(started, true);
    const slotHtml = elements.get('speed-review-slot-0').innerHTML;
    assert.match(
      slotHtml,
      /<div class="flash-card-front"><ruby>たべる<rt>taberu<\/rt><\/ruby><\/div>/
    );
    assert.match(
      slotHtml,
      /<div class="flash-card-word"><ruby>たべる<rt>taberu<\/rt><\/ruby><\/div>/
    );
  });

  it('keeps the forced close button clickable and shows Not yet when clicked early', () => {
    init({ sendReview: () => Promise.resolve(), playTTS: () => {} });
    const started = start([
      { word: '食べる', reading: 'たべる', meanings: ['eat'] },
    ], { canCloseEarly: false });

    assert.equal(started, true);
    const closeButton = elements.get('speed-review-close');
    assert.equal(closeButton.disabled, false);
    assert.equal(closeButton.getAttribute('aria-disabled'), 'true');
    assert.equal(closeButton.classList.contains('speed-review-close-ready'), false);

    let prevented = false;
    let stopped = false;
    closeButton.dispatchEvent('click', {
      preventDefault: () => { prevented = true; },
      stopImmediatePropagation: () => { stopped = true; },
    });

    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.equal(levelUpCalls.length, 1);
    assert.equal(levelUpCalls[0][0], elements.get('speed-review-view'));
    assert.deepEqual(levelUpCalls[0][2], { message: 'Not yet!' });
  });

  it('glows the forced close button after the last card is reviewed', async () => {
    globalThis.setTimeout = (callback, delay) => {
      if (delay === 100) callback();
      return 1;
    };
    init({ sendReview: () => Promise.resolve(), playTTS: () => {} });
    start([
      { word: '食べる', reading: 'たべる', meanings: ['eat'] },
    ], { canCloseEarly: false });

    const card = elements.get('speed-review-slot-0').flashCard;
    card.dispatchCardEvent('click', {});
    card.dispatchCardEvent('click', {
      clientX: 260,
    });
    await new Promise(resolve => realSetTimeout(resolve, 0));
    await Promise.resolve();

    const closeButton = elements.get('speed-review-close');
    assert.equal(closeButton.getAttribute('aria-disabled'), 'false');
    assert.equal(closeButton.classList.contains('speed-review-close-ready'), true);
  });

  it('gives room reviews one canonical delivery owner and waits for its commit before completion', async () => {
    globalThis.setTimeout = (callback, delay) => {
      if (delay === 100) callback();
      return 1;
    };

    let sendReviewCalls = 0;
    let releaseCommit;
    const commitGate = new Promise(resolve => { releaseCommit = resolve; });
    const committedReviews = [];
    let markComplete;
    const completed = new Promise(resolve => { markComplete = resolve; });
    let completionCalls = 0;

    init({
      sendReview: async () => { sendReviewCalls += 1; },
      playTTS: () => {},
    });
    start([
      { word: '食べる', reading: 'たべる', meanings: ['eat'] },
    ], {
      mode: 'room',
      canonicalReviewDelivery: true,
      canCloseEarly: false,
      onCommittedReview: async review => {
        committedReviews.push(review);
        await commitGate;
        return { accepted: true };
      },
      onComplete: async () => {
        completionCalls += 1;
        markComplete();
      },
    });

    const card = elements.get('speed-review-slot-0').flashCard;
    card.dispatchCardEvent('click', {});
    card.dispatchCardEvent('click', { clientX: 260 });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(sendReviewCalls, 0,
      'room mode must not POST the global review endpoint beside its canonical commit');
    assert.deepEqual(committedReviews, [{
      word: { word: '食べる', reading: 'たべる', meanings: ['eat'] },
      grade: 4,
      direction: 'right',
      commitIndex: 0,
    }]);
    assert.equal(completionCalls, 0, 'completion must wait for the ordered commit chain');

    releaseCommit();
    await completed;
    assert.equal(completionCalls, 1);
  });

  it('keeps the global review delivery for legacy room commits', async () => {
    globalThis.setTimeout = (callback, delay) => {
      if (delay === 100) callback();
      return 1;
    };

    const delivered = [];
    const legacyCommits = [];
    let markComplete;
    const completed = new Promise(resolve => { markComplete = resolve; });

    init({
      sendReview: async (...args) => { delivered.push(args); },
      playTTS: () => {},
    });
    start([
      { word: '食べる', reading: 'たべる', meanings: ['eat'] },
    ], {
      mode: 'room',
      canCloseEarly: false,
      onCommittedReview: async review => {
        legacyCommits.push(review);
        return { ok: true };
      },
      onComplete: async () => { markComplete(); },
    });

    const card = elements.get('speed-review-slot-0').flashCard;
    card.dispatchCardEvent('click', {});
    card.dispatchCardEvent('click', { clientX: 260 });
    await completed;

    assert.deepEqual(delivered, [[undefined, undefined, 4, '食べる']]);
    assert.equal(legacyCommits.length, 1);
  });
});
