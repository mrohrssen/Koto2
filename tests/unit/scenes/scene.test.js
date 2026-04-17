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
    const fakeApp = makeFakeApp();
    let order = [];
    class Sub extends Scene {
      constructor() { super('T', fakeApp); }
      beforeExit() { order.push('before'); }
    }
    const s = new Sub();
    s.addUpdater(() => order.push('update-fn'));
    // monkey-patch registry.dispose to record order
    const origDispose = s.registry.dispose.bind(s.registry);
    s.registry.dispose = () => { order.push('dispose'); origDispose(); };
    s.exit();
    assert.deepStrictEqual(order, ['before', 'dispose']);
  });

  it('SceneDisposedError message includes scene name and method', () => {
    const s = new Scene('Battle', makeFakeApp());
    s.exit();
    try {
      s.addUpdater(() => {});
      assert.fail('expected throw');
    } catch (e) {
      assert.ok(e instanceof SceneDisposedError);
      assert.match(e.message, /Battle/);
      assert.match(e.message, /addUpdater/);
    }
  });

  it('addContainer does not double-track a child of a tracked parent', () => {
    const s = new Scene('T', makeFakeApp());
    const parent = { destroy: () => {}, addChild: () => {}, children: [] };
    const child = { destroy: () => {}, addChild: () => {}, children: [] };
    const trackedParent = s.addContainer(parent);
    s.addContainer(child, trackedParent);
    // Only the parent should be tracked; child is owned by parent's destroy cascade
    assert.strictEqual(s.registry.containers.size, 1);
    assert.ok(s.registry.containers.has(parent));
    assert.ok(!s.registry.containers.has(child));
  });

  it('addContainer tracks a child whose parent is NOT tracked (e.g. app.stage)', () => {
    const s = new Scene('T', makeFakeApp());
    const stage = { addChild: () => {}, children: [] }; // not tracked
    const root = { destroy: () => {}, addChild: () => {}, children: [] };
    s.addContainer(root, stage);
    assert.strictEqual(s.registry.containers.size, 1);
    assert.ok(s.registry.containers.has(root));
  });

  it('enter() throws if called twice', async () => {
    const s = new Scene('T', makeFakeApp());
    await s.enter();
    await assert.rejects(() => s.enter(), /already called/);
  });

  it('subclass onEnter is awaited by base enter()', async () => {
    const fakeApp = makeFakeApp();
    let opts;
    class Sub extends Scene {
      constructor() { super('Sub', fakeApp); }
      async onEnter(o) { await new Promise(r => setTimeout(r, 1)); opts = o; }
    }
    const s = new Sub();
    await s.enter({ x: 42 });
    assert.deepStrictEqual(opts, { x: 42 });
  });

  it('update(dt) continues running other updaters even if one throws', () => {
    const s = new Scene('T', makeFakeApp());
    const calls = [];
    s.addUpdater(() => calls.push('a'));
    s.addUpdater(() => { calls.push('b'); throw new Error('boom'); });
    s.addUpdater(() => calls.push('c'));
    // Suppress expected console.error during this test
    const origErr = console.error;
    console.error = () => {};
    try { s.update(1); } finally { console.error = origErr; }
    assert.deepStrictEqual(calls, ['a', 'b', 'c']);
  });
});
