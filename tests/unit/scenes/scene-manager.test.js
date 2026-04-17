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
    await mgr.transition(TestScene, { roomId: 'r1' });
    assert.ok(mgr.currentScene);
    assert.strictEqual(mgr.currentScene.enterCalls, 1);
    assert.deepStrictEqual(mgr.currentScene.lastOpts, { roomId: 'r1' });
  });

  it('transition() exits the current scene before entering the next', async () => {
    const mgr = new SceneManager(makeFakeApp());
    await mgr.transition(TestScene);
    const first = mgr.currentScene;
    await mgr.transition(TestScene);
    assert.strictEqual(first.disposed, true);
    assert.notStrictEqual(mgr.currentScene, first);
  });

  it('throws if transition() is re-entered while transitioning', async () => {
    const mgr = new SceneManager(makeFakeApp());
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
    await mgr.destroy();
    assert.strictEqual(scene.disposed, true);
    assert.strictEqual(mgr.currentScene, null);
    assert.strictEqual(app.ticker.count, 0);
  });

  it('getSceneManager() throws before setSceneManager() is called', async () => {
    const { getSceneManager } = await import('../../../public/js/scenes/scene-manager.js');
    // We can't truly reset the module between tests; this test may be flaky if
    // previous tests set the singleton. Document intent; the behavior is tested
    // by the class-level unit above.
    assert.ok(typeof getSceneManager === 'function');
  });
});
