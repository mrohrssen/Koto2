import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { ResourceRegistry } from '../../../public/js/scenes/resource-registry.js';

// ---------------------------------------------------------------------------
// Seeded PRNG (Mulberry32 variant) — inline so tests need no external deps.
// A reproducible seed means any failing sequence can be re-run exactly.
// ---------------------------------------------------------------------------
function makeRng(seed = 1234) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Helper: save/restore clearTimeout + clearInterval around a callback
// ---------------------------------------------------------------------------
function withFakeTimers(fn) {
  const _origClearTimeout = globalThis.clearTimeout;
  const _origClearInterval = globalThis.clearInterval;
  globalThis.clearTimeout = () => {};
  globalThis.clearInterval = () => {};
  try {
    return fn();
  } finally {
    globalThis.clearTimeout = _origClearTimeout;
    globalThis.clearInterval = _origClearInterval;
  }
}

// ---------------------------------------------------------------------------
// Stub factories — minimal objects that satisfy each track* method's contract
// ---------------------------------------------------------------------------
function fakeContainer()  { return { destroy: () => {} }; }
function fakeUpdater()    { return () => {}; }
function fakeListener()   {
  return {
    target:  { removeEventListener: () => {} },
    event:   'x',
    handler: () => {},
    opts:    false,
  };
}
function fakeTimer()      { return Math.random() * 1e9 | 0 || 1; }
function fakeTween()      { return { cancel: () => {} }; }
function fakeAsync()      { return { abort: () => {} }; }
function fakeDom()        { return { remove: () => {} }; }

// ---------------------------------------------------------------------------
// Category 1: Property-based tests — invariants under random op sequences
// ---------------------------------------------------------------------------
describe('ResourceRegistry — property and stress', () => {

  it('property: size/untrack/dispose invariants hold across 100 random sequences', () => {
    withFakeTimers(() => {
      const NUM_SEQUENCES = 100;
      const OPS_PER_SEQ   = 50;
      const SEED_BASE      = 0xDEAD_BEEF;

      const TRACK_OPS = [
        'trackContainer', 'trackUpdater', 'trackListener',
        'trackTimer', 'trackTween', 'trackAsync', 'trackDom',
      ];
      const UNTRACK_OPS = ['untrackTimer', 'untrackTween', 'untrackUpdater'];
      const ALL_OPS = [...TRACK_OPS, ...UNTRACK_OPS];

      for (let seq = 0; seq < NUM_SEQUENCES; seq++) {
        const rand = makeRng(SEED_BASE + seq);
        const r    = new ResourceRegistry(`prop-seq-${seq}`);

        // Parallel model — mirrors what the registry should contain.
        // For Sets (containers, updaters, domNodes, timers, tweens, pendingAsync)
        // we track the actual JS Set because reference identity matters.
        // For listeners (array) we track count.
        const model = {
          containers:   new Set(),
          updaters:     new Set(),
          listeners:    0,      // array length
          timers:       new Set(),
          tweens:       new Set(),
          pendingAsync: new Set(),
          domNodes:     new Set(),
        };

        const modelSize = () =>
          model.containers.size + model.updaters.size + model.listeners
          + model.timers.size + model.tweens.size + model.pendingAsync.size
          + model.domNodes.size;

        // Pools of currently-tracked untrackable items (for realistic untrack ops)
        const trackedTimers  = [];
        const trackedTweens  = [];
        const trackedUpdaters = [];

        for (let op = 0; op < OPS_PER_SEQ; op++) {
          const opName = ALL_OPS[Math.floor(rand() * ALL_OPS.length)];
          const sizeBefore = r.size();

          switch (opName) {
            case 'trackContainer': {
              const c = fakeContainer();
              r.trackContainer(c);
              model.containers.add(c);
              assert.strictEqual(r.size(), sizeBefore + 1,
                `seq=${seq} op=${op}: size should grow by 1 after trackContainer`);
              break;
            }
            case 'trackUpdater': {
              const fn = fakeUpdater();
              r.trackUpdater(fn);
              model.updaters.add(fn);
              trackedUpdaters.push(fn);
              assert.strictEqual(r.size(), sizeBefore + 1,
                `seq=${seq} op=${op}: size should grow by 1 after trackUpdater`);
              break;
            }
            case 'trackListener': {
              const { target, event, handler, opts } = fakeListener();
              r.trackListener(target, event, handler, opts);
              model.listeners++;
              assert.strictEqual(r.size(), sizeBefore + 1,
                `seq=${seq} op=${op}: size should grow by 1 after trackListener`);
              break;
            }
            case 'trackTimer': {
              const id = fakeTimer();
              r.trackTimer(id);
              model.timers.add(id);
              trackedTimers.push(id);
              assert.strictEqual(r.size(), sizeBefore + 1,
                `seq=${seq} op=${op}: size should grow by 1 after trackTimer`);
              break;
            }
            case 'trackTween': {
              const t = fakeTween();
              r.trackTween(t);
              model.tweens.add(t);
              trackedTweens.push(t);
              assert.strictEqual(r.size(), sizeBefore + 1,
                `seq=${seq} op=${op}: size should grow by 1 after trackTween`);
              break;
            }
            case 'trackAsync': {
              const ac = fakeAsync();
              r.trackAsync(ac);
              model.pendingAsync.add(ac);
              assert.strictEqual(r.size(), sizeBefore + 1,
                `seq=${seq} op=${op}: size should grow by 1 after trackAsync`);
              break;
            }
            case 'trackDom': {
              const node = fakeDom();
              r.trackDom(node);
              model.domNodes.add(node);
              assert.strictEqual(r.size(), sizeBefore + 1,
                `seq=${seq} op=${op}: size should grow by 1 after trackDom`);
              break;
            }
            case 'untrackTimer': {
              if (trackedTimers.length === 0) break;
              const idx = Math.floor(rand() * trackedTimers.length);
              const id  = trackedTimers[idx];
              const wasPresent = model.timers.has(id);
              const result = r.untrackTimer(id);
              assert.strictEqual(result, wasPresent,
                `seq=${seq} op=${op}: untrackTimer should return ${wasPresent}`);
              if (wasPresent) {
                model.timers.delete(id);
                trackedTimers.splice(idx, 1);
              }
              break;
            }
            case 'untrackTween': {
              if (trackedTweens.length === 0) break;
              const idx = Math.floor(rand() * trackedTweens.length);
              const h   = trackedTweens[idx];
              const wasPresent = model.tweens.has(h);
              const result = r.untrackTween(h);
              assert.strictEqual(result, wasPresent,
                `seq=${seq} op=${op}: untrackTween should return ${wasPresent}`);
              if (wasPresent) {
                model.tweens.delete(h);
                trackedTweens.splice(idx, 1);
              }
              break;
            }
            case 'untrackUpdater': {
              if (trackedUpdaters.length === 0) break;
              const idx = Math.floor(rand() * trackedUpdaters.length);
              const fn  = trackedUpdaters[idx];
              const wasPresent = model.updaters.has(fn);
              const result = r.untrackUpdater(fn);
              assert.strictEqual(result, wasPresent,
                `seq=${seq} op=${op}: untrackUpdater should return ${wasPresent}`);
              if (wasPresent) {
                model.updaters.delete(fn);
                trackedUpdaters.splice(idx, 1);
              }
              break;
            }
          }

          // After every op, model size must match registry size
          assert.strictEqual(r.size(), modelSize(),
            `seq=${seq} op=${op} (${opName}): registry size mismatch`);
        }

        // Dispose terminality
        r.dispose();
        assert.strictEqual(r.size(), 0,  `seq=${seq}: size should be 0 after dispose`);
        assert.strictEqual(r.disposed, true, `seq=${seq}: disposed should be true`);
        assert.doesNotThrow(() => r.assertEmpty(), `seq=${seq}: assertEmpty should not throw after dispose`);

        // Idempotent dispose
        assert.doesNotThrow(() => r.dispose(), `seq=${seq}: second dispose should not throw`);
        assert.strictEqual(r.size(), 0, `seq=${seq}: size still 0 after second dispose`);

        // Track after dispose must throw
        assert.throws(() => r.trackContainer(fakeContainer()), /disposed/,
          `seq=${seq}: track after dispose must throw`);
      }
    });
  });

  it('property: disposal order is always async→timers→tweens→listeners→dom→containers', () => {
    withFakeTimers(() => {
      const NUM_SEQUENCES = 20;
      const SEED_BASE = 0xC0FFEE;

      for (let seq = 0; seq < NUM_SEQUENCES; seq++) {
        const rand = makeRng(SEED_BASE + seq);
        const r    = new ResourceRegistry(`order-seq-${seq}`);
        const log  = [];

        // Track random counts of each callback type
        const countFor = () => 1 + Math.floor(rand() * 5);

        const asyncCount     = countFor();
        const timerCount     = countFor();
        const tweenCount     = countFor();
        const listenerCount  = countFor();
        const domCount       = countFor();
        const containerCount = countFor();

        for (let i = 0; i < asyncCount; i++)
          r.trackAsync({ abort: () => log.push('async') });
        for (let i = 0; i < timerCount; i++) {
          const id = i + 1000;
          r.trackTimer(id);
        }
        for (let i = 0; i < tweenCount; i++)
          r.trackTween({ cancel: () => log.push('tween') });
        for (let i = 0; i < listenerCount; i++)
          r.trackListener({ removeEventListener: () => log.push('listener') }, 'e', () => {}, false);
        for (let i = 0; i < domCount; i++)
          r.trackDom({ remove: () => log.push('dom') });
        for (let i = 0; i < containerCount; i++)
          r.trackContainer({ destroy: () => log.push('container') });

        // Override clearTimeout to log timer disposal
        const _origClearTimeout = globalThis.clearTimeout;
        const _origClearInterval = globalThis.clearInterval;
        globalThis.clearTimeout  = () => log.push('timer');
        globalThis.clearInterval = () => {};
        try {
          r.dispose();
        } finally {
          globalThis.clearTimeout  = _origClearTimeout;
          globalThis.clearInterval = _origClearInterval;
        }

        // Verify type-level ordering: find last index of earlier type vs first of later type
        const lastAsync     = log.lastIndexOf('async');
        const firstTimer    = log.indexOf('timer');
        const lastTimer     = log.lastIndexOf('timer');
        const firstTween    = log.indexOf('tween');
        const lastTween     = log.lastIndexOf('tween');
        const firstListener = log.indexOf('listener');
        const lastListener  = log.lastIndexOf('listener');
        const firstDom      = log.indexOf('dom');
        const lastDom       = log.lastIndexOf('dom');
        const firstContainer= log.indexOf('container');

        assert.ok(lastAsync < firstTimer,
          `seq=${seq}: all async entries must precede all timer entries`);
        assert.ok(lastTimer < firstTween,
          `seq=${seq}: all timer entries must precede all tween entries`);
        assert.ok(lastTween < firstListener,
          `seq=${seq}: all tween entries must precede all listener entries`);
        assert.ok(lastListener < firstDom,
          `seq=${seq}: all listener entries must precede all dom entries`);
        assert.ok(lastDom < firstContainer,
          `seq=${seq}: all dom entries must precede all container entries`);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Category 2: Stress tests
  // ---------------------------------------------------------------------------

  it('stress: 10K resources per type → dispose → assertEmpty', () => {
    withFakeTimers(() => {
      const N = 10_000;
      const r = new ResourceRegistry('10k-stress');

      for (let i = 0; i < N; i++) r.trackAsync(fakeAsync());
      for (let i = 0; i < N; i++) r.trackTimer(i + 1);   // timer ids 1..N
      for (let i = 0; i < N; i++) r.trackUpdater(fakeUpdater());
      for (let i = 0; i < N; i++) r.trackTween(fakeTween());
      for (let i = 0; i < N; i++) {
        const { target, event, handler, opts } = fakeListener();
        r.trackListener(target, event, handler, opts);
      }
      for (let i = 0; i < N; i++) r.trackDom(fakeDom());
      for (let i = 0; i < N; i++) r.trackContainer(fakeContainer());

      assert.strictEqual(r.size(), N * 7, '10K×7 = 70,000 resources before dispose');

      r.dispose();

      assert.strictEqual(r.size(), 0, 'size must be 0 after dispose');
      assert.strictEqual(r.disposed, true, 'disposed must be true');
      assert.doesNotThrow(() => r.assertEmpty(), 'assertEmpty should not throw after dispose');
    });
  });

  it('stress: 1,000 construct → fill → dispose cycles without error', () => {
    withFakeTimers(() => {
      for (let cycle = 0; cycle < 1_000; cycle++) {
        const r = new ResourceRegistry(`cycle-${cycle}`);
        r.trackContainer(fakeContainer());
        r.trackUpdater(fakeUpdater());
        r.trackDom(fakeDom());
        r.trackAsync(fakeAsync());
        r.trackTimer(cycle + 1);
        r.trackTween(fakeTween());
        const { target, event, handler, opts } = fakeListener();
        r.trackListener(target, event, handler, opts);
        r.dispose();
      }
      // If we reach here, no exception was thrown in any cycle
      assert.ok(true, '1,000 cycles completed without error');
    });
  });

  it('stress: disposal ordering correctness under volume (100 of each callback type)', () => {
    withFakeTimers(() => {
      const COUNT = 100;
      const r     = new ResourceRegistry('ordering-volume');
      const log   = [];

      for (let i = 0; i < COUNT; i++)
        r.trackAsync({ abort: () => log.push(['async', i]) });

      for (let i = 0; i < COUNT; i++) {
        const id = i + 1;
        r.trackTimer(id);
      }

      for (let i = 0; i < COUNT; i++)
        r.trackTween({ cancel: () => log.push(['tween', i]) });

      for (let i = 0; i < COUNT; i++)
        r.trackListener({ removeEventListener: () => log.push(['listener', i]) }, 'e', () => {}, false);

      for (let i = 0; i < COUNT; i++)
        r.trackDom({ remove: () => log.push(['dom', i]) });

      for (let i = 0; i < COUNT; i++)
        r.trackContainer({ destroy: () => log.push(['container', i]) });

      // Patch clearTimeout to log (timers don't have callbacks, so log per id)
      const _origClearTimeout  = globalThis.clearTimeout;
      const _origClearInterval = globalThis.clearInterval;
      globalThis.clearTimeout  = (id) => log.push(['timer', id - 1]);
      globalThis.clearInterval = () => {};
      try {
        r.dispose();
      } finally {
        globalThis.clearTimeout  = _origClearTimeout;
        globalThis.clearInterval = _origClearInterval;
      }

      // All 600 callbacks (100 × 6 observable callback types) should have fired.
      // (updaters are cleared silently — not counted)
      assert.strictEqual(log.length, COUNT * 6, `expected ${COUNT * 6} callback invocations, got ${log.length}`);

      // Type-level ordering: all entries of type A must precede first entry of type B
      const types = ['async', 'timer', 'tween', 'listener', 'dom', 'container'];
      const sections = {};
      for (const type of types) {
        sections[type] = log.filter(([t]) => t === type);
      }
      for (const type of types) {
        assert.strictEqual(sections[type].length, COUNT, `expected ${COUNT} entries of type "${type}"`);
      }

      // Verify ordering: all entries of earlier type precede first entry of later type
      for (let ti = 0; ti < types.length - 1; ti++) {
        const earlyType = types[ti];
        const lateType  = types[ti + 1];
        const lastEarlyIdx = log.lastIndexOf(sections[earlyType][sections[earlyType].length - 1]);
        const firstLateIdx = log.indexOf(sections[lateType][0]);
        assert.ok(lastEarlyIdx < firstLateIdx,
          `All "${earlyType}" entries must precede all "${lateType}" entries`);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Category 3: Re-entrancy stress
  // ---------------------------------------------------------------------------

  it('reentry: destroy callbacks that delete random other items — no callback silently skipped', () => {
    // Each container's destroy callback has a 50% chance of deleting a random
    // sibling from the containers Set. Because dispose() snapshots with Array.from()
    // before iterating, every item in the snapshot must be called regardless.
    const rand = makeRng(0xBEEF_CAFE);

    for (let trial = 0; trial < 20; trial++) {
      const r       = new ResourceRegistry(`reentry-delete-${trial}`);
      const N       = 20 + Math.floor(rand() * 30); // 20..49 containers
      const fired   = [];
      const handles = [];

      for (let i = 0; i < N; i++) {
        const idx = i;
        const c = {
          destroy: () => {
            fired.push(idx);
            // 50% chance: pick a random other container and remove it from the Set
            if (rand() < 0.5 && handles.length > 0) {
              const victim = handles[Math.floor(rand() * handles.length)];
              r.containers.delete(victim);
            }
          },
        };
        handles.push(c);
        r.trackContainer(c);
      }

      r.dispose();

      // Every callback in the original snapshot must have fired exactly once
      assert.strictEqual(fired.length, N,
        `trial=${trial}: expected ${N} destroy callbacks, got ${fired.length} — some were silently skipped`);
    }
  });

  it('reentry: recursive dispose() from inside a destroy callback completes outer iteration', () => {
    const r       = new ResourceRegistry('reentry-recursive-dispose');
    const fired   = [];
    const N       = 10;

    // One container triggers a recursive dispose; all others just log
    for (let i = 0; i < N; i++) {
      const idx = i;
      if (i === 3) {
        r.trackContainer({
          destroy: () => {
            fired.push(`recursive-trigger-${idx}`);
            // Recursive dispose — outer dispose should still complete its snapshot
            r.dispose();
          },
        });
      } else {
        r.trackContainer({ destroy: () => fired.push(idx) });
      }
    }

    r.dispose();

    // The outer dispose snapshotted all N containers before iterating,
    // so all N destroy callbacks should have been called.
    assert.strictEqual(fired.length, N,
      `expected ${N} destroy callbacks, got ${fired.length}`);
    assert.strictEqual(r.disposed, true);
    assert.strictEqual(r.size(), 0);
  });

  it('reentry: track*() from inside a destroy callback is caught and disposal continues', () => {
    const r     = new ResourceRegistry('reentry-track-in-destroy');
    const fired = [];

    // Container that tries to track a new resource during its own destroy
    r.trackContainer({
      destroy: () => {
        fired.push('first');
        // This should throw (disposed guard), but dispose() wraps in try/catch
        r.trackContainer({ destroy: () => fired.push('late-tracked') });
      },
    });
    r.trackContainer({ destroy: () => fired.push('second') });

    // dispose() should not propagate the "already disposed" throw
    assert.doesNotThrow(() => r.dispose(), 'dispose should not throw even when a callback tries to track');

    // The late-track attempt threw and was caught; only the original two fired
    assert.deepStrictEqual(fired.sort(), ['first', 'second'],
      'Both original callbacks must fire; the late-track error must be swallowed');
    assert.strictEqual(r.disposed, true);
    assert.strictEqual(r.size(), 0);
  });
});
