import { DEV } from './dev-flag.js';

export class SceneManager {
  constructor(app) {
    this.app = app;
    this.currentScene = null;
    this.transitioning = false;
    this._tickerFn = null;
    this._initialized = false;
    this._destroyed = false;
    this._parallax = null;
    this._transitionPromise = null;
  }

  /**
   * Long-lived hooks the manager needs to drive every frame.
   * Safe before or after init(); parallax takes effect on the next tick.
   */
  configure(options = {}) {
    if (options === null) {
      throw new Error('SceneManager.configure: options cannot be null; pass {} or omit the argument');
    }
    const { parallax } = options;
    this._parallax = parallax ?? null;
  }

  /**
   * Register the per-frame ticker callback. Safe to call after destroy()
   * to re-initialize — but note that destroy() is terminal for transitions,
   * so transition() will still refuse on a destroyed manager.
   */
  init() {
    if (this._initialized) return;
    if (!this.app?.ticker?.add || !this.app?.ticker?.remove) {
      throw new Error('SceneManager.init: app.ticker (with add+remove) is required');
    }
    this._tickerFn = (ticker) => {
      try {
        const dt = ticker?.deltaTime ?? ticker ?? 1;
        const deltaMS = ticker?.deltaMS ?? (typeof dt === 'number' ? dt * 16.6667 : 16.6667);
        if (this._parallax && typeof this._parallax.update === 'function') {
          try { this._parallax.update(dt, deltaMS); } catch (e) { console.error('SceneManager.init: parallax update threw:', e); }
        }
        if (this.currentScene && !this.transitioning && !this.currentScene.disposed) {
          try { this.currentScene.update(dt, deltaMS); } catch (e) { console.error('SceneManager.init: scene update threw:', e); }
        }
      } catch (e) {
        // Outer catch protects against a patched console.error that throws.
        // Swallow silently — re-throwing would crash the PIXI ticker loop.
      }
    };
    this.app.ticker.add(this._tickerFn);
    this._initialized = true; // Set AFTER ticker registration succeeds
  }

  async transition(NextSceneClass, opts) {
    if (this._destroyed) {
      const msg = 'SceneManager.transition: manager was destroyed';
      if (DEV) throw new Error(msg);
      console.warn(msg);
      return;
    }
    if (!this._initialized) {
      const msg = 'SceneManager.transition: manager not initialized — call init() first';
      if (DEV) throw new Error(msg);
      console.warn(msg);
      return;
    }
    if (this.transitioning) {
      const msg = 'SceneManager.transition: transition already in progress';
      if (DEV) throw new Error(msg);
      console.warn(msg);
      return;
    }
    this.transitioning = true;
    this._transitionPromise = (async () => {
      try {
        if (this.currentScene) {
          try { this.currentScene.exit(); } catch (e) { console.error('SceneManager.transition: currentScene.exit() threw:', e); }
          this.currentScene = null;
        }

        let next;
        try {
          next = new NextSceneClass(this.app);
        } catch (err) {
          const className = NextSceneClass?.name ?? 'unknown';
          throw new Error(`SceneManager.transition: failed to construct scene class '${className}': ${err.message}`);
        }

        try {
          await next.enter(opts);
          if (this._destroyed) {
            // Destroy was called during enter(); dispose the new scene and bail.
            try { next.exit(); } catch (e) { console.error('SceneManager.transition: cleanup after destroy-during-enter threw:', e); }
            return;
          }
          this.currentScene = next;
        } catch (err) {
          try { next.exit(); } catch (e) { console.error('SceneManager.transition: cleanup after failed enter() threw:', e); }
          throw err;
        }
      } finally {
        this.transitioning = false;
        this._transitionPromise = null;
      }
    })();

    return this._transitionPromise;
  }

  async waitForIdle() {
    const pending = this._transitionPromise;
    if (pending) await pending;
  }

  destroy() {
    this._destroyed = true; // Block any subsequent transition() from completing

    if (this.currentScene) {
      try { this.currentScene.exit(); } catch (e) { console.error('SceneManager.destroy: currentScene.exit() threw:', e); }
      this.currentScene = null;
    }
    if (this._tickerFn) {
      try { this.app.ticker.remove(this._tickerFn); } catch (e) { console.error('SceneManager.destroy: ticker.remove threw:', e); }
      this._tickerFn = null;
    }
    // Clear state flags unconditionally so a post-failure retry isn't blocked.
    this._initialized = false;
    this.transitioning = false;
    this._transitionPromise = null;
    this._parallax = null;
  }
}

// Singleton accessor — populated at app boot from public/game.js via setSceneManager
let _instance = null;
export function getSceneManager() {
  if (!_instance) throw new Error('SceneManager not yet initialized; call setSceneManager first');
  return _instance;
}
export function setSceneManager(mgr) {
  if (!mgr) throw new Error('setSceneManager: manager cannot be null/undefined');
  _instance = mgr;
}

export function isSceneManagerInitialized() {
  return _instance !== null;
}

export function clearSceneManager() {
  // Explicit escape hatch for tests that need to reset the singleton.
  _instance = null;
}
