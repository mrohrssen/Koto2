import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let showFormation;
let playerFormation;
let enemyFormation;

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.attributes = {};
    this.classList = {
      add: (...names) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach(name => set.add(name));
        this.className = [...set].join(' ');
      },
      remove: (...names) => {
        const remove = new Set(names);
        this.className = this.className.split(/\s+/).filter(name => !remove.has(name)).join(' ');
      },
      toggle: (name, force) => {
        if (force) this.classList.add(name);
        else this.classList.remove(name);
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  set innerHTML(value) {
    this.children = [];
    this._innerHTML = value;
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  querySelectorAll(selector) {
    const results = [];
    const className = selector.split('.').pop();
    const visit = (node) => {
      if (node.className?.split(/\s+/).includes(className)) results.push(node);
      node.children?.forEach(visit);
    };
    this.children.forEach(visit);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

beforeEach(async () => {
  playerFormation = new FakeElement('player-formation');
  enemyFormation = new FakeElement('enemy-formation');
  globalThis.document = {
    createElement: () => new FakeElement(),
    querySelector: () => null,
    getElementById: (id) => {
      if (id === 'player-formation') return playerFormation;
      if (id === 'enemy-formation') return enemyFormation;
      return new FakeElement(id);
    },
  };
  globalThis.window = {};
  ({ showFormation } = await import('../../../public/js/ui/combat-dom.js'));
});

describe('combat-dom battlefield positioning', () => {
  it('marks formation slots for absolute battlefield rows', async () => {
    await showFormation('player', [
      { uid: 'a', id: 'a', name: 'あ', reading: 'あ', hp: 10, currentHp: 10, maxHp: 10, maxMp: 5, currentMp: 5 },
      { uid: 'b', id: 'b', name: 'い', reading: 'い', hp: 10, currentHp: 10, maxHp: 10, maxMp: 5, currentMp: 5 },
      { uid: 'c', id: 'c', name: 'う', reading: 'う', hp: 10, currentHp: 10, maxHp: 10, maxMp: 5, currentMp: 5 },
    ], { force: true });

    const slots = playerFormation.querySelectorAll('.formation-slot');
    assert.equal(slots.length, 3);
    assert.equal(slots[0].dataset.row, 'top');
    assert.equal(slots[1].dataset.row, 'middle');
    assert.equal(slots[2].dataset.row, 'bottom');
    assert.equal(slots[0].style.left, '19.5%');
    assert.equal(slots[0].style.top, '43.5%');
  });

  it('keeps formation info absolutely fixed above the slot anchor', () => {
    const css = fs.readFileSync(new URL('../../../public/game.css', import.meta.url), 'utf8');
    assert.match(css, /\.formation-info\s*\{[^}]*position:\s*absolute/s);
    assert.match(css, /\.formation-info\s*\{[^}]*bottom:\s*calc\(50% \+ 34px\)/s);
    assert.doesNotMatch(css, /\.formation-slot\s*\{[^}]*flex-direction:\s*column-reverse/s);
  });

  it('does not transform defeated enemy slots away from their battlefield anchor', () => {
    const css = fs.readFileSync(new URL('../../../public/game.css', import.meta.url), 'utf8');
    const defeatedRule = css.match(/\.enemy-formation \.formation-slot\.defeated\s*\{(?<body>[^}]*)\}/s);
    assert.ok(defeatedRule, 'defeated enemy slot rule should exist');
    assert.doesNotMatch(defeatedRule.groups.body, /animation\s*:/);
    assert.doesNotMatch(defeatedRule.groups.body, /transform\s*:/);
    assert.doesNotMatch(css, /@keyframes enemy-defeated/);
  });
}
);
