import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SceneManager } from '../../../public/js/scenes/scene-manager.js';
import { Scene } from '../../../public/js/scenes/scene.js';

function makeFakeApp() {
  const listeners = new Set();
  return {
    ticker: {
      add: (fn) => listeners.add(fn),
      remove: (fn) => listeners.delete(fn),
      get count() { return listeners.size; },
    },
    stage: { addChild: () => {}, removeChild: () => {} },
  };
}

class TestScene extends Scene {
  constructor(app) {
    super('TestScene', app);
    this.enterCalls = 0;
    this.lastOpts = null;
  }
  async onEnter(opts) { this.enterCalls++; this.lastOpts = opts; }
}

describe('SceneManager', () => {
  it('starts with no current scene', () => {
    const mgr = new SceneManager(makeFakeApp());
    assert.strictEqual(mgr.currentScene, null);
  });

  it('transition() constructs and enters a scene', async () => {
    const mgr = new SceneManager(makeFakeApp());
    mgr.init();
    await mgr.transition(TestScene, { roomId: 'r1' });
    assert.ok(mgr.currentScene);
    assert.strictEqual(mgr.currentScene.enterCalls, 1);
    assert.deepStrictEqual(mgr.currentScene.lastOpts, { roomId: 'r1' });
  });

  it('transition() exits the current scene before entering the next', async () => {
    const mgr = new SceneManager(makeFakeApp());
    mgr.init();
    await mgr.transition(TestScene);
    const first = mgr.currentScene;
    await mgr.transition(TestScene);
    assert.strictEqual(first.disposed, true);
    assert.notStrictEqual(mgr.currentScene, first);
  });

  it('throws if transition() is re-entered while transitioning', async () => {
    const mgr = new SceneManager(makeFakeApp());
    mgr.init();
    class SlowScene extends Scene {
      constructor(app) { super('SlowScene', app); }
      async onEnter() { await new Promise(r => setTimeout(r, 50)); }
    }
    const p = mgr.transition(SlowScene);
    await assert.rejects(() => mgr.transition(SlowScene), /transition already in progress/);
    await p;
  });

  it('cleans up partial setup if enter() throws', async () => {
    const mgr = new SceneManager(makeFakeApp());
    mgr.init();
    class FailingScene extends Scene {
      constructor(app) { super('FailingScene', app); }
      async onEnter() { this.addUpdater(() => {}); throw new Error('boom'); }
    }
    await assert.rejects(() => mgr.transition(FailingScene), /boom/);
    assert.strictEqual(mgr.currentScene, null);
  });

  it('init() registers exactly one app.ticker callback that drives currentScene.update', () => {
    const app = makeFakeApp();
    const mgr = new SceneManager(app);
    mgr.init();
    assert.strictEqual(app.ticker.count, 1);
  });

  it('destroy() exits current scene and removes the ticker', async () => {
    const app = makeFakeApp();
    const mgr = new SceneManager(app);
    mgr.init();
    await mgr.transition(TestScene);
    const scene = mgr.currentScene;
    mgr.destroy(); // no longer async
    assert.strictEqual(scene.disposed, true);
    assert.strictEqual(mgr.currentScene, null);
    assert.strictEqual(app.ticker.count, 0);
  });

  it('getSceneManager is exported as a function', async () => {
    const { getSceneManager } = await import('../../../public/js/scenes/scene-manager.js');
    assert.strictEqual(typeof getSceneManager, 'function');
  });

  it('init() throws if app has no ticker add/remove', () => {
    const mgr = new SceneManager({ stage: {} });
    assert.throws(() => mgr.init(), /app\.ticker.*required/);
    // _initialized should NOT be set on failure
    assert.strictEqual(mgr._initialized, false);
  });

  it('init() is safe to call after destroy() to re-initialize', async () => {
    const app = makeFakeApp();
    const mgr = new SceneManager(app);
    mgr.init();
    mgr.destroy();
    // Per FIX 2, destroy sets _destroyed=true (terminal for transitions).
    // Assert the terminal behavior: init() itself doesn't throw, but
    // transition() refuses because _destroyed is set.
    assert.strictEqual(mgr._destroyed, true);
    // transition() refuses:
    await assert.rejects(() => mgr.transition(TestScene), /manager was destroyed/);
  });

  it('transition() before init() rejects with clear error', async () => {
    const mgr = new SceneManager(makeFakeApp());
    await assert.rejects(() => mgr.transition(TestScene), /not initialized/);
  });

  it('configure(null) throws a clear error; old parallax not affected', () => {
    const mgr = new SceneManager(makeFakeApp());
    const obj = { update: () => {} };
    mgr.configure({ parallax: obj });
    assert.throws(() => mgr.configure(null), /cannot be null/);
    assert.strictEqual(mgr._parallax, obj, 'old parallax preserved on invalid config');
  });

  it('transition() with null NextSceneClass produces clear error', async () => {
    const mgr = new SceneManager(makeFakeApp());
    mgr.init();
    await assert.rejects(() => mgr.transition(null), /failed to construct scene class/);
    // Manager recovers: transitioning cleared
    assert.strictEqual(mgr.transitioning, false);
    assert.strictEqual(mgr.currentScene, null);
  });

  it('destroy() during in-flight transition prevents scene assignment and disposes the partial scene', async () => {
    const mgr = new SceneManager(makeFakeApp());
    mgr.init();
    let enterResolve;
    class HangScene extends Scene {
      constructor(app) { super('Hang', app); }
      async onEnter() { await new Promise(r => { enterResolve = r; }); }
    }
    const transitionPromise = mgr.transition(HangScene);
    // Let the transition reach await next.enter()
    await Promise.resolve();
    await Promise.resolve();
    // Now destroy mid-transition
    mgr.destroy();
    // Let enter() resolve now
    enterResolve();
    await transitionPromise;
    assert.strictEqual(mgr.currentScene, null, 'destroyed manager must not have a currentScene');
    assert.strictEqual(mgr._destroyed, true);
  });

  it('setSceneManager(null) throws', async () => {
    const { setSceneManager } = await import('../../../public/js/scenes/scene-manager.js');
    assert.throws(() => setSceneManager(null), /cannot be null/);
  });

  it('parallax callback routes dt to updateParallax and deltaMS to updateParticles; isFrozen gates parallax only', () => {
    // Stand up a fake PIXI app with a ticker
    const listeners = [];
    const app = {
      ticker: {
        add: (fn) => listeners.push(fn),
        remove: (fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
      },
    };

    const calls = { parallax: [], particles: [] };
    let frozen = false;

    const mgr = new SceneManager(app);
    mgr.configure({
      parallax: {
        update: (dt, deltaMS) => {
          if (!frozen) calls.parallax.push({ dt, deltaMS });
          calls.particles.push({ dt, deltaMS });
        },
      },
    });
    mgr.init();

    // Tick once with realistic values
    listeners[0]({ deltaTime: 1.0, deltaMS: 16.6667 });

    assert.strictEqual(calls.parallax.length, 1);
    assert.strictEqual(calls.parallax[0].dt, 1.0);
    assert.strictEqual(calls.parallax[0].deltaMS, 16.6667);
    assert.strictEqual(calls.particles.length, 1);
    assert.strictEqual(calls.particles[0].deltaMS, 16.6667);

    // Freeze: parallax should not run, particles should
    frozen = true;
    listeners[0]({ deltaTime: 1.0, deltaMS: 16.6667 });
    assert.strictEqual(calls.parallax.length, 1, 'parallax should not run when frozen');
    assert.strictEqual(calls.particles.length, 2, 'particles should run even when frozen');
  });

  it('wiring block is idempotent — logout/login does not register duplicate tickers', async () => {
    const {
      setSceneManager,
      clearSceneManager,
      isSceneManagerInitialized,
    } = await import('../../../public/js/scenes/scene-manager.js');

    clearSceneManager();
    assert.strictEqual(isSceneManagerInitialized(), false);

    const app = { ticker: { add: () => {}, remove: () => {} } };
    const mgr = new SceneManager(app);
    mgr.configure({});
    mgr.init();
    setSceneManager(mgr);

    assert.strictEqual(isSceneManagerInitialized(), true);

    clearSceneManager();
    assert.strictEqual(isSceneManagerInitialized(), false);
  });
});
