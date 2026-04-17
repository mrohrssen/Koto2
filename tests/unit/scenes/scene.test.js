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

  it('update(dt, deltaMS) passes both values to updaters', () => {
    const s = new Scene('T', makeFakeApp());
    let dtSeen, msSeen;
    s.addUpdater((dt, ms) => { dtSeen = dt; msSeen = ms; });
    s.update(2.0, 33.3);
    assert.strictEqual(dtSeen, 2.0);
    assert.strictEqual(msSeen, 33.3);
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

  it('exit() in beforeExit() does not stack-overflow (Attack 9b)', () => {
    const fakeApp = makeFakeApp();
    let beforeExitCalls = 0;
    class Sub extends Scene {
      constructor() { super('Sub', fakeApp); }
      beforeExit() {
        beforeExitCalls++;
        if (beforeExitCalls < 5) this.exit(); // would overflow without fix
      }
    }
    const s = new Sub();
    // Should complete without throwing, even though beforeExit recurses
    s.exit();
    assert.strictEqual(s.disposed, true);
    assert.strictEqual(beforeExitCalls, 1, 'beforeExit should run exactly once');
  });

  it('beforeExit returning a Promise logs a warning (Attack 9)', () => {
    const fakeApp = makeFakeApp();
    let warned = false;
    const origErr = console.error;
    console.error = (msg) => { if (typeof msg === 'string' && msg.includes('must be synchronous')) warned = true; };
    class Sub extends Scene {
      constructor() { super('Sub', fakeApp); }
      beforeExit() { return Promise.resolve(); } // async return — should warn
    }
    try {
      const s = new Sub();
      s.exit();
    } finally { console.error = origErr; }
    assert.strictEqual(warned, true, 'expected warning about async beforeExit');
  });

  it('addListener does not leak side effect if registry tracking fails (Attack 15)', () => {
    const s = new Scene('T', makeFakeApp());
    let addedListener = null;
    let removedListener = null;
    const target = {
      addEventListener: (e, h, o) => { addedListener = h; throw new Error('side-effect failed'); },
      removeEventListener: (e, h, o) => { removedListener = h; },
    };
    const handler = () => {};
    assert.throws(() => s.addListener(target, 'click', handler), /side-effect failed/);
    // Listener was attempted but threw; registry should NOT contain it
    assert.strictEqual(s.registry.listeners.length, 0);
  });

  it('addContainer survives reparenting after tracking (Attack 4)', () => {
    const fakeApp = makeFakeApp();
    const s = new Scene('T', fakeApp);
    let parentDestroys = 0;
    let childDestroys = 0;
    // Mock PIXI containers with .parent property (set by addChild)
    const child = { parent: null, children: [], destroy() { childDestroys++; }, addChild() {} };
    const parent = {
      parent: null, children: [],
      destroy({ children }) { parentDestroys++; if (children) for (const c of this.children) c.destroy(); },
      addChild(c) { this.children.push(c); c.parent = this; },
    };
    s.addContainer(child);  // child tracked
    s.addContainer(parent); // parent tracked
    parent.addChild(child); // manual reparent — child now under parent in PIXI tree
    s.exit();
    // With the fix: parent.destroy({children:true}) destroys child once (cascade);
    // registry walks child's parent chain, sees parent is tracked, skips its own destroy.
    assert.strictEqual(parentDestroys, 1, 'parent destroyed once');
    assert.strictEqual(childDestroys, 1, 'child destroyed exactly once (via parent cascade)');
  });
});
