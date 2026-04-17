import { ResourceRegistry } from './resource-registry.js';
import { DEV } from './dev-flag.js';
import { SceneDisposedError } from './scene-errors.js';

// Re-export so external code's import path ('./scene.js') keeps working.
export { SceneDisposedError } from './scene-errors.js';

/**
 * Base class. A Scene owns the lifetime of one rendering setup
 * (one combat encounter, one room visit). Subclass for concrete behavior.
 *
 * Lifecycle:
 *   1. new Scene(name, app) — allocate registry
 *   2. await scene.enter(opts) — base class sets entered=true, then calls subclass's onEnter
 *   3. scene.update(dt) — called every frame by SceneManager
 *   4. scene.exit() — subclass beforeExit hook runs, then registry disposes
 *
 * Subclass contract:
 *   - Override onEnter(opts) to perform setup work (load assets, spawn sprites).
 *   - Optionally override beforeExit() to run pre-disposal cleanup (e.g., stopping
 *     long-lived infrastructure the scene configured but doesn't own).
 *   - Use scene.addContainer/addUpdater/addListener/setTimer/addDom/addAsyncController to
 *     create resources — never call PIXI/DOM APIs directly outside these helpers, or
 *     the scene won't know about them and they'll leak.
 */
export class Scene {
  constructor(name, app) {
    this.name = name;
    this.app = app;
    this.registry = new ResourceRegistry(name);
    this.disposed = false;
    this._exiting = false;
    this.entered = false;
  }

  _guard(method) {
    if (this.disposed) throw new SceneDisposedError(`Scene '${this.name}': method '${method}' called after exit()`);
  }

  // --- lifecycle ---

  async enter(opts) {
    this._guard('enter');
    if (this.entered) {
      throw new Error(`Scene[${this.name}]: enter() already called`);
    }
    this.entered = true;
    if (this.onEnter) await this.onEnter(opts);
  }

  update(dt) {
    // Hot path — called every frame. Guard inlined to avoid call overhead.
    if (this.disposed) {
      if (DEV) throw new SceneDisposedError(`Scene '${this.name}': method 'update' called after exit()`);
      return; // production: silently ignore
    }
    for (const fn of this.registry.updaters) {
      try { fn(dt); } catch (e) {
        console.error(`Scene[${this.name}] updater threw:`, e);
      }
    }
  }

  /**
   * Subclass hook. Override to run cleanup BEFORE registry disposal — useful
   * for stopping long-lived infrastructure (e.g., parallax, audio loops) that
   * the scene configured but doesn't own. Errors thrown here are caught and logged.
   *
   * MUST be synchronous. If you return a promise, it will be detected and a
   * warning logged — async cleanup is not supported because exit() is sync.
   * Prefer scene-owned resources over async cleanup hooks.
   */
  beforeExit() {}

  exit() {
    if (this._exiting || this.disposed) return;
    // _exiting prevents reentry during beforeExit / dispose; disposed is the
    // post-completion flag that locks out method calls afterward.
    this._exiting = true;
    try {
      const result = this.beforeExit();
      if (result && typeof result.then === 'function') {
        console.error(`Scene[${this.name}] beforeExit must be synchronous; got a Promise. Async cleanup hooks are not supported — use scene-owned resources instead.`);
        result.catch(e => console.error(`Scene[${this.name}] beforeExit async threw:`, e));
      }
    } catch (e) { console.error(`Scene[${this.name}] beforeExit threw:`, e); }
    this.registry.dispose();
    this.disposed = true;
    this._exiting = false;
    if (DEV) this.registry.assertEmpty();
  }

  // --- resource registration helpers ---

  /**
   * Add a PIXI container to the scene's render tree, ensuring it gets destroyed
   * when the scene exits.
   *
   * @param {Container} container - The container to track.
   * @param {Container} [parent]  - Optional parent. If provided, container is
   *   added as a PIXI child of parent. If parent is itself tracked by this scene,
   *   container is NOT tracked separately (parent's destroy cascade handles it).
   *   If parent is untracked (e.g., app.stage), container IS tracked directly.
   * @returns {Container} the container, for chaining.
   */
  addContainer(container, parent) {
    this._guard('addContainer');
    if (parent) parent.addChild(container);
    // If parent is itself a tracked container, the parent's destroy({children: true})
    // will cascade to this child. Tracking it again would cause double-destroy.
    // Only track containers whose disposal isn't covered by a tracked ancestor.
    if (parent && this.registry.containers.has(parent)) {
      return container; // Owned by parent's cascade; not tracked separately.
    }
    return this.registry.trackContainer(container);
  }

  /**
   * Register a per-frame updater. The function is invoked by scene.update(dt)
   * every frame until the scene exits or the returned cancel handle is called.
   *
   * NOTE: Asymmetric return — unlike other addX methods that return the tracked
   * resource, addUpdater returns a cancel function. This is intentional because
   * updaters are the only resource frequently cancelled mid-scene (e.g., when
   * a status effect ends). Other helpers return the resource for chaining.
   *
   * @param {(dt: number) => void} fn
   * @returns {() => void} cancel function
   */
  addUpdater(fn) {
    this._guard('addUpdater');
    this.registry.trackUpdater(fn);
    return () => this.registry.untrackUpdater(fn);
  }

  addListener(target, event, handler, options = false) {
    this._guard('addListener');
    // Register first, side-effect second. If side-effect throws or causes
    // exit(), the registration was either queued or rolled back atomically.
    this.registry.trackListener(target, event, handler, options);
    try {
      target.addEventListener(event, handler, options);
    } catch (e) {
      // Roll back the registration. The listeners array stores objects in
      // insertion order; the one we just pushed is at the end.
      const last = this.registry.listeners[this.registry.listeners.length - 1];
      if (last && last.target === target && last.handler === handler) {
        this.registry.listeners.pop();
      }
      throw e;
    }
    return handler;
  }

  setTimer(fn, ms) {
    this._guard('setTimer');
    let id;
    const wrapped = () => {
      this.registry.untrackTimer(id);
      try { fn(); } catch (e) { console.error(`Scene[${this.name}] timer threw:`, e); }
    };
    // We cannot register before setTimeout runs because we don't yet have an id.
    // Mitigation: setTimeout's body cannot run synchronously, so the side effect
    // (scheduling) cannot invoke exit() before tracking happens.
    id = setTimeout(wrapped, ms);
    return this.registry.trackTimer(id);
  }

  addDom(node, parent) {
    this._guard('addDom');
    this.registry.trackDom(node);
    try {
      if (parent) parent.appendChild(node);
    } catch (e) {
      this.registry.domNodes.delete(node);
      throw e;
    }
    return node;
  }

  addAsyncController() {
    this._guard('addAsyncController');
    const controller = new AbortController();
    return this.registry.trackAsync(controller);
  }
}
