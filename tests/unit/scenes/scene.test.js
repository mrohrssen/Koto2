import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Scene, SceneDisposedError } from '../../../public/js/scenes/scene.js';

function makeFakeApp() {
  const tickerListeners = new Set();
  return {
    ticker: {
      add: (fn) => tickerListeners.add(fn),
      remove: (fn) => tickerListeners.delete(fn),
      get count() { return tickerListeners.size; },
    },
    stage: { addChild: () => {}, removeChild: () => {} },
    _tickerListeners: tickerListeners,
  };
}

describe('Scene', () => {
  it('starts not disposed', () => {
    const s = new Scene('TestScene', makeFakeApp());
    assert.strictEqual(s.disposed, false);
    assert.strictEqual(s.name, 'TestScene');
  });

  it('addUpdater registers a function and returns a cancel handle', () => {
    const s = new Scene('T', makeFakeApp());
    const fn = () => {};
    const cancel = s.addUpdater(fn);
    assert.strictEqual(s.registry.updaters.size, 1);
    cancel();
    assert.strictEqual(s.registry.updaters.size, 0);
  });

  it('update(dt) calls all registered updaters', () => {
    const s = new Scene('T', makeFakeApp());
    let called = 0;
    s.addUpdater((dt) => { called += dt; });
    s.update(2.5);
    s.update(1.5);
    assert.strictEqual(called, 4);
  });

  it('exit() disposes the registry', () => {
    const s = new Scene('T', makeFakeApp());
    s.addUpdater(() => {});
    s.exit();
    assert.strictEqual(s.disposed, true);
    assert.strictEqual(s.registry.disposed, true);
  });

  it('throws SceneDisposedError when methods called after exit()', () => {
    const s = new Scene('T', makeFakeApp());
    s.exit();
    assert.throws(() => s.addUpdater(() => {}), SceneDisposedError);
    assert.throws(() => s.update(1), SceneDisposedError);
  });

  it('beforeExit hook is called before disposal', () => {
    const s = new Scene('T', makeFakeApp());
    let order = [];
    s.beforeExit = () => order.push('before');
    s.addUpdater(() => order.push('update-fn'));
    // monkey-patch registry.dispose to record order
    const origDispose = s.registry.dispose.bind(s.registry);
    s.registry.dispose = () => { order.push('dispose'); origDispose(); };
    s.exit();
    assert.deepStrictEqual(order, ['before', 'dispose']);
  });
});
