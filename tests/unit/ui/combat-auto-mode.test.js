import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  initCombatAutoMode,
  isCombatAutoEnabled,
  setCombatAutoEnabled,
  subscribeCombatAutoMode,
  updateExploreCombatAutoContext,
  setPvpCombatAutoContext,
} from '../../../public/js/ui/combat-auto-mode.js';

const exploreCombat = (overrides = {}) => ({
  phase: 'combat',
  run: { active: true },
  combat: { active: true },
  meta: { tutorialStep: 6 },
  ...overrides,
});

class ToggleButton extends EventTarget {
  hidden = true;
  disabled = false;
  attributes = {};
  classes = new Set();
  stateLabel = { textContent: '' };
  classList = { toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name) };
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector(selector) { return selector === '.combat-auto-state' ? this.stateLabel : null; }
}

describe('combat Auto mode scope and toggle', () => {
  let button;
  beforeEach(() => {
    setPvpCombatAutoContext(false);
    updateExploreCombatAutoContext(null);
    setCombatAutoEnabled(false);
    button = new ToggleButton();
    globalThis.document = { getElementById: (id) => id === 'combat-auto-toggle' ? button : null };
    initCombatAutoMode();
  });
  afterEach(() => { delete globalThis.document; });

  it('starts off and exposes an accessible toggle only in Explore combat', () => {
    assert.equal(button.hidden, true);
    assert.equal(isCombatAutoEnabled(), false);
    updateExploreCombatAutoContext(exploreCombat());
    assert.equal(button.hidden, false);
    assert.equal(button.attributes['aria-pressed'], 'false');
    assert.equal(button.stateLabel.textContent, 'Off');

    const click = new Event('click', { bubbles: true });
    button.dispatchEvent(click);
    assert.equal(click.cancelBubble, true, 'the toggle must not dismiss scene narration');
    assert.equal(isCombatAutoEnabled(), true);
    assert.equal(button.attributes['aria-pressed'], 'true');
    assert.equal(button.stateLabel.textContent, 'On');
    assert.equal(button.classes.has('is-active'), true);

    button.dispatchEvent(new Event('click'));
    assert.equal(isCombatAutoEnabled(), false);
    assert.equal(button.classes.has('is-active'), false);
  });

  it('blocks hub, tutorial, Kanji Kombat, move learning and unrelated combat modes', () => {
    setCombatAutoEnabled(true);
    for (const state of [
      null,
      exploreCombat({ phase: 'hub' }),
      exploreCombat({ phase: 'move_learning' }),
      exploreCombat({ phase: 'exploring' }),
      exploreCombat({ run: { active: false } }),
      exploreCombat({ run: { active: true, mode: 'kanjiKombat' } }),
      exploreCombat({ run: { active: true, mode: 'otherMode' } }),
      exploreCombat({ meta: { tutorialStep: 1 } }),
      exploreCombat({ meta: { tutorialStep: 5 } }),
      exploreCombat({ combat: null }),
      exploreCombat({ combat: { active: false } }),
    ]) {
      updateExploreCombatAutoContext(state);
      assert.equal(isCombatAutoEnabled(), false, JSON.stringify(state));
      assert.equal(button.hidden, true, JSON.stringify(state));
    }
    updateExploreCombatAutoContext(exploreCombat({ meta: {} }));
    assert.equal(isCombatAutoEnabled(), true, 'legacy saves without tutorial progress count as complete');
  });

  it('retains Explore scope through terminal attack playback and clears it afterward', () => {
    setCombatAutoEnabled(true);
    updateExploreCombatAutoContext(exploreCombat());
    const terminal = exploreCombat({ phase: 'post_combat_shop', combat: null });
    updateExploreCombatAutoContext(terminal, { playbackActive: true });
    assert.equal(isCombatAutoEnabled(), true);
    assert.equal(button.hidden, false);
    updateExploreCombatAutoContext(terminal, { playbackActive: false });
    assert.equal(isCombatAutoEnabled(), false);
    assert.equal(button.hidden, true);
  });

  it('does not carry a playback latch into hub, tutorial or Kanji Kombat', () => {
    setCombatAutoEnabled(true);
    for (const state of [
      exploreCombat({ phase: 'hub' }),
      exploreCombat({ phase: 'move_learning' }),
      exploreCombat({ meta: { tutorialStep: 1 } }),
      exploreCombat({ run: { active: true, mode: 'kanjiKombat' } }),
      null,
    ]) {
      updateExploreCombatAutoContext(exploreCombat());
      updateExploreCombatAutoContext(state, { playbackActive: true });
      assert.equal(isCombatAutoEnabled(), false, JSON.stringify(state));
    }
  });

  it('activates PvP independently of game phase and clears stale Explore context at exit', () => {
    setCombatAutoEnabled(true);
    updateExploreCombatAutoContext(exploreCombat());
    setPvpCombatAutoContext(true);
    updateExploreCombatAutoContext({ phase: 'pvp_lobby' });
    assert.equal(isCombatAutoEnabled(), true);
    assert.equal(button.hidden, false);
    setPvpCombatAutoContext(false);
    assert.equal(isCombatAutoEnabled(), false);
    assert.equal(button.hidden, true);
    setPvpCombatAutoContext(true);
    assert.equal(isCombatAutoEnabled(), true, 'session preference survives the next match');
  });

  it('notifies timing subscribers only when effective enabled state changes', () => {
    const changes = [];
    const unsubscribe = subscribeCombatAutoMode(value => changes.push(value));
    setCombatAutoEnabled(true);
    updateExploreCombatAutoContext(exploreCombat());
    updateExploreCombatAutoContext(exploreCombat());
    setCombatAutoEnabled(false);
    setCombatAutoEnabled(true);
    updateExploreCombatAutoContext(null);
    assert.deepEqual(changes, [true, false, true, false]);
    unsubscribe();
    setPvpCombatAutoContext(true);
    assert.deepEqual(changes, [true, false, true, false]);
  });

  it('initialization is idempotent and state APIs tolerate no document', () => {
    initCombatAutoMode();
    updateExploreCombatAutoContext(exploreCombat());
    button.dispatchEvent(new Event('click'));
    assert.equal(isCombatAutoEnabled(), true, 'one click toggles once after repeated initialization');
    delete globalThis.document;
    assert.doesNotThrow(() => {
      initCombatAutoMode();
      updateExploreCombatAutoContext(null);
      setPvpCombatAutoContext(true);
      setCombatAutoEnabled(false);
    });
    assert.equal(isCombatAutoEnabled(), false);
  });
});
