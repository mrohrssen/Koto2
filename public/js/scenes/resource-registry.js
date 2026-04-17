// ResourceRegistry: tracks every disposable resource owned by a Scene.
// Disposal runs in a fixed order to avoid race conditions.

export class ResourceRegistry {
  constructor() {
    this.containers = new Set();
    this.updaters = new Set();
    this.domNodes = new Set();
    this.listeners = [];
    this.timers = new Set();
    this.tweens = new Set();
    this.pendingAsync = new Set();
    this.disposed = false;
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
    if (this.disposed) throw new Error('ResourceRegistry: registry already disposed');
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

  untrackTimer(id)  { this.timers.delete(id); }
  untrackTween(h)   { this.tweens.delete(h); }
  untrackUpdater(f) { this.updaters.delete(f); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    for (const c of this.pendingAsync) { try { c.abort(); } catch {} }
    this.pendingAsync.clear();

    for (const id of this.timers) { try { clearTimeout(id); } catch {} }
    this.timers.clear();

    this.updaters.clear();

    for (const t of this.tweens) { try { t.cancel(); } catch {} }
    this.tweens.clear();

    for (const { target, event, handler, options } of this.listeners) {
      try { target.removeEventListener(event, handler, options); } catch {}
    }
    this.listeners.length = 0;

    for (const node of this.domNodes) { try { node.remove(); } catch {} }
    this.domNodes.clear();

    for (const c of this.containers) {
      try { c.destroy({ children: true }); } catch {}
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
