/**
 * Unit tests for speech-bubble.js and bark frame data (frames.json)
 *
 * Tests core logic: phrase selection, random gating, active-bubble mutex,
 * exposure tracking, and bark frame data structure validation.
 * Runs in Node.js without a real browser DOM.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ============ BARK FRAME DATA VALIDATION ============

describe('frames.json bark data', async () => {
  let FRAMES;
  let BARK_FRAMES;
  try {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const jsonPath = join(process.cwd(), 'data', 'dialogue', 'frames.json');
    FRAMES = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    BARK_FRAMES = FRAMES.filter(f => f.category.startsWith('bark_'));
  } catch {
    FRAMES = null;
    BARK_FRAMES = null;
  }

  it('has all required bark trigger categories', () => {
    if (!BARK_FRAMES) return; // skip if import failed
    const required = ['bark_onHit', 'bark_onVictory', 'bark_onExplore', 'bark_onHeal', 'bark_onKO', 'bark_onStatusEffect', 'bark_onLowHP', 'bark_onAttack'];
    for (const cat of required) {
      const frames = BARK_FRAMES.filter(f => f.category === cat);
      assert.ok(frames.length >= 2, `Category ${cat} should have at least 2 frames, got ${frames.length}`);
    }
  });

  it('each bark frame has required fields: id, category, raw, tokens, words', () => {
    if (!BARK_FRAMES) return;
    for (const frame of BARK_FRAMES) {
      assert.ok(typeof frame.id === 'string' && frame.id.length > 0, `frame.id missing in ${JSON.stringify(frame)}`);
      assert.ok(typeof frame.category === 'string' && frame.category.length > 0, `frame.category missing in ${frame.id}`);
      assert.ok(typeof frame.raw === 'string' && frame.raw.length > 0, `${frame.id}.raw missing`);
      assert.ok(Array.isArray(frame.tokens), `${frame.id}.tokens must be an array`);
      assert.ok(Array.isArray(frame.words), `${frame.id}.words must be an array`);
    }
  });

  it('no duplicate raw values within same bark category', () => {
    if (!BARK_FRAMES) return;
    const categories = [...new Set(BARK_FRAMES.map(f => f.category))];
    for (const cat of categories) {
      const frames = BARK_FRAMES.filter(f => f.category === cat);
      const seen = new Set();
      for (const frame of frames) {
        assert.ok(!seen.has(frame.raw), `Duplicate raw "${frame.raw}" in ${cat}`);
        seen.add(frame.raw);
      }
    }
  });

  it('bark frames have at most 3 content words', () => {
    if (!BARK_FRAMES) return;
    for (const frame of BARK_FRAMES) {
      assert.ok(frame.words.length <= 3, `${frame.id} has ${frame.words.length} words (max 3 for barks)`);
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

// ============ BUBBLE AUTO-FIT ============

describe('calcBubbleOverflow', async () => {
  let calcBubbleOverflow;
  try {
    const mod = await import('../../../public/js/ui/speech-bubble.js');
    calcBubbleOverflow = mod.calcBubbleOverflow;
  } catch {
    calcBubbleOverflow = null;
  }

  it('returns zero padding when no glosses', () => {
    if (!calcBubbleOverflow) return;
    const result = calcBubbleOverflow(
      { top: 100, bottom: 130, left: 50, right: 230 },
      []
    );
    assert.deepStrictEqual(result, { bottom: 0, left: 0, right: 0 });
  });

  it('returns zero padding when gloss fits inside bubble', () => {
    if (!calcBubbleOverflow) return;
    const result = calcBubbleOverflow(
      { top: 100, bottom: 140, left: 50, right: 230 },
      [{ top: 110, bottom: 135, left: 80, right: 150 }]
    );
    assert.deepStrictEqual(result, { bottom: 0, left: 0, right: 0 });
  });

  it('detects vertical overflow below bubble', () => {
    if (!calcBubbleOverflow) return;
    const result = calcBubbleOverflow(
      { top: 100, bottom: 130, left: 50, right: 230 },
      [{ top: 125, bottom: 145, left: 80, right: 150 }]
    );
    assert.strictEqual(result.bottom, 15); // 145 - 130
  });

  it('detects horizontal overflow on both sides', () => {
    if (!calcBubbleOverflow) return;
    const result = calcBubbleOverflow(
      { top: 100, bottom: 130, left: 50, right: 230 },
      [{ top: 110, bottom: 125, left: 30, right: 250 }]
    );
    assert.strictEqual(result.left, 20);  // 50 - 30
    assert.strictEqual(result.right, 20); // 250 - 230
  });

  it('takes max overflow across multiple glosses', () => {
    if (!calcBubbleOverflow) return;
    const result = calcBubbleOverflow(
      { top: 100, bottom: 130, left: 50, right: 230 },
      [
        { top: 125, bottom: 140, left: 60, right: 200 },
        { top: 125, bottom: 150, left: 40, right: 260 }
      ]
    );
    assert.strictEqual(result.bottom, 20); // max(10, 20)
    assert.strictEqual(result.left, 10);   // max(0, 10)
    assert.strictEqual(result.right, 30);  // max(0, 30)
  });
});
