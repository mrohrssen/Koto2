// ResourceRegistry: tracks every disposable resource owned by a Scene.
// Disposal runs in a fixed order to avoid race conditions.

import { SceneDisposedError } from './scene-errors.js';

// Dev-mode leak detector: if a ResourceRegistry is GC'd without dispose(),
// every resource it owned was leaked. Log loudly so developers see it.
const _isDev = (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production')
  || (typeof globalThis !== 'undefined' && globalThis.__DEV__ !== false);

const _leakDetector = (typeof FinalizationRegistry !== 'undefined' && _isDev)
  ? new FinalizationRegistry((label) => {
      console.warn(`ResourceRegistry "${label}" was garbage-collected without dispose() — owned resources leaked.`);
    })
  : null;

export class ResourceRegistry {
  constructor(name = 'unnamed') {
    this.name = name;
    this.containers = new Set();
    this.updaters = new Set();
    this.domNodes = new Set();
    this.listeners = [];
    this.timers = new Set();
    this.tweens = new Set();
    this.pendingAsync = new Set();
    this.disposed = false;
    if (_leakDetector) _leakDetector.register(this, name, this);
  }

  size() {
    return this.containers.size
      + this.updaters.size
      + this.domNodes.size
      + this.listeners.length
      + this.timers.size
      + this.tweens.size
      + this.pendingAsync.size;
  }

  _guard() {
    if (this.disposed) throw new SceneDisposedError('ResourceRegistry: registry already disposed');
  }

  trackContainer(c)  { this._guard(); this.containers.add(c); return c; }
  trackUpdater(fn)   { this._guard(); this.updaters.add(fn); return fn; }
  trackDom(node)     { this._guard(); this.domNodes.add(node); return node; }
  trackListener(target, event, handler, options) {
    this._guard();
    this.listeners.push({ target, event, handler, options });
    return handler;
  }
  trackTimer(id)     { this._guard(); this.timers.add(id); return id; }
  trackTween(handle) { this._guard(); this.tweens.add(handle); return handle; }
  trackAsync(controller) { this._guard(); this.pendingAsync.add(controller); return controller; }

  untrackTimer(id)  { return this.timers.delete(id); }
  untrackTween(h)   { return this.tweens.delete(h); }
  untrackUpdater(f) { return this.updaters.delete(f); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (_leakDetector) _leakDetector.unregister(this);

    for (const c of Array.from(this.pendingAsync)) {
      try { c.abort(); } catch (e) { console.error('ResourceRegistry: async abort failed', e); }
    }
    this.pendingAsync.clear();

    for (const id of Array.from(this.timers)) {
      try { clearTimeout(id); clearInterval(id); } catch (e) { console.error('ResourceRegistry: timer clear failed', e); }
    }
    this.timers.clear();

    this.updaters.clear();

    for (const t of Array.from(this.tweens)) {
      try { t.cancel(); } catch (e) { console.error('ResourceRegistry: tween cancel failed', e); }
    }
    this.tweens.clear();

    for (const { target, event, handler, options } of [...this.listeners]) {
      try { target.removeEventListener(event, handler, options); } catch (e) { console.error('ResourceRegistry: listener removal failed', e); }
    }
    this.listeners.length = 0;

    for (const node of Array.from(this.domNodes)) {
      try { node.remove(); } catch (e) { console.error('ResourceRegistry: dom remove failed', e); }
    }
    this.domNodes.clear();

    const containersSnapshot = Array.from(this.containers);
    const containersSet = this.containers; // capture for has() lookup; still pre-clear
    for (const c of containersSnapshot) {
      // Skip if any ancestor in the PIXI parent chain is also tracked — that
      // ancestor's destroy({children: true}) cascade will handle this container.
      let cur = c.parent;
      let coveredByAncestor = false;
      while (cur) {
        if (containersSet.has(cur)) { coveredByAncestor = true; break; }
        cur = cur.parent;
      }
      if (coveredByAncestor) continue;
      try { c.destroy({ children: true }); } catch (e) { console.error('ResourceRegistry: container destroy failed', e); }
    }
    this.containers.clear();
  }

  assertEmpty() {
    const leaks = [];
    if (this.containers.size)   leaks.push(`containers: ${this.containers.size}`);
    if (this.updaters.size)     leaks.push(`updaters: ${this.updaters.size}`);
    if (this.domNodes.size)     leaks.push(`domNodes: ${this.domNodes.size}`);
    if (this.listeners.length)  leaks.push(`listeners: ${this.listeners.length}`);
    if (this.timers.size)       leaks.push(`timers: ${this.timers.size}`);
    if (this.tweens.size)       leaks.push(`tweens: ${this.tweens.size}`);
    if (this.pendingAsync.size) leaks.push(`pendingAsync: ${this.pendingAsync.size}`);
    if (leaks.length) throw new Error(`ResourceRegistry: leaks detected -> ${leaks.join(', ')}`);
  }
}
