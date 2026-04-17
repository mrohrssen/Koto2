import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ResourceRegistry } from '../../../public/js/scenes/resource-registry.js';

describe('ResourceRegistry', () => {
  it('starts empty', () => {
    const r = new ResourceRegistry();
    assert.strictEqual(r.size(), 0);
    assert.strictEqual(r.disposed, false);
  });

  it('tracks containers and disposes them on dispose()', () => {
    const r = new ResourceRegistry();
    const destroyed = [];
    const fakeContainer = { destroy: (opts) => destroyed.push(opts) };
    r.trackContainer(fakeContainer);
    assert.strictEqual(r.size(), 1);
    r.dispose();
    assert.deepStrictEqual(destroyed, [{ children: true }]);
    assert.strictEqual(r.size(), 0);
  });

  it('removes event listeners on dispose()', () => {
    const r = new ResourceRegistry();
    let removed = null;
    const fakeTarget = { removeEventListener: (e, h, o) => { removed = { e, h, o }; } };
    const handler = () => {};
    r.trackListener(fakeTarget, 'click', handler, false);
    r.dispose();
    assert.deepStrictEqual(removed, { e: 'click', h: handler, o: false });
  });

  it('clears timers, aborts async, drops updaters', () => {
    const r = new ResourceRegistry();
    const cleared = [];
    const aborted = [];
    const _origClearTimeout = globalThis.clearTimeout;
    const _origClearInterval = globalThis.clearInterval;
    globalThis.clearTimeout = (id) => cleared.push(id);
    globalThis.clearInterval = () => {};
    try {
      r.trackTimer(123);
      r.trackAsync({ abort: () => aborted.push('a') });
      r.trackUpdater(() => {});
      r.dispose();
      assert.deepStrictEqual(cleared, [123]);
      assert.deepStrictEqual(aborted, ['a']);
    } finally {
      globalThis.clearTimeout = _origClearTimeout;
      globalThis.clearInterval = _origClearInterval;
    }
  });

  it('disposes in correct order: async, timers, updaters, tweens, listeners, dom, containers', () => {
    const r = new ResourceRegistry();
    const order = [];
    const _origClearTimeout = globalThis.clearTimeout;
    const _origClearInterval = globalThis.clearInterval;
    globalThis.clearTimeout = () => order.push('timer');
    globalThis.clearInterval = () => {};
    try {
      r.trackAsync({ abort: () => order.push('async') });
      r.trackTimer(1);
      r.trackUpdater(() => order.push('updater-fn-NOT-called'));
      r.disposalLog = order;  // updaters just clear; we test the order via others
      r.trackTween({ cancel: () => order.push('tween') });
      r.trackListener({ removeEventListener: () => order.push('listener') }, 'x', () => {}, false);
      r.trackDom({ remove: () => order.push('dom') });
      r.trackContainer({ destroy: () => order.push('container') });
      r.dispose();
      assert.deepStrictEqual(order, ['async', 'timer', 'tween', 'listener', 'dom', 'container']);
    } finally {
      globalThis.clearTimeout = _origClearTimeout;
      globalThis.clearInterval = _origClearInterval;
    }
  });

  it('throws on track* after dispose() in dev', () => {
    const r = new ResourceRegistry();
    r.dispose();
    assert.throws(() => r.trackContainer({}), /disposed/);
    assert.throws(() => r.trackUpdater(() => {}), /disposed/);
  });

  it('assertEmpty() throws if any set is non-empty', () => {
    const r = new ResourceRegistry();
    r.trackContainer({ destroy: () => {} });
    assert.throws(() => r.assertEmpty(), /containers/);
  });

  it('assertEmpty() passes after dispose()', () => {
    const r = new ResourceRegistry();
    r.trackContainer({ destroy: () => {} });
    r.dispose();
    assert.doesNotThrow(() => r.assertEmpty());
  });

  it('untrackTimer prevents the timer from being cleared on dispose', () => {
    const r = new ResourceRegistry();
    const cleared = [];
    const _orig = globalThis.clearTimeout;
    const _origI = globalThis.clearInterval;
    globalThis.clearTimeout = (id) => cleared.push(id);
    globalThis.clearInterval = () => {};
    try {
      r.trackTimer(99);
      r.untrackTimer(99);
      r.dispose();
      assert.deepStrictEqual(cleared, []);
    } finally {
      globalThis.clearTimeout = _orig;
      globalThis.clearInterval = _origI;
    }
  });

  it('untrackTween prevents the tween from being cancelled on dispose', () => {
    const r = new ResourceRegistry();
    let cancelled = false;
    const handle = { cancel: () => { cancelled = true; } };
    r.trackTween(handle);
    r.untrackTween(handle);
    r.dispose();
    assert.strictEqual(cancelled, false);
  });

  it('untrackUpdater removes an updater from the registry', () => {
    const r = new ResourceRegistry();
    const fn = () => {};
    r.trackUpdater(fn);
    assert.strictEqual(r.updaters.size, 1);
    r.untrackUpdater(fn);
    assert.strictEqual(r.updaters.size, 0);
  });

  it('disposes siblings even if a destroy callback mutates the set', () => {
    const r = new ResourceRegistry('snapshot-test');
    const destroyed = [];
    // First container's destroy callback removes the second from the set.
    // Without snapshotting, the second would be silently skipped.
    const second = { destroy: () => destroyed.push('second') };
    const first = { destroy: () => { destroyed.push('first'); r.containers.delete(second); } };
    r.trackContainer(first);
    r.trackContainer(second);
    r.dispose();
    assert.deepStrictEqual(destroyed.sort(), ['first', 'second']);
  });

  it('untrackTimer returns true when the id was tracked, false otherwise', () => {
    const r = new ResourceRegistry();
    r.trackTimer(42);
    assert.strictEqual(r.untrackTimer(42), true);
    assert.strictEqual(r.untrackTimer(42), false);
  });

  it('untrackTween returns true/false depending on presence', () => {
    const r = new ResourceRegistry();
    const handle = { cancel: () => {} };
    r.trackTween(handle);
    assert.strictEqual(r.untrackTween(handle), true);
    assert.strictEqual(r.untrackTween(handle), false);
  });

  it('untrackUpdater returns true/false depending on presence', () => {
    const r = new ResourceRegistry();
    const fn = () => {};
    r.trackUpdater(fn);
    assert.strictEqual(r.untrackUpdater(fn), true);
    assert.strictEqual(r.untrackUpdater(fn), false);
  });

  it('accepts an optional name in the constructor and exposes it', () => {
    const r = new ResourceRegistry('my-scene');
    assert.strictEqual(r.name, 'my-scene');
  });

  it('_guard throws SceneDisposedError-named error after dispose', () => {
    const r = new ResourceRegistry();
    r.dispose();
    try { r.trackContainer({}); assert.fail('expected throw'); }
    catch (e) {
      assert.strictEqual(e.name, 'SceneDisposedError');
      assert.match(e.message, /disposed/);
    }
  });

  it('skips destroying a container whose ancestor is also tracked', () => {
    const r = new ResourceRegistry();
    let outerDestroys = 0;
    let innerDestroys = 0;
    const inner = { parent: null, children: [], destroy() { innerDestroys++; } };
    const outer = {
      parent: null, children: [inner],
      destroy({ children }) { outerDestroys++; if (children) for (const c of this.children) c.destroy(); },
    };
    inner.parent = outer;
    r.trackContainer(outer);
    r.trackContainer(inner); // tracked, but its ancestor outer is also tracked
    r.dispose();
    assert.strictEqual(outerDestroys, 1);
    assert.strictEqual(innerDestroys, 1, 'inner destroyed exactly once via outer cascade');
  });
});
