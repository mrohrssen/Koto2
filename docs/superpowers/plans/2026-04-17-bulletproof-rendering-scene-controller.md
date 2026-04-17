# Bulletproof Rendering Scene Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ad-hoc PixiJS+DOM rendering layer with a `Scene` / `SceneManager` pattern so per-encounter and per-room state is owned, tracked, and destroyed by a single mechanism — eliminating the recurring "elements left behind / appear late" bug class by construction.

**Architecture:** A `Scene` base class owns a `ResourceRegistry` of every PIXI sprite, container, ticker (called "updaters" in the new API), DOM element, listener, timer, tween, and async load it creates. `BattleScene` and `ExplorationScene` extend `Scene`. A `SceneManager` singleton holds exactly one active scene and atomically transitions between them — `currentScene.exit()` destroys all owned resources before `nextScene.enter()` begins. The PIXI `Application`, `ResizeObserver`, and parallax background remain long-lived; scenes configure them but never own them. Migration is big-bang in a worktree: new infrastructure files are built first without disrupting existing code, then a single "swap" task switches `combat-loop.js` and `exploration.js` to use `SceneManager`. Dev-mode invariants throw on violations of the ownership contract; production builds strip the assertions.

**Tech Stack:** PixiJS 8.x, vanilla ES modules, `node:test` (unit + integration), Playwright (smoke), Vite dev server, `crypto.randomUUID()` for instance IDs.

**Reference spec:** `docs/superpowers/specs/2026-04-17-bulletproof-rendering-scene-controller-design.md`

---

## File Map

### New files
- `public/js/scenes/resource-registry.js` — Tracks owned resources; one method per resource type; ordered disposal.
- `public/js/scenes/scene.js` — `Scene` base class: lifecycle (`enter`/`update`/`exit`), `disposed` guard, convenience methods (`addContainer`, `addUpdater`, `addListener`, `setTimer`, `tween`, `loadAsset`, `addDom`).
- `public/js/scenes/scene-manager.js` — Singleton holding `currentScene`; `transition()` + central `app.ticker` registration; dev-mode leak detector.
- `public/js/scenes/battle-scene.js` — `BattleScene extends Scene`; owns combat sprites, HP bars, status pills, status VFX, attack VFX, banners. Diffs creatures by `uid`.
- `public/js/scenes/exploration-scene.js` — `ExplorationScene extends Scene`; owns NPC sprite, room creature row, room-specific overlays.
- `public/js/scenes/dev-flag.js` — Build-time DEV constant; production builds replace with `false` so dev-only assertions tree-shake.
- `public/js/ui/combat-dom.js` — Renamed from `public/js/ui/scene.js`; DOM HP bars + formation slot helpers, now scene-aware.
- `public/js/ui/exploration-dom.js` — Extracted NPC display DOM helpers (currently in `ui/scene.js`).
- `public/js/ui/scenes-overlay.js` — Settings-toggled debug HUD showing scene name, registry counts, leak warnings.
- `tests/unit/scenes/resource-registry.test.js`
- `tests/unit/scenes/scene.test.js`
- `tests/unit/scenes/scene-manager.test.js`
- `tests/unit/scenes/uid-migration.test.js`
- `tests/integration/scenes/scene-transitions.test.js`

### Modified files
- `src/game/creatures.js` — `instantiateCreature()` assigns `uid`; lazy migration helper exported for save load.
- `src/game/state.js` — Lazy `uid` backfill on player party load (or wherever creature lists deserialize).
- `public/js/pixi/battle-stage.js` → renamed `public/js/pixi/app.js` — Drops main ticker registration (moves to `SceneManager`); keeps `Application`, `ResizeObserver`, layer container init.
- `public/js/pixi/formation.js` — Module-level state removed; functions take `(scene, ...)`; sprites/containers registered with scene.
- `public/js/pixi/status-vfx.js` — `ongoingVfx` Map removed; functions take `(scene, ...)`; `app.ticker.add()` calls become `scene.addUpdater()`.
- `public/js/pixi/element-blasts.js` — Functions take `scene`; tweens via `scene.tween()`.
- `public/js/pixi/text.js`, `public/js/pixi/banners.js` — Functions take parent container or scene; no module state.
- `public/js/pixi/effects.js` — Particle pool stays long-lived; in-flight particles returned to pool via scene exit hook.
- `public/js/pixi/parallax.js` — New `start(speed)` / `stop()` API; scenes call in `enter()`/`beforeExit()`.
- `public/js/ui/combat-loop.js` — `cleanupCombat()` becomes `sceneManager.transition(...)`; per-feature cleanup deleted.
- `public/js/ui/combat-vfx.js` — Sprite lookups via `sceneManager.currentScene.getSprite(uid)`; tweens via scene.
- `public/js/ui/exploration.js` — Calls `sceneManager.transition(ExplorationScene, ...)` on room entry; module-level `discoveryState` and `shrineInProgress` move to `ExplorationScene`.
- `public/js/ui/creature-row.js` — Document-level click listener registered via `scene.addListener(...)`.
- `public/game.js` — Init `SceneManager` after PIXI app boot; route initial scene transition.
- `public/js/ui/settings.js` (or wherever the settings menu lives) — Add "Show debug overlay" toggle wired to `scenes-overlay.js`.

### Untouched (do not modify)
`public/js/pixi/tween.js`, `public/js/ui/move-select.js`, `public/js/ui/whack-a-mole.js`, `public/js/ui/speed-review.js`, `public/js/ui/dom-effects.js`. Audio, vocab cache, settings other than the overlay toggle.

---

## Worktree Setup

### Task 0: Create worktree

**Files:** None (git operation only)

- [ ] **Step 1: Create the isolated worktree from `dev`**

```bash
PROJECT_ROOT=$(/usr/bin/git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"
/usr/bin/git fetch origin
/usr/bin/git worktree add ../koto-wt-bulletproof-render -b feature/bulletproof-rendering dev
cd ../koto-wt-bulletproof-render
npm install
```

Expected: new directory `../koto-wt-bulletproof-render` with branch `feature/bulletproof-rendering` checked out; `npm install` completes cleanly.

- [ ] **Step 2: Verify the working tree is clean and the dev server starts**

```bash
/usr/bin/git status
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: clean status; HTTP 200 from Vite.

- [ ] **Step 3: Stop the dev server**

```bash
pkill -f "vite" ; pkill -f "node --watch server.js"
```

- [ ] **Step 4: Commit a placeholder marking the worktree start**

No commit needed at this step — the next task is the first real change.

---

## Phase 1: Foundation

### Task 1: ResourceRegistry

**Files:**
- Create: `public/js/scenes/resource-registry.js`
- Create: `tests/unit/scenes/resource-registry.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/scenes/resource-registry.test.js`:

```javascript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test tests/unit/scenes/resource-registry.test.js
```

Expected: all tests FAIL (cannot find module).

- [ ] **Step 3: Implement `ResourceRegistry`**

Create `public/js/scenes/resource-registry.js`:

```javascript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test tests/unit/scenes/resource-registry.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/scenes/resource-registry.js tests/unit/scenes/resource-registry.test.js
git commit -m "feat(scenes): add ResourceRegistry with ordered disposal"
```

---

### Task 2: DEV flag module

**Files:**
- Create: `public/js/scenes/dev-flag.js`

- [ ] **Step 1: Create the DEV flag module**

Create `public/js/scenes/dev-flag.js`:

```javascript
// DEV flag — replaced at build time by Vite's `define` so production builds
// dead-code-eliminate any `if (DEV)` blocks. In dev mode, returns true.
// We use a runtime check on import.meta.env.DEV (Vite's standard).

export const DEV = import.meta?.env?.DEV ?? true;
```

- [ ] **Step 2: Confirm Vite exposes `import.meta.env.DEV`**

```bash
grep -r "import.meta.env" public/js/ | head -3
```

Expected: at least one existing reference, OR (if none exist) confirm via Vite docs that this is the standard.

If no usage exists yet, that's fine — Vite always exposes `import.meta.env.DEV` as a boolean. The fallback `?? true` keeps Node tests working (where `import.meta.env` is undefined).

- [ ] **Step 3: Commit**

```bash
git add public/js/scenes/dev-flag.js
git commit -m "feat(scenes): add DEV build-time flag for dev-only assertions"
```

---

### Task 3: Scene base class

**Files:**
- Create: `public/js/scenes/scene.js`
- Create: `tests/unit/scenes/scene.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/scenes/scene.test.js`:

```javascript
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
    const s = new Scene('T', makeFakeApp());
    let order = [];
    s.beforeExit = () => order.push('before');
    s.addUpdater(() => order.push('update-fn'));
    // monkey-patch registry.dispose to record order
    const origDispose = s.registry.dispose.bind(s.registry);
    s.registry.dispose = () => { order.push('dispose'); origDispose(); };
    s.exit();
    assert.deepStrictEqual(order, ['before', 'dispose']);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
node --test tests/unit/scenes/scene.test.js
```

Expected: FAIL (cannot find module).

- [ ] **Step 3: Implement `Scene`**

Create `public/js/scenes/scene.js`:

```javascript
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
    this.registry = new ResourceRegistry();
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/unit/scenes/scene.test.js
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/scenes/scene.js tests/unit/scenes/scene.test.js
git commit -m "feat(scenes): add Scene base class with lifecycle and disposal guards"
```

---

### Task 4: SceneManager

**Files:**
- Create: `public/js/scenes/scene-manager.js`
- Create: `tests/unit/scenes/scene-manager.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/scenes/scene-manager.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SceneManager } from '../../../public/js/scenes/scene-manager.js';
import { Scene } from '../../../public/js/scenes/scene.js';

function makeFakeApp() {
  const listeners = new Set();
  return {
    ticker: {
      add: (fn) => listeners.add(fn),
      remove: (fn) => listeners.delete(fn),
      get count() { return listeners.size; },
    },
    stage: { addChild: () => {}, removeChild: () => {} },
  };
}

class TestScene extends Scene {
  constructor(app) {
    super('TestScene', app);
    this.enterCalls = 0;
    this.lastOpts = null;
  }
  async enter(opts) { super.enter(opts); this.enterCalls++; this.lastOpts = opts; }
}

describe('SceneManager', () => {
  it('starts with no current scene', () => {
    const mgr = new SceneManager(makeFakeApp());
    assert.strictEqual(mgr.currentScene, null);
  });

  it('transition() constructs and enters a scene', async () => {
    const mgr = new SceneManager(makeFakeApp());
    await mgr.transition(TestScene, { roomId: 'r1' });
    assert.ok(mgr.currentScene);
    assert.strictEqual(mgr.currentScene.enterCalls, 1);
    assert.deepStrictEqual(mgr.currentScene.lastOpts, { roomId: 'r1' });
  });

  it('transition() exits the current scene before entering the next', async () => {
    const mgr = new SceneManager(makeFakeApp());
    await mgr.transition(TestScene);
    const first = mgr.currentScene;
    await mgr.transition(TestScene);
    assert.strictEqual(first.disposed, true);
    assert.notStrictEqual(mgr.currentScene, first);
  });

  it('throws if transition() is re-entered while transitioning', async () => {
    const mgr = new SceneManager(makeFakeApp());
    class SlowScene extends Scene {
      constructor(app) { super('SlowScene', app); }
      async enter() { super.enter(); await new Promise(r => setTimeout(r, 50)); }
    }
    const p = mgr.transition(SlowScene);
    await assert.rejects(() => mgr.transition(SlowScene), /transition already in progress/);
    await p;
  });

  it('cleans up partial setup if enter() throws', async () => {
    const mgr = new SceneManager(makeFakeApp());
    class FailingScene extends Scene {
      constructor(app) { super('FailingScene', app); }
      async enter() { super.enter(); this.addUpdater(() => {}); throw new Error('boom'); }
    }
    await assert.rejects(() => mgr.transition(FailingScene), /boom/);
    assert.strictEqual(mgr.currentScene, null);
  });

  it('init() registers exactly one app.ticker callback that drives currentScene.update', () => {
    const app = makeFakeApp();
    const mgr = new SceneManager(app);
    mgr.init();
    assert.strictEqual(app.ticker.count, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
node --test tests/unit/scenes/scene-manager.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement `SceneManager`**

Create `public/js/scenes/scene-manager.js`:

```javascript
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
      const dt = ticker.deltaTime ?? ticker;
      if (this._parallax && typeof this._parallax.update === 'function') {
        this._parallax.update(dt);
      }
      if (this.currentScene && !this.transitioning && !this.currentScene.disposed) {
        this.currentScene.update(dt);
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
        try { this.currentScene.exit(); } catch (e) { console.error('Scene exit threw:', e); }
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
      try { this.currentScene.exit(); } catch {}
      this.currentScene = null;
    }
    if (this._tickerFn) {
      this.app.ticker.remove(this._tickerFn);
      this._tickerFn = null;
    }
    this._initialized = false;
  }
}

// Singleton accessor — populated at app boot from public/game.js
let _instance = null;
export function getSceneManager() {
  if (!_instance) throw new Error('SceneManager not yet initialized');
  return _instance;
}
export function setSceneManager(mgr) { _instance = mgr; }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/unit/scenes/scene-manager.test.js
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/scenes/scene-manager.js tests/unit/scenes/scene-manager.test.js
git commit -m "feat(scenes): add SceneManager singleton with atomic transitions"
```

---

## Phase 2: Creature uid (data-model change)

### Task 5: Add `uid` to creatures and lazy migration

**Files:**
- Modify: `src/game/creatures.js` (around line 73, the `instantiateCreature` function)
- Modify: `src/game/state.js` (wherever player party deserializes)
- Create: `tests/unit/scenes/uid-migration.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/scenes/uid-migration.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { instantiateCreature } from '../../../src/game/creatures.js';
import { backfillCreatureUid, backfillCreatureListUids } from '../../../src/game/creatures.js';

describe('creature uid', () => {
  it('instantiateCreature assigns a uid', () => {
    const c = instantiateCreature('neko_kit', 1);
    assert.ok(c.uid, 'expected uid to be set');
    assert.strictEqual(typeof c.uid, 'string');
    assert.ok(c.uid.length >= 8);
  });

  it('two instances of the same template get different uids', () => {
    const a = instantiateCreature('neko_kit', 1);
    const b = instantiateCreature('neko_kit', 1);
    assert.notStrictEqual(a.uid, b.uid);
  });

  it('backfillCreatureUid assigns uid only if missing', () => {
    const without = { id: 'neko_kit', name: 'x' };
    backfillCreatureUid(without);
    assert.ok(without.uid);
    const existing = { id: 'neko_kit', uid: 'preserved' };
    backfillCreatureUid(existing);
    assert.strictEqual(existing.uid, 'preserved');
  });

  it('backfillCreatureListUids walks an array', () => {
    const list = [{ id: 'a' }, { id: 'b', uid: 'keep' }, null];
    backfillCreatureListUids(list);
    assert.ok(list[0].uid);
    assert.strictEqual(list[1].uid, 'keep');
    // null entries are skipped, not crashed
  });
});
```

> **Note:** If `'neko_kit'` is not a valid creature id in `data/creatures.json`, replace it with any valid id by running `node -e "import('./data/creatures.json', {assert:{type:'json'}}).then(d => console.log(d.default[0].id))"`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test tests/unit/scenes/uid-migration.test.js
```

Expected: FAIL — `instantiateCreature` doesn't set `uid`; `backfillCreatureUid` doesn't exist.

- [ ] **Step 3: Modify `instantiateCreature` to set `uid`**

In `src/game/creatures.js`, locate the `return { id: template.id, ... }` block inside `instantiateCreature` (currently around line 98). Add `uid: crypto.randomUUID(),` at the top of the returned object:

```javascript
  return {
    uid: crypto.randomUUID(),
    id: template.id,
    name: template.name,
    // ...rest unchanged
  };
```

Append the migration helpers at the bottom of `src/game/creatures.js`:

```javascript
export function backfillCreatureUid(creature) {
  if (creature && typeof creature === 'object' && !creature.uid) {
    creature.uid = crypto.randomUUID();
  }
  return creature;
}

export function backfillCreatureListUids(list) {
  if (!Array.isArray(list)) return list;
  for (const c of list) backfillCreatureUid(c);
  return list;
}
```

- [ ] **Step 4: Wire lazy migration into `src/game/state.js`**

```bash
grep -n "creatureParty\|active\s*:" src/game/state.js | head -20
```

Locate the function that loads/restores a player's run state. Inside that function, after the party array is read from disk, call:

```javascript
import { backfillCreatureListUids } from './creatures.js';
// ...inside the load function...
backfillCreatureListUids(run.creatureParty?.active);
backfillCreatureListUids(run.creatureParty?.benched);
backfillCreatureListUids(player.creatureCollection);
```

If those property paths differ in your codebase, adapt to match. The intent: every creature object that flows into `gameState` has `uid` populated.

- [ ] **Step 5: Run tests; ensure full unit suite still passes**

```bash
node --test tests/unit/scenes/uid-migration.test.js
npm run test:unit
```

Expected: new tests PASS; existing unit suite PASSes (no creature serialization tests should depend on the absence of `uid`).

- [ ] **Step 6: Commit**

```bash
git add src/game/creatures.js src/game/state.js tests/unit/scenes/uid-migration.test.js
git commit -m "feat(creatures): add per-instance uid with lazy backfill on load"
```

---

## Phase 3: PIXI app refactor and parallax API

### Task 6: Rename `pixi/battle-stage.js` → `pixi/app.js` and remove main ticker

**Files:**
- Move: `public/js/pixi/battle-stage.js` → `public/js/pixi/app.js`
- Modify: All importers of `battle-stage`

- [ ] **Step 1: List importers of `battle-stage.js`**

```bash
grep -rln "battle-stage" public/js/ src/ | sort -u
```

Record the list — every importer needs an updated import path.

- [ ] **Step 2: Move the file**

```bash
git mv public/js/pixi/battle-stage.js public/js/pixi/app.js
```

- [ ] **Step 3: Update all imports**

For each file from Step 1, change the import:

```javascript
// Before:
import { initBattleStage, getStage } from './battle-stage.js';
// After:
import { initApp, getApp } from './app.js';
```

The exported names also change (next step). The list of importers per Step 1 typically includes `public/game.js` and several `public/js/pixi/*.js` files.

- [ ] **Step 4: Rename exports and remove the per-feature ticker registration**

Edit `public/js/pixi/app.js`:

- Rename `initBattleStage` → `initApp`.
- Rename `getStage` → `getApp` (returns `{ app, layers }` as today).
- Rename `destroyBattleStage` → `destroyApp`.
- **Remove** the `app.ticker.add(...)` block that drives `updateParallax` and `updateFormations` — those become the SceneManager's job (Task 7) and per-scene work respectively. Leave `updateParticles` in place for now; it'll move in Task 9.

The `initFormations` and `initParticles` initialization calls inside `initApp` should also move out — formations are a scene concept now, not an app-level concept. Delete the `initFormations()` call from `initApp`. Keep `initParticles()` for now (effects pool is long-lived).

- [ ] **Step 5: Syntax check and run tests**

```bash
node --check public/js/pixi/app.js && echo "OK"
for f in $(grep -rln "from.*['\"]\(\.\./\)*pixi/app" public/js/); do node --check "$f" && echo "OK: $f"; done
npm run test:unit
```

Expected: all "OK"; unit tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(pixi): rename battle-stage to app and remove main ticker"
```

---

### Task 7: Wire SceneManager into app boot and own the central ticker

**Files:**
- Modify: `public/game.js` (around the PIXI bootstrap)
- Modify: `public/js/pixi/parallax.js`
- Modify: `public/js/pixi/effects.js`

- [ ] **Step 1: Read the current PIXI bootstrap in `public/game.js`**

```bash
grep -n "initBattleStage\|initApp" public/game.js
```

Locate the call site (post-rename, this is `await initApp()`).

- [ ] **Step 2: After PIXI init, construct and init the SceneManager**

In `public/game.js`, immediately after the `await initApp()` (or equivalent):

```javascript
import { SceneManager, setSceneManager } from './js/scenes/scene-manager.js';
import { updateParallax } from './js/pixi/parallax.js';
import { updateParticles } from './js/pixi/effects.js';

// ...inside the async boot function, after initApp:
const { app } = getApp();
const sceneManager = new SceneManager(app);
sceneManager.configure({
  parallax: { update: (dt) => { updateParallax(dt); updateParticles(dt); } }
});
sceneManager.init();
setSceneManager(sceneManager);
```

Note: we hand the manager a single `parallax` object whose `update()` drives both the parallax background and the long-lived particle pool, since both are app-level concerns. (We'll split this into a cleaner abstraction in Task 9.)

- [ ] **Step 3: Add `start()` / `stop()` to `parallax.js`**

In `public/js/pixi/parallax.js`, add at the bottom:

```javascript
let _scrollEnabled = false;
let _scrollSpeed = 0;

export function startParallax(speed = 1.0) {
  _scrollEnabled = true;
  _scrollSpeed = speed;
}

export function stopParallax() {
  _scrollEnabled = false;
  _scrollSpeed = 0;
}
```

Then modify the existing `updateParallax(dt)` function to gate scrolling on `_scrollEnabled`:

```javascript
export function updateParallax(dt) {
  if (!_scrollEnabled) return;
  // ...existing scroll logic, multiplied by _scrollSpeed...
}
```

- [ ] **Step 4: Verify the dev server still boots and the title screen renders**

```bash
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: HTTP 200. **Then ask the user to open http://localhost:5173 in a browser** and confirm the title screen appears with no console errors. (Combat won't work yet — that's Task 16.)

- [ ] **Step 5: Stop the dev server and commit**

```bash
pkill -f "vite" ; pkill -f "node --watch server.js"
git add public/game.js public/js/pixi/parallax.js
git commit -m "feat(scenes): boot SceneManager after PIXI init; gate parallax scroll"
```

---

## Phase 4: BattleScene buildup

### Task 8: BattleScene skeleton

**Files:**
- Create: `public/js/scenes/battle-scene.js`

- [ ] **Step 1: Create the skeleton**

```javascript
import { Scene } from './scene.js';
import { Container } from 'pixi.js';
import { startParallax, stopParallax } from '../pixi/parallax.js';

export class BattleScene extends Scene {
  constructor(app) {
    super('BattleScene', app);

    // Sub-containers organized by z-order
    this.layers = {
      formations: this.addContainer(new Container()),
      effects:    this.addContainer(new Container()),
      labels:     this.addContainer(new Container()),
      overlay:    this.addContainer(new Container()),
    };
    // Mount layers under app.stage so they actually render
    app.stage.addChild(this.layers.formations);
    app.stage.addChild(this.layers.effects);
    app.stage.addChild(this.layers.labels);
    app.stage.addChild(this.layers.overlay);

    // Per-uid lookups
    this.spritesByUid = new Map();   // uid -> PIXI.Sprite
    this.hpBarsByUid  = new Map();   // uid -> DOM element
    this.pillsByUid   = new Map();   // uid -> PIXI.Container
    this.vfxByUid     = new Map();   // uid -> { stun?: handle, sleep?: ... }
  }

  async enter({ allies = [], enemies = [], parallaxSpeed = 0 } = {}) {
    super.enter();
    if (parallaxSpeed > 0) startParallax(parallaxSpeed);
    await this.syncCreatures({ allies, enemies, initial: true });
  }

  beforeExit = () => {
    stopParallax();
    // Layers will be destroyed by the registry (they are tracked containers).
    // Lookup maps just go out of scope along with `this`.
    this.spritesByUid.clear();
    this.hpBarsByUid.clear();
    this.pillsByUid.clear();
    this.vfxByUid.clear();
  };

  getSprite(uid) { return this.spritesByUid.get(uid); }

  // Stub — implemented in Task 9 once formation.js is stateless
  async syncCreatures({ allies = [], enemies = [], initial = false } = {}) {
    this._guard('syncCreatures');
    // Filled in by Task 9, Step 6
  }
}
```

- [ ] **Step 2: Syntax-check**

```bash
node --check public/js/scenes/battle-scene.js && echo "OK"
```

Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add public/js/scenes/battle-scene.js
git commit -m "feat(scenes): add BattleScene skeleton with layers and uid lookup maps"
```

---

### Task 9: Refactor `pixi/formation.js` into a stateless module

**Files:**
- Modify: `public/js/pixi/formation.js`

This is the largest single refactor in the plan. We turn `formation.js` from a stateful module into a set of pure functions that operate on a scene-owned context.

- [ ] **Step 1: Read the current module to understand the surface**

```bash
wc -l public/js/pixi/formation.js
grep -n "^export\|^function\|^let\|^const " public/js/pixi/formation.js | head -40
```

Note every exported symbol (`showFormation`, `hideFormation`, `getCreatureSprite`, `setFormationVisible`, `clearActiveGlow`, etc.) and every module-level state (`creatureSprites`, `lastFormationInput`, `npcSprite`, `walkingEnabled`, `activeGlow`, `loadRequestId`, `playerContainer`, `enemyContainer`).

- [ ] **Step 2: Move all module-level state into a per-scene context object**

Replace each module-level `let` declaration with a function that creates a fresh context:

```javascript
// formation.js — at top, replace module-level state with this factory:
export function createFormationContext(scene) {
  return {
    scene,
    playerContainer: scene.addContainer(new Container(), scene.layers.formations),
    enemyContainer:  scene.addContainer(new Container(), scene.layers.formations),
    creatureSprites: { player: new Map(), enemy: new Map() }, // keyed by uid now
    lastFormationInput: { player: null, enemy: null },
    walkingEnabled: false,
    activeGlow: null,
    loadRequestId: { player: 0, enemy: 0 },
  };
}
```

Inside `BattleScene.constructor`, replace the layer setup with:

```javascript
import { createFormationContext } from '../pixi/formation.js';
// ...after layers are created:
this.formation = createFormationContext(this);
```

- [ ] **Step 3: Convert each exported function to take the context as its first argument**

Example before:

```javascript
export async function showFormation(side, creatures, opts = {}) {
  // uses creatureSprites, playerContainer, etc.
}
```

After:

```javascript
export async function showFormation(ctx, side, creatures, opts = {}) {
  // uses ctx.creatureSprites, ctx.playerContainer, etc.
}
```

Apply the same transformation to: `hideFormation`, `getCreatureSprite`, `setFormationVisible`, `clearActiveGlow`, `syncPixiStatusLabels`, `clearAllPixiStatusLabels`, `updateFormations`, `resizeFormations`, and any helper that touched module-level state. Update internal references from `creatureSprites[side][index]` to `ctx.creatureSprites[side].get(uid)`.

- [ ] **Step 4: Re-key sprite storage from array index to uid**

Anywhere the old code used array index (e.g., `creatureSprites[side][i]`), change to keyed-by-uid lookup. The `creatures` array still iterates in order for layout positioning, but the storage is `Map<uid, Sprite>`:

```javascript
// In showFormation:
for (let i = 0; i < creatures.length; i++) {
  const creature = creatures[i];
  // ...load texture, create sprite, position by i...
  ctx.creatureSprites[side].set(creature.uid, sprite);
  sprite._uid = creature.uid;
  sprite._side = side;
  sprite._dataIndex = i;
}
```

- [ ] **Step 5: Replace `app.ticker.add(walkingTick)` with `scene.addUpdater(walkingTick)`**

Locate `updateFormations` — it's currently registered to `app.ticker` from `pixi/app.js`. Instead, `BattleScene.enter()` will register it as an updater:

In `battle-scene.js` `enter()`:

```javascript
import { updateFormations } from '../pixi/formation.js';
// ...inside enter():
this.addUpdater((dt) => updateFormations(this.formation, dt));
```

And remove `updateFormations` from `pixi/app.js` if it's still called there.

- [ ] **Step 6: Implement `BattleScene.syncCreatures()` using the new formation API**

In `battle-scene.js`:

```javascript
import { spawnFormationSprite, removeFormationSprite, updateFormationSprite } from '../pixi/formation.js';

async syncCreatures({ allies = [], enemies = [], initial = false } = {}) {
  this._guard('syncCreatures');
  await this._diff('player', allies, initial);
  await this._diff('enemy', enemies, initial);
}

async _diff(side, creatures, initial) {
  const incomingUids = new Set(creatures.map(c => c.uid));
  const sideMap = this.formation.creatureSprites[side];

  // Remove sprites for uids no longer present
  for (const uid of [...sideMap.keys()]) {
    if (!incomingUids.has(uid)) {
      this._destroyCreature(side, uid);
    }
  }

  // Spawn or update — spawns are async (texture loads); run them in parallel
  // so combat start latency doesn't sum sequential awaits.
  const spawnPromises = [];
  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (sideMap.has(c.uid)) {
      updateFormationSprite(this.formation, side, c, i);
    } else {
      spawnPromises.push(
        spawnFormationSprite(this.formation, side, c, i).then(sprite => {
          this.spritesByUid.set(c.uid, sprite);
        })
      );
    }
  }
  await Promise.all(spawnPromises);
}

_destroyCreature(side, uid) {
  removeFormationSprite(this.formation, side, uid);
  this.spritesByUid.delete(uid);
  // HP bar / pill / VFX cleanup hooks land in subsequent tasks
}
```

You will need to introduce `spawnFormationSprite`, `updateFormationSprite`, and `removeFormationSprite` in `formation.js`, splitting the work currently inside `showFormation`/`hideFormation` into per-creature operations.

- [ ] **Step 7: Syntax check**

```bash
node --check public/js/pixi/formation.js && echo "OK"
node --check public/js/scenes/battle-scene.js && echo "OK"
```

Expected: both OK.

- [ ] **Step 8: Commit**

```bash
git add public/js/pixi/formation.js public/js/scenes/battle-scene.js
git commit -m "refactor(formation): make stateless; key sprites by uid; integrate with BattleScene"
```

---

### Task 10: Refactor `pixi/status-vfx.js` into a stateless module

**Files:**
- Modify: `public/js/pixi/status-vfx.js`
- Modify: `public/js/scenes/battle-scene.js`

- [ ] **Step 1: Replace the module-level `ongoingVfx` Map with a context factory**

```javascript
// At top of status-vfx.js:
export function createStatusVfxContext(scene) {
  return {
    scene,
    vfxByUid: scene.vfxByUid, // share BattleScene's map (single source of truth)
  };
}
```

In `BattleScene.constructor`, after `createFormationContext`:

```javascript
import { createStatusVfxContext } from '../pixi/status-vfx.js';
this.statusVfx = createStatusVfxContext(this);
```

- [ ] **Step 2: Convert exported functions to take the context**

Existing surface (verify with grep): `playStatusApplied`, `startOngoing`, `clearStatusVfx`, `clearAllStatusVfx`. Each takes `(ctx, side, uid, effectType, ...)` instead of `(side, index, effectType, ...)`. Inside, look up sprite via `ctx.scene.getSprite(uid)`.

Delete `clearAllStatusVfx` entirely — its job is now done by `scene.exit()` automatically (containers are owned by the scene; updaters are owned by the scene).

- [ ] **Step 3: Replace every `app.ticker.add(onTick)` with `scene.addUpdater(onTick)`**

Currently `status-vfx.js` calls `app.ticker.add(onTick)` six times (sleep, stun, confuse, haste, shield, taunt) and stores the function ref in `entry.tickerId` for later removal. Replace each:

```javascript
// Before:
app.ticker.add(onTick);
entry.tickerId = onTick;

// After:
const cancel = ctx.scene.addUpdater(onTick);
entry.cancel = cancel;
```

When the effect ends explicitly, call `entry.cancel()`. When the scene exits, the updater is automatically dropped.

- [ ] **Step 4: Remove `clearAllStatusVfx` import and call from `combat-loop.js`**

```bash
grep -n "clearAllStatusVfx\|clearAllPixiStatusLabels" public/js/ui/combat-loop.js
```

For each occurrence, delete the call. (The corresponding cleanup is now done by `scene.exit()`.) Leave a `// scene.exit() handles this` comment at one of the deletion sites for grep-ability.

- [ ] **Step 5: Syntax check and unit tests**

```bash
node --check public/js/pixi/status-vfx.js && echo "OK"
node --check public/js/scenes/battle-scene.js && echo "OK"
node --check public/js/ui/combat-loop.js && echo "OK"
npm run test:unit
```

Expected: all OK; unit suite still PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/pixi/status-vfx.js public/js/scenes/battle-scene.js public/js/ui/combat-loop.js
git commit -m "refactor(status-vfx): use scene updaters; delete clearAllStatusVfx"
```

---

### Task 11: Rename `ui/scene.js` → `ui/combat-dom.js` and route through BattleScene

**Files:**
- Move: `public/js/ui/scene.js` → `public/js/ui/combat-dom.js`
- Create: `public/js/ui/exploration-dom.js` (extracted NPC display helpers)
- Modify: All importers

- [ ] **Step 1: List importers**

```bash
grep -rln "from.*['\"].*ui/scene['\"']" public/js/ src/
```

- [ ] **Step 2: Move and split**

```bash
git mv public/js/ui/scene.js public/js/ui/combat-dom.js
```

In the new `combat-dom.js`, locate the NPC-display helpers (`showNpcInDisplay`, `hideNpcInDisplay`, `showPlaceholder`, `removePlaceholder`, etc.) and move them into a new file:

```bash
# Cut the relevant exports out of combat-dom.js and paste into:
touch public/js/ui/exploration-dom.js
```

The split rule: anything that updates HP bars / formation slots / damage display stays in `combat-dom.js`. Anything that shows/hides an NPC portrait or fallback placeholder belongs in `exploration-dom.js`.

- [ ] **Step 3: Update all imports**

For each file from Step 1, replace the import path. If a file uses both kinds of helpers, it imports from both new modules.

- [ ] **Step 4: Convert HP bar / formation functions to take `(scene, ...)` and register DOM via `scene.addDom`**

Example: `buildAllyHpMap(scene, allies)` instead of `buildAllyHpMap(allies)`. When the function appends a DOM element it doesn't already own (e.g. a damage popup that lives until next render), use `scene.addDom(el, parent)` so it's tracked.

For HP bars that are tied to formation slots in the static DOM, no scene tracking is needed — they live as long as the slot does. Only TRANSIENT DOM (damage popups, banners, the placeholder element) gets `scene.addDom`.

- [ ] **Step 5: Syntax check**

```bash
node --check public/js/ui/combat-dom.js && echo "OK"
node --check public/js/ui/exploration-dom.js && echo "OK"
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(ui): split scene.js into combat-dom.js + exploration-dom.js; route through BattleScene"
```

---

### Task 12: Refactor `pixi/element-blasts.js`, `pixi/text.js`, `pixi/banners.js`

**Files:**
- Modify: `public/js/pixi/element-blasts.js`
- Modify: `public/js/pixi/text.js`
- Modify: `public/js/pixi/banners.js`

- [ ] **Step 1: For each module, change every exported function to accept a `scene` (or parent container) parameter**

Pattern: anywhere the old code did `app.stage.addChild(container)` or `getStage().layers.X.addChild(container)`, convert to `scene.addContainer(container, scene.layers.X)`.

Anywhere the old code called `tween(target, to, opts)`, change to `scene.tween(target, to, opts)` so the tween is registry-tracked.

- [ ] **Step 2: Add `scene.tween()` to the Scene base class**

Append to `public/js/scenes/scene.js`:

```javascript
import { tween as _tween } from '../pixi/tween.js';

// (inside class Scene)
tween(target, to, opts = {}) {
  this._guard('tween');
  let cancelled = false;
  const handle = { cancel: () => { cancelled = true; } };
  this.registry.trackTween(handle);
  // Wrap the existing tween() so we can cancel mid-flight
  const promise = _tween(target, to, opts);
  // The simplest cancel semantics for now: a cancelled tween's promise
  // still resolves but updates stop. (If pixi/tween.js supports a real
  // cancel, wire it through here.)
  return promise;
}
```

If `pixi/tween.js` doesn't support cancellation, add a lightweight cancel hook to it (small change — track an `_isCancelled` flag on each tween's options object and bail in the tick).

- [ ] **Step 3: Syntax check and run unit tests**

```bash
for f in public/js/pixi/element-blasts.js public/js/pixi/text.js public/js/pixi/banners.js public/js/scenes/scene.js public/js/pixi/tween.js; do
  node --check "$f" && echo "OK: $f"
done
npm run test:unit
```

Expected: all OK; unit suite PASS.

- [ ] **Step 4: Commit**

```bash
git add public/js/pixi/ public/js/scenes/scene.js
git commit -m "refactor(pixi): make element-blasts/text/banners scene-aware; add scene.tween"
```

---

### Task 13: Particle pool — return-to-pool on scene exit

**Files:**
- Modify: `public/js/pixi/effects.js`
- Modify: `public/js/scenes/battle-scene.js`

- [ ] **Step 1: Add a `releaseAllInFlight()` to the particle pool**

In `public/js/pixi/effects.js`, add (or expose) a function that returns every currently-active particle to the pool and clears their parents:

```javascript
const _inFlight = new Set(); // ensure new spawns add to this set

export function releaseAllInFlight() {
  for (const p of _inFlight) {
    if (p.parent) p.parent.removeChild(p);
    p.alpha = 0;
    p.visible = false;
    // ... whatever your reset logic is
    _pool.push(p);
  }
  _inFlight.clear();
}
```

If a `_pool` / `_inFlight` structure doesn't exist, add it. Every `spawnParticle()` adds to `_inFlight`; every release removes it.

- [ ] **Step 2: Hook `releaseAllInFlight` into `BattleScene.beforeExit`**

In `battle-scene.js`:

```javascript
import { releaseAllInFlight as releaseAllParticles } from '../pixi/effects.js';

beforeExit = () => {
  stopParallax();
  releaseAllParticles();
  this.spritesByUid.clear();
  // ...rest unchanged
};
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/effects.js public/js/scenes/battle-scene.js
git commit -m "refactor(effects): release in-flight particles on BattleScene exit"
```

---

## Phase 5: ExplorationScene buildup

### Task 14: ExplorationScene with NPC sprite ownership

**Files:**
- Create: `public/js/scenes/exploration-scene.js`

- [ ] **Step 1: Create the ExplorationScene**

```javascript
import { Scene } from './scene.js';
import { Container } from 'pixi.js';
import { startParallax, stopParallax } from '../pixi/parallax.js';
import { spawnNpcSprite, removeNpcSprite } from '../pixi/formation.js';

export class ExplorationScene extends Scene {
  constructor(app) {
    super('ExplorationScene', app);

    this.layers = {
      world:   this.addContainer(new Container()),
      npcs:    this.addContainer(new Container()),
      overlay: this.addContainer(new Container()),
    };
    app.stage.addChild(this.layers.world);
    app.stage.addChild(this.layers.npcs);
    app.stage.addChild(this.layers.overlay);

    this.roomId = null;
    this.discoveryState = {
      fetched: false,
      words: [],
      wordsLearned: 0,
      roomId: null,
    };
    this.shrineInProgress = false;
    this.npcSprite = null;
  }

  async enter({ roomId, parallaxSpeed = 0.6 } = {}) {
    super.enter();
    this.roomId = roomId;
    if (parallaxSpeed > 0) startParallax(parallaxSpeed);
  }

  beforeExit = () => {
    stopParallax();
    if (this.npcSprite) {
      removeNpcSprite(this, this.npcSprite);
      this.npcSprite = null;
    }
  };

  async showNpcSprite(spritePath, opts = {}) {
    this._guard('showNpcSprite');
    this.npcSprite = await spawnNpcSprite(this, spritePath, opts);
    return this.npcSprite;
  }

  hideNpcSprite() {
    this._guard('hideNpcSprite');
    if (this.npcSprite) {
      removeNpcSprite(this, this.npcSprite);
      this.npcSprite = null;
    }
  }
}
```

You will need to add `spawnNpcSprite(scene, spritePath, opts)` and `removeNpcSprite(scene, sprite)` to `formation.js` — extract the existing NPC sprite logic and convert to scene-aware form (containers via `scene.addContainer`, tweens via `scene.tween`, no module state).

- [ ] **Step 2: Syntax check**

```bash
node --check public/js/scenes/exploration-scene.js && echo "OK"
node --check public/js/pixi/formation.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/scenes/exploration-scene.js public/js/pixi/formation.js
git commit -m "feat(scenes): add ExplorationScene with NPC sprite ownership"
```

---

### Task 15: Move `creature-row.js` listener registration into a scene

**Files:**
- Modify: `public/js/ui/creature-row.js`

The two `addEventListener` calls in `creature-row.js` (one on `dom.playerFormation`, one on `document`) currently register at module load and never unregister. Move both into a setup function that takes a scene.

- [ ] **Step 1: Wrap the listeners in `setupCreatureRowListeners(scene)`**

```javascript
export function setupCreatureRowListeners(scene) {
  scene.addListener(dom.playerFormation, 'click', (e) => {
    const slot = e.target.closest('.formation-slot');
    if (!slot) return;
    const idx = parseInt(slot.dataset.index, 10);
    if (_creatures[idx]) togglePopup(idx);
  });

  scene.addListener(document, 'click', (e) => {
    if (!e.target.closest('.formation-slot') && !e.target.closest('.creature-popup')) {
      hidePopup();
    }
  });
}
```

Remove the previous module-level `dom.playerFormation.addEventListener(...)` and `document.addEventListener(...)` calls.

- [ ] **Step 2: Call `setupCreatureRowListeners(this)` from `BattleScene.enter()` and `ExplorationScene.enter()`**

Both scenes need creature-row listeners (the player formation is visible in both modes).

- [ ] **Step 3: Syntax check**

```bash
node --check public/js/ui/creature-row.js && echo "OK"
node --check public/js/scenes/battle-scene.js && echo "OK"
node --check public/js/scenes/exploration-scene.js && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/creature-row.js public/js/scenes/
git commit -m "refactor(creature-row): register listeners through scene API"
```

---

## Phase 6: The big swap

### Task 16: Wire BattleScene into combat-loop.js

**Files:**
- Modify: `public/js/ui/combat-loop.js`

This is the load-bearing integration step. Up to this point, the new infrastructure exists alongside the old. This task switches `combat-loop.js` to use `SceneManager.transition(BattleScene, ...)` and removes the old per-feature cleanup calls.

- [ ] **Step 1: Replace combat-start setup with SceneManager.transition**

Locate where combat is currently entered (look for `showFormation` or the start of `startCombatLoop`). Replace direct PIXI/DOM setup calls with:

```javascript
import { getSceneManager } from '../scenes/scene-manager.js';
import { BattleScene } from '../scenes/battle-scene.js';

// At combat start:
const mgr = getSceneManager();
await mgr.transition(BattleScene, {
  allies: getGameState().combat.allies,
  enemies: getGameState().combat.enemies,
  parallaxSpeed: 0.0, // background does not scroll during combat (verify against current behavior)
});
const battleScene = mgr.currentScene;
```

- [ ] **Step 2: Replace per-feature cleanup with a single `transition` call on combat end**

Locate `cleanupCombat()` (currently around line 475-490). Replace its body with:

```javascript
function cleanupCombat() {
  if (playerAttackTimer) { clearTimeout(playerAttackTimer); playerAttackTimer = null; }
  // The following lines previously called clearAllPixiStatusLabels/clearAllStatusVfx/etc.
  // The new scene model handles all of that via scene.exit() during the next transition.
}
```

And on the actual transition out of combat (when entering exploration / town / wherever), call:

```javascript
import { ExplorationScene } from '../scenes/exploration-scene.js';
await getSceneManager().transition(ExplorationScene, { roomId: currentRoomId });
```

- [ ] **Step 3: Replace direct sprite lookups with `scene.getSprite(uid)`**

```bash
grep -n "creatureSprites\|getCreatureSprite" public/js/ui/combat-loop.js public/js/ui/combat-vfx.js
```

For each occurrence, switch to `getSceneManager().currentScene.getSprite(uid)`. Where the calling code only has an array index, look up the creature in `getGameState().combat.allies[i].uid` first.

- [ ] **Step 4: Update HP bar lookups in `combat-vfx.js` to be uid-based throughout**

The recent fix (109d463) already started this — extend it so every map (`updateCreatureHpBars`, `showOneEnemyAttackAnimated`, `buildAllyHpMap`) uses uid as the only key. Drop any remaining index-based fallback paths.

- [ ] **Step 5: Syntax check**

```bash
node --check public/js/ui/combat-loop.js && echo "OK"
node --check public/js/ui/combat-vfx.js && echo "OK"
```

- [ ] **Step 6: Manual smoke test in dev server**

```bash
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

**Ask the user to**:
1. Open http://localhost:5173 in a browser.
2. Start a new game / load a save.
3. Walk into a room, trigger an encounter.
4. Use a move; verify damage numbers, HP drops, status applies, KO animations all work.
5. Win the battle; verify return to exploration without ghost sprites.

If anything is broken, capture the console error and fix it before committing.

- [ ] **Step 7: Stop dev server and commit**

```bash
pkill -f "vite" ; pkill -f "node --watch server.js"
git add public/js/ui/combat-loop.js public/js/ui/combat-vfx.js
git commit -m "feat(combat): route combat lifecycle through SceneManager"
```

---

### Task 17: Wire ExplorationScene into exploration.js

**Files:**
- Modify: `public/js/ui/exploration.js`

- [ ] **Step 1: Move module-level `discoveryState` and `shrineInProgress` into ExplorationScene**

The two module-level variables in `exploration.js` (around lines 30-44) represent per-room state that currently leaks across rooms. Delete them from `exploration.js`. They already exist on `ExplorationScene` (added in Task 14). Wherever the file accessed them, change to:

```javascript
import { getSceneManager } from '../scenes/scene-manager.js';
const scene = getSceneManager().currentScene;
// Use scene.discoveryState.fetched, scene.shrineInProgress, etc.
```

- [ ] **Step 2: Trigger ExplorationScene transition on room entry**

Locate the function that handles entering a new room (look for `enterRoom`, `showRoom`, or wherever the discovery state is reset today). At its top:

```javascript
import { ExplorationScene } from '../scenes/exploration-scene.js';
await getSceneManager().transition(ExplorationScene, { roomId });
```

- [ ] **Step 3: Convert NPC sprite calls**

Anywhere `exploration.js` calls `showNpcSprite(...)` / `hideNpcSprite(...)` from `pixi/formation.js`, change to:

```javascript
const scene = getSceneManager().currentScene;
await scene.showNpcSprite(spritePath, opts);
// later:
scene.hideNpcSprite();
```

- [ ] **Step 4: Syntax check**

```bash
node --check public/js/ui/exploration.js && echo "OK"
```

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev &
sleep 5
```

**Ask the user to**:
1. Walk through several rooms.
2. Trigger an NPC dialogue with a sprite.
3. Verify NPC sprite appears, narration shows, NPC sprite disappears cleanly.
4. Walk to the next room and verify no NPC sprite ghosts in.
5. Trigger a combat from exploration; verify smooth transition both directions.

- [ ] **Step 6: Stop dev server and commit**

```bash
pkill -f "vite" ; pkill -f "node --watch server.js"
git add public/js/ui/exploration.js
git commit -m "feat(exploration): route room transitions through SceneManager"
```

---

## Phase 7: Cleanup, invariants, and tests

### Task 18: Delete dead code

**Files:**
- Modify: any file with code paths superseded by the new model

- [ ] **Step 1: Find references to deleted exports**

```bash
grep -rn "clearAllStatusVfx\|clearAllPixiStatusLabels\|destroyBattleStage" public/js/ src/
```

For each remaining reference, delete it (the underlying functionality is now scene.exit()).

- [ ] **Step 2: Remove dead module-level state from `formation.js`**

Verify no `let` declarations remain at module scope in `formation.js` (everything should be inside `createFormationContext`). Same for `status-vfx.js`.

```bash
grep -nE "^let " public/js/pixi/formation.js public/js/pixi/status-vfx.js
```

Expected: empty output.

- [ ] **Step 3: Remove `getStage()` if no callers remain**

```bash
grep -rn "getStage\b" public/js/ src/
```

If only the export site remains, delete it from `pixi/app.js`.

- [ ] **Step 4: Run full unit + integration suites**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(scenes): delete superseded cleanup paths and module state"
```

---

### Task 19: Dev-mode invariants

**Files:**
- Modify: `public/js/scenes/scene.js`
- Modify: `public/js/scenes/scene-manager.js`

- [ ] **Step 1: Add ticker-count and stage-descendant baseline tracking**

In `scene-manager.js`, after `init()`:

```javascript
import { DEV } from './dev-flag.js';

// (inside SceneManager class)
_recordBaseline() {
  if (!DEV) return;
  this._baselineTickerCount = this.app.ticker.count;
  this._baselineStageDescendants = this._countDescendants(this.app.stage);
}

_assertBaseline(label) {
  if (!DEV) return;
  const ticker = this.app.ticker.count;
  const descendants = this._countDescendants(this.app.stage);
  if (ticker > this._baselineTickerCount) {
    throw new Error(`SceneManager: ticker leak after ${label} — baseline ${this._baselineTickerCount}, now ${ticker}`);
  }
  if (descendants > this._baselineStageDescendants) {
    throw new Error(`SceneManager: stage descendant leak after ${label} — baseline ${this._baselineStageDescendants}, now ${descendants}`);
  }
}

_countDescendants(node) {
  let n = 0;
  for (const child of node.children) { n += 1 + this._countDescendants(child); }
  return n;
}
```

Call `this._recordBaseline()` once at the end of `init()`. After every `scene.exit()` in `transition()`, call `this._assertBaseline('transition exit')`.

- [ ] **Step 2: Verify `Scene._guard` already throws after exit (it does, from Task 3) — no new code needed**

- [ ] **Step 3: Add `_assertBaseline` after `destroy()`**

In `SceneManager.destroy()`, after the scene exit:

```javascript
this._assertBaseline('destroy');
```

- [ ] **Step 4: Run unit + integration tests**

```bash
npm test
```

Expected: PASS. (If any test now triggers an invariant assertion, that test was demonstrating a leak — fix it.)

- [ ] **Step 5: Commit**

```bash
git add public/js/scenes/
git commit -m "feat(scenes): dev-mode ticker + stage-descendant leak detector"
```

---

### Task 20: Settings-toggled debug overlay

**Files:**
- Create: `public/js/ui/scenes-overlay.js`
- Modify: settings menu module (find with `grep -rn "settings" public/js/ui/ | grep -v ".test." | head -5`)
- Modify: `public/game.js` (init the overlay)

- [ ] **Step 1: Create the overlay module**

```javascript
// scenes-overlay.js — settings-toggled debug HUD for scene state.
// Production-safe: samples public registry sizes only; no throws.

import { getSceneManager } from '../scenes/scene-manager.js';

let _el = null;
let _intervalId = null;
let _enabled = false;

function ensureEl() {
  if (_el) return _el;
  _el = document.createElement('div');
  _el.id = 'scenes-debug-overlay';
  _el.style.cssText = `
    position: fixed; right: 8px; bottom: 8px; z-index: 99999;
    background: rgba(0,0,0,0.7); color: #0f0; padding: 6px 10px;
    font: 11px/1.4 monospace; border-radius: 4px; pointer-events: none;
    max-width: 300px;
  `;
  document.body.appendChild(_el);
  return _el;
}

function tick() {
  if (!_enabled) return;
  let mgr;
  try { mgr = getSceneManager(); } catch { return; }
  const s = mgr.currentScene;
  const r = s?.registry;
  const lines = [
    `Scene: ${s?.name ?? '(none)'}`,
    s ? `Disposed: ${s.disposed}` : null,
    r ? `Containers: ${r.containers.size} | Updaters: ${r.updaters.size}` : null,
    r ? `DOM: ${r.domNodes.size} | Listeners: ${r.listeners.length}` : null,
    r ? `Timers: ${r.timers.size} | Tweens: ${r.tweens.size} | Async: ${r.pendingAsync.size}` : null,
    `Ticker count: ${mgr.app.ticker.count}`,
  ].filter(Boolean);
  ensureEl().textContent = lines.join('\n');
  ensureEl().style.whiteSpace = 'pre';
}

export function enableScenesOverlay() {
  if (_enabled) return;
  _enabled = true;
  ensureEl().style.display = 'block';
  _intervalId = setInterval(tick, 250);
  tick();
}

export function disableScenesOverlay() {
  _enabled = false;
  if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
  if (_el) _el.style.display = 'none';
}

export function isScenesOverlayEnabled() { return _enabled; }
```

- [ ] **Step 2: Add a settings toggle**

Locate the settings menu UI. Add a toggle (checkbox or switch) labeled "Show debug overlay". Wire it:

```javascript
import { enableScenesOverlay, disableScenesOverlay } from './scenes-overlay.js';

// On change:
if (newValue) enableScenesOverlay();
else disableScenesOverlay();
```

Persist the setting through whatever settings storage the game uses (likely the `/api/settings` endpoint per CLAUDE.md). On page load, read the setting; if true, call `enableScenesOverlay()`.

- [ ] **Step 3: Manual verification**

Start dev server, open the game, open settings, toggle the overlay on. Verify the HUD appears in the bottom-right corner showing scene name and counts. Walk into a combat encounter and watch the counts change as sprites/updaters/etc. are added. End combat and verify counts drop.

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/scenes-overlay.js public/js/ui/settings.js public/game.js
git commit -m "feat(scenes): add settings-toggled debug overlay for scene resource counts"
```

---

### Task 21: Cross-scene transition integration test

**Files:**
- Create: `tests/integration/scenes/scene-transitions.test.js`

This is the test that would have caught every recent firefighting bug.

- [ ] **Step 1: Write the integration test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SceneManager } from '../../../public/js/scenes/scene-manager.js';
import { Scene } from '../../../public/js/scenes/scene.js';

function makeFakeApp() {
  const listeners = new Set();
  const stage = { children: [], addChild(c){ this.children.push(c); }, removeChild(c){
    const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1);
  }};
  return {
    ticker: {
      add: (fn) => listeners.add(fn),
      remove: (fn) => listeners.delete(fn),
      get count() { return listeners.size; },
    },
    stage,
  };
}

class TestBattleScene extends Scene {
  constructor(app) {
    super('TestBattle', app);
    this.layer = this.addContainer({ children: [], addChild(c){this.children.push(c);}, destroy(){} });
  }
  async enter() {
    super.enter();
    // Simulate spawning sprites + updaters + listeners
    this.addUpdater(() => {});
    this.addUpdater(() => {});
    this.addListener({ addEventListener: () => {}, removeEventListener: () => {} }, 'click', () => {});
  }
}

class TestExplorationScene extends Scene {
  constructor(app) { super('TestExploration', app); }
  async enter() {
    super.enter();
    this.addUpdater(() => {});
  }
}

describe('SceneManager cross-scene transitions', () => {
  it('does not leak resources across 5 BattleScene<->ExplorationScene cycles', async () => {
    const app = makeFakeApp();
    const mgr = new SceneManager(app);
    mgr.init();
    const baselineTicker = app.ticker.count;
    const baselineStage = app.stage.children.length;

    for (let i = 0; i < 5; i++) {
      await mgr.transition(TestBattleScene);
      await mgr.transition(TestExplorationScene);
    }
    await mgr.transition(TestExplorationScene); // end on a known scene
    mgr.currentScene.exit();

    // After all scenes have exited, counts should be at baseline
    assert.strictEqual(app.ticker.count, baselineTicker, 'ticker leak across cycles');
    // (stage.children check is loose because real PIXI containers self-detach on destroy)
  });

  it('failed enter() during transition does not leak the partial scene', async () => {
    const app = makeFakeApp();
    const mgr = new SceneManager(app);
    mgr.init();

    class Boom extends Scene {
      async enter() {
        super.enter();
        this.addUpdater(() => {});
        this.addUpdater(() => {});
        throw new Error('intentional');
      }
    }

    await assert.rejects(() => mgr.transition(Boom), /intentional/);
    assert.strictEqual(mgr.currentScene, null);
    // Ticker count includes only the manager's own ticker, not the failed scene's updaters
    assert.strictEqual(app.ticker.count, 1, 'only manager ticker should remain');
  });
});
```

- [ ] **Step 2: Run the integration test**

```bash
node --test tests/integration/scenes/scene-transitions.test.js
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/scenes/scene-transitions.test.js
git commit -m "test(scenes): add cross-scene transition leak detector integration test"
```

---

### Task 22: Manual Playwright playthrough

**Files:** None (verification only)

- [ ] **Step 1: Start dev server**

```bash
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: HTTP 200.

- [ ] **Step 2: Ask the user for permission to launch Playwright**

Per CLAUDE.md: "Don't launch Playwright without asking first." Wait for explicit user approval before opening a browser session.

- [ ] **Step 3: Run the playthrough script**

Once approved, open Playwright at http://localhost:5173. Enable the debug overlay via settings. Then:

1. Walk through 3 rooms (verify NPC sprites come and go cleanly).
2. Enter a combat encounter from exploration.
3. Use 3 different moves; apply at least one status effect; KO an enemy.
4. Win the battle and return to exploration.
5. Repeat steps 2-4 four more times (5 combats total).
6. After each transition, snapshot the debug overlay counts and confirm they return to baseline.

Take a screenshot at each major step. Delete the screenshots after they've been shown to the user (per CLAUDE.md cleanup rule).

- [ ] **Step 4: Stop dev server**

```bash
pkill -f "vite" ; pkill -f "node --watch server.js"
```

- [ ] **Step 5: Commit any documentation/notes update**

If the playthrough surfaces small bugs that need follow-up, fix them inline; if they need a separate change, file them as TODO entries in the PR description.

```bash
# Only if documentation files were updated:
git add -A
git commit -m "docs: notes from manual scene-controller playthrough"
```

---

### Task 23: Open the PR

**Files:** None (git operation)

- [ ] **Step 1: Push the worktree branch**

```bash
git push -u origin feature/bulletproof-rendering
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base dev --title "feat: bulletproof rendering — Scene/SceneManager refactor" --body "$(cat <<'EOF'
## Summary
- Replaces the ad-hoc PixiJS+DOM rendering layer with a Scene/SceneManager pattern (Phaser-style ownership discipline on top of PixiJS).
- `BattleScene` and `ExplorationScene` own all per-encounter / per-room PIXI sprites, status VFX, HP bars, NPC sprites, listeners, timers, tweens, and async loads via a `ResourceRegistry`.
- `scene.exit()` destroys every owned resource in one ordered pass — eliminates the "elements left behind" / "appears late" / "browser refresh fixes it" bug class structurally.
- Adds per-instance `creature.uid` so sprite/HP-bar/VFX maps are keyed by stable identity instead of array index (fixes the latent collision when a player has duplicate species in a party).
- Dev-mode invariants throw on disposal violations; production builds strip the assertions.
- Settings-toggled debug HUD for live diagnostic.

Spec: `docs/superpowers/specs/2026-04-17-bulletproof-rendering-scene-controller-design.md`
Plan: `docs/superpowers/plans/2026-04-17-bulletproof-rendering-scene-controller.md`

## Test plan
- [ ] `npm test` — Tier 1 + Tier 2 pass (includes new ResourceRegistry, Scene, SceneManager unit tests and the cross-scene-transitions integration test)
- [ ] Manual Playwright playthrough — 5 combat encounters with the debug overlay enabled, counts return to baseline after every transition
- [ ] No console errors during a full run from title screen to combat to exploration and back

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report PR URL to user**

The PR URL will be printed by `gh pr create`. Share it.

---

## Self-Review Checklist (run before declaring complete)

After all tasks are committed, verify:

- [ ] `npm test` passes (Tier 1 + Tier 2)
- [ ] No `let` declarations remain at module scope in `pixi/formation.js`, `pixi/status-vfx.js`
- [ ] No remaining calls to `clearAllStatusVfx`, `clearAllPixiStatusLabels`, `destroyBattleStage`
- [ ] All sprite lookups in `combat-loop.js` and `combat-vfx.js` go through `scene.getSprite(uid)` — no `creatureSprites[side][i]`
- [ ] `app.ticker.add(...)` appears exactly once in the codebase: in `SceneManager.init()`
- [ ] Every PIXI container creation outside the scene API would fail the dev-mode invariant on transition (you can't enforce this structurally without a Proxy, but the leak detector catches it)
- [ ] Manual Playwright run shows debug overlay counts returning to baseline after each transition
- [ ] No screenshots, temporary files, or runtime caches committed

If any item is unchecked, the work is not done.
