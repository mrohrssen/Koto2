import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  crystalCostHtml,
  updateCrystalBalance,
  showDailyCrystalBonusModal,
  removeDailyCrystalBonusModal
} from '../../../public/js/ui/crystals.js';

class FakeElement {
  constructor() {
    this.innerHTML = '';
    this.textContent = '';
    this.className = '';
    this.children = [];
    this.listeners = {};
    this.attributes = {};
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  click() {
    this.listeners.click?.();
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  remove() {
    this.removed = true;
  }

  querySelector(selector) {
    return this.children.find(child => child.className.includes(selector.slice(1))) || null;
  }
}

describe('crystal UI helpers', () => {
  it('renders crystal cost markup for inside buttons', () => {
    assert.equal(
      crystalCostHtml(5),
      '<span class="crystal-cost" aria-label="5 crystals"><span class="crystal-icon" aria-hidden="true">◆</span><span class="crystal-cost-number">5</span></span>'
    );
  });

  it('updates the crystal balance chip', () => {
    const chip = new FakeElement();
    updateCrystalBalance(chip, 125);

    assert.match(chip.innerHTML, /crystal-icon/);
    assert.match(chip.innerHTML, /125/);
    assert.equal(chip.className, 'hud-chip crystal-balance');
    assert.equal(chip.attributes['aria-label'], '125 crystals');
  });

  it('shows and dismisses the daily bonus modal', () => {
    const body = new FakeElement();
    const documentLike = {
      body,
      createElement: () => new FakeElement()
    };

    const modal = showDailyCrystalBonusModal({ amount: 100, balance: 125, documentRef: documentLike });
    assert.equal(body.children.length, 1);
    assert.match(modal.innerHTML, /Daily Login Bonus/);
    assert.match(modal.innerHTML, /\+100/);
    assert.match(modal.innerHTML, /125/);

    removeDailyCrystalBonusModal(modal);
    assert.equal(modal.removed, true);
  });
});
