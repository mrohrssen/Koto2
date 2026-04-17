import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// --- Stub pixi/app.js so tween.js sees a controllable ticker ----------------
//
// tween.js calls getApp() to get at app.ticker.add/remove. We build a fake app
// that exposes a manual "tick" driver: tests call ticker.tick(deltaMS) to
// advance time instead of waiting on a real ticker.

function makeTickerApp() {
  const listeners = new Set();
  const ticker = {
    add: (fn) => { listeners.add(fn); },
    remove: (fn) => { listeners.delete(fn); },
    tick(deltaMS) {
      // Snapshot because onTick may call remove() during iteration.
      for (const fn of [...listeners]) fn({ deltaMS });
    },
    get count() { return listeners.size; },
  };
  return { ticker, _listeners: listeners };
}

// One shared fake so both scene.js's _tween import and any direct tween.js
// import observe the same ticker. `fakeApp` is rebuilt per test by reseating
// the ticker on the shared object.
const sharedApp = { app: makeTickerApp(), layers: {} };

await mock.module('../../../public/js/pixi/app.js', {
  namedExports: {
    getApp: () => ({ app: sharedApp.app, layers: sharedApp.layers }),
  },
});

// Import after mocks are registered so the mocked getApp is picked up.
const { Scene } = await import('../../../public/js/scenes/scene.js');

function resetTicker() {
  sharedApp.app = makeTickerApp();
}

function makeFakeSceneApp() {
  // The Scene constructor stores this as scene.app, but Scene itself doesn't
  // read app.ticker — the ticker interactions happen via tween.js's getApp().
  // So this can be minimal.
  return { stage: {}, ticker: { add: () => {}, remove: () => {} } };
}


describe('Scene.tween', () => {
  it('completes the tween and resolves with target reaching the goal', async () => {
    resetTicker();
    const scene = new Scene('TweenTest', makeFakeSceneApp());
    const target = { x: 0 };

    const p = scene.tween(target, { x: 100 }, { duration: 50, ease: 'linear' });

    // Advance past the duration. With ease=linear, x === 100 at t=1.
    sharedApp.app.ticker.tick(50);
    await p;

    assert.strictEqual(target.x, 100, 'target.x reached goal');
    assert.strictEqual(sharedApp.app.ticker.count, 0, 'ticker listener removed');
    assert.strictEqual(scene.registry.tweens.size, 1, 'handle still tracked until scene.exit()');
    scene.exit();
  });

  it('cancels mid-flight when scene.exit() is called, and the promise still resolves', async () => {
    resetTicker();
    const scene = new Scene('TweenTest', makeFakeSceneApp());
    const target = { x: 0, alpha: 1 };

    const p = scene.tween(target, { x: 1000, alpha: 0 }, { duration: 1000, ease: 'linear' });

    // Advance partway — target should move a bit, but not reach the goal.
    sharedApp.app.ticker.tick(100);
    assert.ok(target.x > 0 && target.x < 1000, 'partial tween progress');

    // Exit the scene — should cancel the tween.
    scene.exit();

    // The ticker no longer has a listener (removed during cancellation check).
    // Drive another tick so the onTick's "if (signal.cancelled)" branch runs
    // if it's still registered; either way, the promise should resolve.
    // (After scene.exit(), registry.dispose() calls cancel() which flips signal.cancelled;
    // the next tick removes the listener and resolves.)
    // If the listener was already removed synchronously, there's nothing to drive —
    // the pending resolve will fire from whichever branch triggered it. Await the promise.
    sharedApp.app.ticker.tick(10);
    await p; // should not hang

    // Target values are partial — not the goal.
    assert.ok(target.x < 1000, 'target.x did not reach goal');
    assert.ok(target.alpha > 0, 'target.alpha did not reach goal');
  });

  it('cancelled tween does not continue mutating the target on subsequent ticks', async () => {
    resetTicker();
    const scene = new Scene('TweenTest', makeFakeSceneApp());
    const target = { x: 0 };

    const p = scene.tween(target, { x: 100 }, { duration: 200, ease: 'linear' });

    // Advance a little — target moves.
    sharedApp.app.ticker.tick(50);
    const xAfterFirstTick = target.x;
    assert.ok(xAfterFirstTick > 0 && xAfterFirstTick < 100, 'partial progress');

    // Cancel via scene.exit() (triggers handle.cancel() → signal.cancelled = true).
    scene.exit();

    // Drive one more tick — the onTick checks signal.cancelled first and bails
    // without mutating target. After this tick, the listener is also removed.
    sharedApp.app.ticker.tick(50);

    // Now await the resolved promise so we don't leave a dangling Promise.
    await p;

    // Drive yet more ticks to verify the listener really is removed.
    sharedApp.app.ticker.tick(100);
    sharedApp.app.ticker.tick(100);

    // target.x did not change after cancellation.
    assert.strictEqual(target.x, xAfterFirstTick, 'target.x did not mutate after cancel');
    assert.strictEqual(sharedApp.app.ticker.count, 0, 'ticker listener removed');
  });
});
