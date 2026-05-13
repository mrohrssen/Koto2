import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../../public/js/audio.js', {
  exports: { playSFX: () => {} },
});

await mock.module('../../../public/js/native/index.js', {
  exports: { hapticLight: () => {} },
});

class FakeClassList {
  constructor(el) {
    this.el = el;
  }

  add(...classes) {
    const existing = new Set(this.el.className.split(/\s+/).filter(Boolean));
    for (const cls of classes) existing.add(cls);
    this.el.className = Array.from(existing).join(' ');
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.listeners = {};
    this.parentNode = null;
    this.style = {};
    this.className = '';
    this.disabled = false;
    this.tabIndex = 0;
    this.dataset = {};
    this.classList = new FakeClassList(this);
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML + this.children.map(child => child.outerHTML).join('');
  }

  get outerHTML() {
    const classAttr = this.className ? ` class="${this.className}"` : '';
    return `<${this.tagName}${classAttr}>${this.innerHTML}</${this.tagName}>`;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }

  click() {
    for (const handler of this.listeners.click || []) {
      handler({ target: this });
    }
  }

  closest(selector) {
    if (!selector.startsWith('.')) return null;
    const cls = selector.slice(1);
    let node = this;
    while (node) {
      if (node.className.split(/\s+/).includes(cls)) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    if (!selector.startsWith('.')) return [];
    const cls = selector.slice(1);
    const matches = [];
    const visit = (node) => {
      if (node.className.split(/\s+/).includes(cls)) matches.push(node);
      for (const child of node.children) visit(child);
    };
    visit(this);
    return matches;
  }
}

let actionArea;

globalThis.document = {
  createElement: tagName => new FakeElement(tagName),
  getElementById: id => (id === 'action-area' ? actionArea : null),
};

const { renderButtonsAsync, renderChoices, renderChoicesAsync } = await import('../../../public/js/ui/ui-components.js');

describe('selection clearing', () => {
  beforeEach(() => {
    actionArea = new FakeElement('div');
  });

  it('clears async button choices without showing a false continue hint', async () => {
    const selected = renderButtonsAsync([{ label: 'はなす (Talk)' }]);

    const [button] = actionArea.querySelectorAll('.ui-btn');
    button.click();

    assert.equal(await selected, 0);
    assert.doesNotMatch(actionArea.innerHTML, /prologue-continue-hint/);
    assert.doesNotMatch(actionArea.innerHTML, /Tap here to continue!/);
    assert.equal(actionArea.querySelectorAll('.ui-btn').length, 0);
  });

  it('clears card choices without showing a false continue hint', () => {
    let selectedIndex = null;
    renderChoices({
      cards: [{ title: 'Skill A' }, { title: 'Skill B' }],
      onSelect: index => { selectedIndex = index; },
    });

    const [choice] = actionArea.querySelectorAll('.ui-choice');
    choice.click();

    assert.equal(selectedIndex, 0);
    assert.doesNotMatch(actionArea.innerHTML, /prologue-continue-hint/);
    assert.doesNotMatch(actionArea.innerHTML, /Tap here to continue!/);
    assert.equal(actionArea.querySelectorAll('.ui-choice').length, 0);
  });

  it('resolves async card choices with the selected index and heading', async () => {
    const selected = renderChoicesAsync({
      heading: 'Choose a response',
      cards: [{ title: 'はい' }, { title: 'いいえ' }],
    });

    assert.equal(actionArea.children[0].className, 'ui-choice-heading');
    assert.equal(actionArea.children[0].textContent, 'Choose a response');

    const choices = actionArea.querySelectorAll('.ui-choice');
    choices[1].click();

    assert.equal(await selected, 1);
    assert.doesNotMatch(actionArea.innerHTML, /prologue-continue-hint/);
  });
});
