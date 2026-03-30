/**
 * Unit tests for event-popup.js
 *
 * These tests run in Node.js without a real browser DOM.
 * We mock the necessary globals (document, requestAnimationFrame, performance)
 * to test logic without visual rendering.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ============ DOM MOCK SETUP ============

// Shared bodyChildren array — cleared in-place (not reassigned) so the
// document.body.appendChild closure always references the same array.
const bodyChildren = [];

let rafCallbacks = [];

function makeRect(left = 0, top = 0, width = 50, height = 50) {
  return { left, top, width, height };
}

function createElementMock(tag) {
  const el = {
    _tag: tag,
    _children: [],
    _classes: new Set(),
    className: '',
    textContent: '',
    dataset: {},
    animationDuration: '',
    style: {
      color: '',
      left: '',
      top: '',
      backgroundColor: '',
      setProperty(key, val) { this[key] = val; }
    },
    classList: null, // set below
    appendChild(child) { this._children.push(child); return child; },
    querySelectorAll(sel) {
      if (sel === '.status-icon[data-effect]') {
        return this._children.filter(c => c.dataset && 'effect' in c.dataset);
      }
      return [];
    },
    querySelector(sel) {
      if (sel === '.status-icons') {
        return this._children.find(c => c.className === 'status-icons') || null;
      }
      return null;
    },
    remove() {
      const idx = bodyChildren.indexOf(this);
      if (idx !== -1) bodyChildren.splice(idx, 1);
    },
    // Default bounding rect — override per test if needed
    getBoundingClientRect() { return makeRect(100, 200, 50, 50); }
  };

  el.classList = {
    add(...classes) { classes.forEach(c => { el._classes.add(c); el.className = [...el._classes].join(' '); }); },
    remove(...classes) { classes.forEach(c => { el._classes.delete(c); el.className = [...el._classes].join(' '); }); },
    has(c) { return el._classes.has(c); }
  };

  return el;
}

// Set up global mocks BEFORE importing the module
global.document = {
  createElement: createElementMock,
  body: {
    appendChild(child) { bodyChildren.push(child); },
    querySelectorAll() { return []; }
  },
  querySelectorAll(sel) {
    if (sel === '.status-icons') return [];
    return [];
  }
};

global.performance = { now: () => 0 };
global.requestAnimationFrame = (cb) => { rafCallbacks.push(cb); return rafCallbacks.length; };

// Do NOT execute setTimeout callbacks — the auto-remove cleanup would delete
// popup elements from bodyChildren before assertions can run.
global.setTimeout = (_fn, _ms) => { /* no-op in tests */ };

// ============ IMPORT MODULE UNDER TEST ============
// Module imports happen after globals are set — ES module top-level await
const {
  showEventPopup,
  credits,
  updateStatusIcons,
  clearAllStatusIcons,
  animateCounter
} = await import('../../../public/js/ui/event-popup.js');

// ============ HELPERS ============

function clearBody() {
  bodyChildren.length = 0;
}

function clearRaf() {
  rafCallbacks.length = 0;
}

// ============ TESTS ============

describe('showEventPopup', () => {
  beforeEach(clearBody);

  it('creates a popup element and appends to body', () => {
    const targetEl = createElementMock('div');

    showEventPopup(targetEl, 'Test!', { color: '#FF0000', particles: 0 });

    assert.equal(bodyChildren.length, 1);
    const popup = bodyChildren[0];
    assert.equal(popup.textContent, 'Test!');
    assert.equal(popup.style.color, '#FF0000');
  });

  it('sets correct CSS class for size=large', () => {
    const targetEl = createElementMock('div');

    showEventPopup(targetEl, 'Big!', { size: 'large', particles: 0 });

    const popup = bodyChildren[0];
    assert.ok(
      popup.className.includes('event-popup-large'),
      `Expected 'event-popup-large' in className: "${popup.className}"`
    );
  });

  it('prepends icon when icon option is provided', () => {
    const targetEl = createElementMock('div');

    showEventPopup(targetEl, 'Healed', { icon: '+', particles: 0 });

    const popup = bodyChildren[0];
    assert.equal(popup.textContent, '+ Healed');
  });

  it('does nothing when targetEl is null', () => {
    showEventPopup(null, 'Should not crash');
    assert.equal(bodyChildren.length, 0);
  });

  it('sets --ep-direction to negative value for up direction', () => {
    const targetEl = createElementMock('div');

    showEventPopup(targetEl, 'Up!', { direction: 'up', particles: 0 });

    const popup = bodyChildren[0];
    // The custom property should be set to -45px (negative = upward)
    assert.equal(popup.style['--ep-direction'], '-45px');
  });

  it('sets --ep-direction to positive value for down direction', () => {
    const targetEl = createElementMock('div');

    showEventPopup(targetEl, 'Down!', { direction: 'down', particles: 0 });

    const popup = bodyChildren[0];
    assert.equal(popup.style['--ep-direction'], '45px');
  });
});

describe('credits preset', () => {
  beforeEach(clearBody);

  it('formats positive amount with + and ¤ suffix', () => {
    const targetEl = createElementMock('div');

    credits(targetEl, 50);

    const popup = bodyChildren[0];
    assert.equal(popup.textContent, '+50¤');
    assert.equal(popup.style.color, '#FFD700');
  });

  it('formats negative amount with ¤ suffix and red color', () => {
    const targetEl = createElementMock('div');

    credits(targetEl, -25);

    const popup = bodyChildren[0];
    assert.equal(popup.textContent, '-25¤');
    assert.equal(popup.style.color, '#F44336');
  });

  it('formats zero as +0¤ with gold color', () => {
    const targetEl = createElementMock('div');

    credits(targetEl, 0);

    const popup = bodyChildren[0];
    assert.equal(popup.textContent, '+0¤');
    assert.equal(popup.style.color, '#FFD700');
  });
});

describe('updateStatusIcons', () => {
  it('creates .status-icons container if missing', () => {
    const slotEl = createElementMock('div');

    updateStatusIcons(slotEl, ['poison']);

    const container = slotEl._children.find(c => c.className === 'status-icons');
    assert.ok(container, 'Expected .status-icons container to be created');
  });

  it('adds icon elements for active effects', () => {
    const slotEl = createElementMock('div');

    updateStatusIcons(slotEl, ['poison', 'stun']);

    const container = slotEl._children.find(c => c.className === 'status-icons');
    assert.ok(container, 'Expected .status-icons container');
    assert.equal(container._children.length, 2);
  });

  it('skips unknown effect keys', () => {
    const slotEl = createElementMock('div');

    updateStatusIcons(slotEl, ['unknown_effect_xyz']);

    const container = slotEl._children.find(c => c.className === 'status-icons');
    assert.ok(container);
    assert.equal(container._children.length, 0);
  });

  it('uses correct label for shield effect', () => {
    const slotEl = createElementMock('div');

    updateStatusIcons(slotEl, ['shield']);

    const container = slotEl._children.find(c => c.className === 'status-icons');
    const icon = container._children[0];
    assert.equal(icon.textContent, 'SHD');
  });

  it('uses correct label for poison effect', () => {
    const slotEl = createElementMock('div');

    updateStatusIcons(slotEl, ['poison']);

    const container = slotEl._children.find(c => c.className === 'status-icons');
    const icon = container._children[0];
    assert.equal(icon.textContent, 'PSN');
  });

  it('does nothing when slotEl is null', () => {
    assert.doesNotThrow(() => updateStatusIcons(null, ['poison']));
  });

  it('handles empty activeEffects array', () => {
    const slotEl = createElementMock('div');

    updateStatusIcons(slotEl, []);

    const container = slotEl._children.find(c => c.className === 'status-icons');
    assert.ok(container, 'Container should still be created');
    assert.equal(container._children.length, 0);
  });
});

describe('animateCounter', () => {
  beforeEach(clearRaf);

  it('queues a requestAnimationFrame callback', () => {
    const el = createElementMock('span');
    el.textContent = '0';

    animateCounter(el, 0, 100, 400);

    assert.ok(rafCallbacks.length > 0, 'Expected at least one rAF callback to be queued');
  });

  it('sets final value when rAF callback runs at end of duration', () => {
    const el = createElementMock('span');
    el.textContent = '0';

    // Mock performance.now to return 0 at start
    let nowValue = 0;
    global.performance.now = () => nowValue;

    animateCounter(el, 10, 20, 100, { prefix: '$', suffix: ' pts' });

    // Simulate rAF at t=end (now=start+duration)
    const firstCb = rafCallbacks[0];
    firstCb(100); // elapsed = 100 = duration → t=1 → complete

    assert.equal(el.textContent, '$20 pts');

    global.performance.now = () => 0; // restore
  });

  it('applies ease-out progression (midpoint > 50% of range)', () => {
    const el = createElementMock('span');
    let nowValue = 0;
    global.performance.now = () => nowValue;
    rafCallbacks.length = 0;

    animateCounter(el, 0, 100, 100);

    // Simulate rAF at t=0.5 (halfway through)
    const firstCb = rafCallbacks[0];
    firstCb(50); // elapsed=50, t=0.5, ease-out: 0.5*(2-0.5)=0.75 → value=75

    assert.equal(el.textContent, '75', 'Ease-out-quad at t=0.5 should give 75% of range');

    global.performance.now = () => 0;
  });

  it('does nothing when el is null', () => {
    assert.doesNotThrow(() => animateCounter(null, 0, 100));
  });
});
