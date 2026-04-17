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
    globalThis.clearTimeout = (id) => cleared.push(id);
    r.trackTimer(123);
    r.trackAsync({ abort: () => aborted.push('a') });
    r.trackUpdater(() => {});
    r.dispose();
    assert.deepStrictEqual(cleared, [123]);
    assert.deepStrictEqual(aborted, ['a']);
  });

  it('disposes in correct order: async, timers, updaters, tweens, listeners, dom, containers', () => {
    const r = new ResourceRegistry();
    const order = [];
    r.trackAsync({ abort: () => order.push('async') });
    r.trackTimer(1);
    globalThis.clearTimeout = () => order.push('timer');
    r.trackUpdater(() => order.push('updater-fn-NOT-called'));
    r.disposalLog = order;  // updaters just clear; we test the order via others
    r.trackTween({ cancel: () => order.push('tween') });
    r.trackListener({ removeEventListener: () => order.push('listener') }, 'x', () => {}, false);
    r.trackDom({ remove: () => order.push('dom') });
    r.trackContainer({ destroy: () => order.push('container') });
    r.dispose();
    assert.deepStrictEqual(order, ['async', 'timer', 'tween', 'listener', 'dom', 'container']);
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
});
