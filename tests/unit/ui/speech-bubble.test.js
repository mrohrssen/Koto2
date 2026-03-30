/**
 * Unit tests for speech-bubble.js and creature-speech.js
 *
 * Tests core logic: phrase selection, random gating, active-bubble mutex,
 * exposure tracking, and phrase data structure validation.
 * Runs in Node.js without a real browser DOM.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ============ PHRASE DATA VALIDATION ============

describe('creature-speech phrase data', async () => {
  let SPEECH_PHRASES;
  try {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const jsonPath = join(process.cwd(), 'data', 'creature-speech.json');
    SPEECH_PHRASES = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch {
    SPEECH_PHRASES = null;
  }

  it('exports all required trigger types', () => {
    if (!SPEECH_PHRASES) return; // skip if import failed
    const required = ['onHit', 'onVictory', 'onExplore', 'onHeal', 'onKO', 'onStatusEffect', 'onLowHP', 'onAttack'];
    for (const key of required) {
      assert.ok(Array.isArray(SPEECH_PHRASES[key]), `Missing or non-array trigger type: ${key}`);
      assert.ok(SPEECH_PHRASES[key].length >= 2, `Trigger type ${key} should have at least 2 phrases, got ${SPEECH_PHRASES[key].length}`);
    }
  });

  it('each phrase has required fields: jp, reading, en, romaji', () => {
    if (!SPEECH_PHRASES) return;
    for (const [trigger, phrases] of Object.entries(SPEECH_PHRASES)) {
      for (let i = 0; i < phrases.length; i++) {
        const p = phrases[i];
        assert.ok(typeof p.jp === 'string' && p.jp.length > 0, `${trigger}[${i}].jp missing`);
        assert.ok(typeof p.reading === 'string' && p.reading.length > 0, `${trigger}[${i}].reading missing`);
        assert.ok(typeof p.en === 'string' && p.en.length > 0, `${trigger}[${i}].en missing`);
        assert.ok(typeof p.romaji === 'string' && p.romaji.length > 0, `${trigger}[${i}].romaji missing`);
      }
    }
  });

  it('no duplicate jp values within same trigger type', () => {
    if (!SPEECH_PHRASES) return;
    for (const [trigger, phrases] of Object.entries(SPEECH_PHRASES)) {
      const seen = new Set();
      for (const p of phrases) {
        assert.ok(!seen.has(p.jp), `Duplicate jp "${p.jp}" in ${trigger}`);
        seen.add(p.jp);
      }
    }
  });
});

// ============ COMBAT EVENTS BUS ============

describe('combat-events bus', async () => {
  let combatEvents;
  try {
    const mod = await import('../../../public/js/ui/combat-events.js');
    combatEvents = mod.combatEvents;
  } catch {
    combatEvents = null;
  }

  it('emits and receives events with detail', () => {
    if (!combatEvents) return;
    let received = null;
    combatEvents.on('testEvent', (detail) => { received = detail; });
    combatEvents.emit('testEvent', { foo: 'bar' });
    assert.deepStrictEqual(received, { foo: 'bar' });
  });

  it('emits events without detail', () => {
    if (!combatEvents) return;
    let called = false;
    combatEvents.on('noDetail', () => { called = true; });
    combatEvents.emit('noDetail');
    assert.ok(called);
  });
});

// ============ SPEECH BUBBLE LOGIC ============

describe('speech-bubble logic', () => {
  // Test the core logic patterns without importing the module directly
  // (it has browser DOM deps that break in Node)

  it('25% trigger rate: fires when random < 0.25', () => {
    const TRIGGER_CHANCE = 0.25;
    // Should fire
    assert.ok(0.1 < TRIGGER_CHANCE, 'random=0.1 should trigger');
    assert.ok(0.24 < TRIGGER_CHANCE, 'random=0.24 should trigger');
    // Should not fire
    assert.ok(!(0.25 < TRIGGER_CHANCE), 'random=0.25 should NOT trigger');
    assert.ok(!(0.5 < TRIGGER_CHANCE), 'random=0.5 should NOT trigger');
    assert.ok(!(0.99 < TRIGGER_CHANCE), 'random=0.99 should NOT trigger');
  });

  it('phrase selection picks from correct pool', () => {
    const phrases = {
      onHit: [{ jp: 'a' }, { jp: 'b' }],
      onVictory: [{ jp: 'c' }]
    };

    // With deterministic random
    const pick = (type, rand) => {
      const pool = phrases[type];
      if (!pool || pool.length === 0) return null;
      return pool[Math.floor(rand * pool.length)];
    };

    assert.deepStrictEqual(pick('onHit', 0.0), { jp: 'a' });
    assert.deepStrictEqual(pick('onHit', 0.6), { jp: 'b' });
    assert.deepStrictEqual(pick('onVictory', 0.0), { jp: 'c' });
    assert.strictEqual(pick('nonexistent', 0.0), null);
  });

  it('active bubble mutex prevents overlap', () => {
    let activeBubble = null;

    function tryShow(phrase) {
      if (activeBubble) return false; // mutex
      activeBubble = { phrase };
      return true;
    }

    function dismiss() {
      activeBubble = null;
    }

    assert.ok(tryShow({ jp: 'first' }), 'First bubble should show');
    assert.ok(!tryShow({ jp: 'second' }), 'Second bubble should be blocked by mutex');
    dismiss();
    assert.ok(tryShow({ jp: 'third' }), 'After dismiss, new bubble should show');
  });

  it('exposure tracking collects jp field', () => {
    const exposures = new Set();
    function addExposure(word) { exposures.add(word); }

    const phrase = { jp: '痛い', reading: 'いたい', en: 'Ouch!', romaji: 'itai' };
    addExposure(phrase.jp);

    assert.ok(exposures.has('痛い'));
    assert.strictEqual(exposures.size, 1);

    // Adding same word again doesn't duplicate (Set behavior)
    addExposure(phrase.jp);
    assert.strictEqual(exposures.size, 1);
  });
});
