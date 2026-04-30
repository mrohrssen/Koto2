import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeElement {
  constructor(tag, id = null) {
    this.tag = tag;
    this.id = id;
    this.children = [];
    this.className = '';
    this._innerHTML = '';
    this._textContent = '';
    this.style = {};
    this.events = {};
    this.tabIndex = 0;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    this.children = [];
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  addEventListener(type, handler) {
    this.events[type] = handler;
  }

  querySelector() {
    return null;
  }
}

const elementsById = new Map();

function resetDocument() {
  elementsById.clear();
  elementsById.set('action-area', new FakeElement('div', 'action-area'));
}

global.document = {
  createElement: tag => new FakeElement(tag),
  getElementById: id => elementsById.get(id) || null,
};

await mock.module('../../../public/js/audio.js', {
  namedExports: { playSFX: () => {} },
});
await mock.module('../../../public/js/native/index.js', {
  namedExports: { hapticLight: () => {} },
});

const { renderChoices } = await import('../../../public/js/ui/ui-components.js');

describe('renderChoices', () => {
  beforeEach(() => {
    resetDocument();
  });

  it('renders an optional heading above the choice cards', () => {
    renderChoices({
      heading: 'Choose target',
      cards: [{ title: 'Neko' }],
      onSelect: () => {},
    });

    const actionArea = document.getElementById('action-area');
    assert.equal(actionArea.children[0].className, 'ui-choice-heading');
    assert.equal(actionArea.children[0].textContent, 'Choose target');
    assert.equal(actionArea.children[1].className, 'ui-choice-list');
  });
});
