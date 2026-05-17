import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

let legacyLookupActive = false;
let dialoguePopupVisible = false;
let documentListeners = new Map();
let elementsById = new Map();
let outsideButtonClickHandler = null;

function createEvent(target) {
  return {
    target,
    defaultPrevented: false,
    immediatePropagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
    },
  };
}

function createElement(id) {
  const classes = new Set();
  const element = {
    id,
    textContent: '',
    innerHTML: '',
    style: {},
    parentElement: null,
    children: [],
    scrollHeight: 0,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !classes.has(name) : !!force;
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
      },
    },
    appendChild(child) {
      child.parentElement = element;
      element.children.push(child);
      return child;
    },
    querySelector(selector) {
      if (selector === '.narration-indicator') return elementsById.get('narration-indicator') || null;
      return null;
    },
    contains(target) {
      if (target === element) return true;
      return element.children.some(child => child.contains?.(target));
    },
  };
  return element;
}

function createClickableElement(id) {
  const element = createElement(id);
  element.click = () => {
    const event = createEvent(element);
    const listeners = documentListeners.get('click') || [];
    for (const listener of listeners) {
      listener(event);
      if (event.immediatePropagationStopped) return event;
    }
    outsideButtonClickHandler?.(event);
    return event;
  };
  return element;
}

function installDom() {
  elementsById = new Map();

  const narrationBox = createElement('narration-box');
  const narrationText = createElement('narration-text');
  const narrationSpeaker = createElement('narration-speaker');
  const narrationIndicator = createElement('narration-indicator');
  const lookupPopup = createElement('lookup-popup');
  const outsideButton = createClickableElement('outside-button');

  narrationBox.appendChild(narrationText);
  narrationBox.appendChild(narrationSpeaker);
  narrationBox.appendChild(narrationIndicator);

  for (const element of [narrationBox, narrationText, narrationSpeaker, narrationIndicator, lookupPopup, outsideButton]) {
    elementsById.set(element.id, element);
  }

  globalThis.document = {
    getElementById: id => elementsById.get(id) || null,
    addEventListener: (type, listener) => {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
    removeEventListener: (type, listener) => {
      const listeners = documentListeners.get(type) || [];
      documentListeners.set(type, listeners.filter(entry => entry !== listener));
    },
  };

  globalThis.window = {
    getComputedStyle: () => ({ lineHeight: '20px', fontSize: '16px' }),
  };

  return { narrationBox, narrationText, lookupPopup, outsideButton };
}

const dom = installDom();

function resetDomState() {
  documentListeners = new Map();
  outsideButtonClickHandler = null;
  legacyLookupActive = false;
  dialoguePopupVisible = false;
  for (const element of elementsById.values()) {
    element.textContent = '';
    element.innerHTML = '';
    element.style = {};
  }
}

function waitForDeferredListener() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

await mock.module('../../../public/js/ui/lookup.js', {
  namedExports: {
    getActive: () => legacyLookupActive,
    refresh: async () => {},
  },
});

await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: () => '',
    getKnownWords: () => new Set(),
    entityToToken: value => value,
  },
});

await mock.module('../../../public/js/ui/dialogue-word-lookup.js', {
  namedExports: {
    hidePopup: () => {
      dialoguePopupVisible = false;
    },
    isPopupVisible: () => dialoguePopupVisible,
    attachWordClickHandlers: () => {},
  },
});

const narrationBox = await import('../../../public/js/ui/narration-box.js');

describe('narration box click gating', () => {
  beforeEach(() => {
    narrationBox.forceHide();
    resetDomState();
  });

  it('uses an outside click to dismiss narration without activating the underlying button', async () => {
    let buttonClicks = 0;
    outsideButtonClickHandler = () => {
      buttonClicks += 1;
    };

    const dismissed = narrationBox.show('Cid line', { speaker: 'Cid' });
    await waitForDeferredListener();

    const event = dom.outsideButton.click();
    await dismissed;

    assert.equal(event.defaultPrevented, true);
    assert.equal(event.immediatePropagationStopped, true);
    assert.equal(buttonClicks, 0);
  });

  it('allows persistent narration choice buttons to remain clickable', async () => {
    let buttonClicks = 0;
    outsideButtonClickHandler = () => {
      buttonClicks += 1;
    };

    await narrationBox.show('Do you understand me NOW?', {
      speaker: 'Cid',
      persistent: true,
    });

    const event = dom.outsideButton.click();

    assert.equal(event.defaultPrevented, false);
    assert.equal(event.immediatePropagationStopped, false);
    assert.equal(buttonClicks, 1);
  });

  it('does not consume clicks inside the narration box safe zone', async () => {
    let documentSawClick = false;
    const dismissed = narrationBox.show('Tap a word', { speaker: 'Cid' });
    await waitForDeferredListener();

    const event = createEvent(dom.narrationText);
    for (const listener of documentListeners.get('click') || []) {
      listener(event);
      documentSawClick = true;
    }

    assert.equal(documentSawClick, true);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.immediatePropagationStopped, false);

    narrationBox.forceHide();
    await dismissed;
  });

  it('does not consume clicks inside the dictionary popup safe zone', async () => {
    dialoguePopupVisible = true;
    const dismissed = narrationBox.show('Dictionary open', { speaker: 'Cid' });
    await waitForDeferredListener();

    const event = createEvent(dom.lookupPopup);
    for (const listener of documentListeners.get('click') || []) {
      listener(event);
    }

    assert.equal(event.defaultPrevented, false);
    assert.equal(event.immediatePropagationStopped, false);

    narrationBox.forceHide();
    await dismissed;
  });
});
