import { DEV } from './dev-flag.js';

export class SceneManager {
  constructor(app) {
    this.app = app;
    this.currentScene = null;
    this.transitioning = false;
    this._tickerFn = null;
    this._initialized = false;
    this._parallax = null;
  }

  /** Long-lived hooks the manager needs to drive every frame. */
  configure({ parallax } = {}) {
    this._parallax = parallax || null;
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this._tickerFn = (ticker) => {
      const dt = ticker?.deltaTime ?? ticker ?? 1;
      if (this._parallax && typeof this._parallax.update === 'function') {
        try { this._parallax.update(dt); } catch (e) { console.error('SceneManager: parallax update threw:', e); }
      }
      if (this.currentScene && !this.transitioning && !this.currentScene.disposed) {
        try { this.currentScene.update(dt); } catch (e) { console.error('SceneManager: scene update threw:', e); }
      }
    };
    this.app.ticker.add(this._tickerFn);
  }

  async transition(NextSceneClass, opts) {
    if (this.transitioning) {
      const msg = 'SceneManager.transition: transition already in progress';
      if (DEV) throw new Error(msg);
      console.warn(msg);
      return;
    }
    this.transitioning = true;

    try {
      if (this.currentScene) {
        try { this.currentScene.exit(); } catch (e) { console.error('SceneManager: currentScene.exit() threw:', e); }
        this.currentScene = null;
      }

      const next = new NextSceneClass(this.app);
      try {
        await next.enter(opts);
        this.currentScene = next;
      } catch (err) {
        try { next.exit(); } catch {}
        throw err;
      }
    } finally {
      this.transitioning = false;
    }
  }

  async destroy() {
    if (this.currentScene) {
      try { this.currentScene.exit(); } catch (e) { console.error('SceneManager.destroy: currentScene.exit() threw:', e); }
      this.currentScene = null;
    }
    if (this._tickerFn) {
      this.app.ticker.remove(this._tickerFn);
      this._tickerFn = null;
    }
    this._initialized = false;
  }
}

// Singleton accessor — populated at app boot from public/game.js via setSceneManager
let _instance = null;
export function getSceneManager() {
  if (!_instance) throw new Error('SceneManager not yet initialized; call setSceneManager first');
  return _instance;
}
export function setSceneManager(mgr) { _instance = mgr; }
