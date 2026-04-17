import { ResourceRegistry } from './resource-registry.js';
import { DEV } from './dev-flag.js';

export class SceneDisposedError extends Error {
  constructor(sceneName, method) {
    super(`Scene '${sceneName}': method '${method}' called after exit()`);
    this.name = 'SceneDisposedError';
  }
}

/**
 * Base class. A Scene owns the lifetime of one rendering setup
 * (one combat encounter, one room visit). Subclass for concrete behavior.
 */
export class Scene {
  constructor(name, app) {
    this.name = name;
    this.app = app;
    this.registry = new ResourceRegistry(name);
    this.disposed = false;
    // beforeExit is an optional subclass hook
    this.beforeExit = null;
  }

  _guard(method) {
    if (this.disposed) throw new SceneDisposedError(this.name, method);
  }

  // --- lifecycle ---
  // Subclasses override enter() and may use beforeExit for hook-style cleanup
  // before the registry tears down owned resources.
  async enter(_opts) { this._guard('enter'); }

  update(dt) {
    if (this.disposed) throw new SceneDisposedError(this.name, 'update');
    for (const fn of this.registry.updaters) fn(dt);
  }

  exit() {
    if (this.disposed) return;
    if (this.beforeExit) {
      try { this.beforeExit(); } catch (e) { console.error(`Scene[${this.name}] beforeExit threw:`, e); }
    }
    this.registry.dispose();
    this.disposed = true;
    if (DEV) this.registry.assertEmpty();
  }

  // --- resource registration helpers ---

  addContainer(container, parent) {
    this._guard('addContainer');
    if (parent) parent.addChild(container);
    return this.registry.trackContainer(container);
  }

  addUpdater(fn) {
    this._guard('addUpdater');
    this.registry.trackUpdater(fn);
    return () => this.registry.untrackUpdater(fn);
  }

  addListener(target, event, handler, options = false) {
    this._guard('addListener');
    target.addEventListener(event, handler, options);
    return this.registry.trackListener(target, event, handler, options);
  }

  setTimer(fn, ms) {
    this._guard('setTimer');
    let id;
    const wrapped = () => {
      this.registry.untrackTimer(id);
      try { fn(); } catch (e) { console.error(`Scene[${this.name}] timer threw:`, e); }
    };
    id = setTimeout(wrapped, ms);
    return this.registry.trackTimer(id);
  }

  addDom(node, parent) {
    this._guard('addDom');
    if (parent) parent.appendChild(node);
    return this.registry.trackDom(node);
  }

  addAsyncController() {
    this._guard('addAsyncController');
    const controller = new AbortController();
    return this.registry.trackAsync(controller);
  }
}
