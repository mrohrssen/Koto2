# Bulletproof Rendering: Scene Controller Refactor

**Date:** 2026-04-17
**Status:** Design — pending plan
**Author:** Brainstorming session (michia + Claude)

## TL;DR

The PixiJS + DOM rendering layer is structurally fragile: state for a single creature lives in 4 separate stores (`gameState`, `creatureSprites[][]`, `ongoingVfx` Map, DOM), and they're kept in sync by hand. Recent firefighting (commits 109d463, b37d516, 5e37226, 40df18a, 196542a, b6b43de) is the same shape: stale references or layer-toggle bugs, fixed by adding one more guard.

We will replace the ad-hoc rendering with a **scene-controller pattern**: a `Scene` base class that owns a registry of every PIXI sprite, container, ticker, DOM element, listener, timer, and async load it creates. `BattleScene` and `ExplorationScene` extend it. A `SceneManager` singleton holds exactly one active scene at a time. On transition, `scene.exit()` destroys every owned resource — making "elements left behind" structurally impossible.

This is the same pattern Phaser bakes into its core; PixiJS doesn't ship a scene model, so we build one (~400 lines).

## Problem statement

The user reports that during real game play, sprites, status effects, and HP bars frequently behave incorrectly:

- An element gets left behind when it shouldn't.
- An element appears later, after something it shouldn't have followed.
- Browser refresh almost always clears the issue.

Dozens of hours have been spent fixing edge cases. The pattern keeps recurring.

### Root causes (validated by codebase exploration)

1. **State split across 4 stores** with manual synchronization:
   - `gameState.combat.allies/enemies` (game logic)
   - `creatureSprites[side][]` (PIXI sprite array, `pixi/formation.js`)
   - `ongoingVfx` Map (status effect tickers + containers, `pixi/status-vfx.js`)
   - DOM `.formation-slot` + `.formation-hp-bar` (`ui/scene.js`)

2. **`cleanupCombat()` clears DOM + status pills but never calls `clearAllStatusVfx()`** (`ui/combat-loop.js:475-490`). Status tickers leak across combats.

3. **Status tickers stored as bare function refs** in `entry.tickerId` (`pixi/status-vfx.js:218`). If the entry is deleted before `app.ticker.remove()` runs, the function leaks into `app.ticker` forever.

4. **Index-based sprite lookup** (`creatureSprites[side][index]`). Server compacts allies after KO, so indices drift between client renders. Recent commits patched 3 functions to match by ID, but the pattern is fragile by construction.

5. **PIXI sprite positions read from DOM `getBoundingClientRect()`** at render time (`pixi/formation.js:274-281`). If the anchor is hidden mid-render, sprites silently snap to (0,0).

6. **Module-level state accumulates across combats** (`ongoingVfx`, `creatureSprites`, `lastFormationInput`, `discoveryState`, `shrineInProgress`). Browser refresh wipes the module — exactly why refresh always fixes the issue.

### Why a structural fix instead of more guards

Every recent fix is a guard added to one path. The bug class — *stale references between independent state stores* — is structural. New paths through the system will keep surfacing new manifestations of the same class.

## Decisions made during brainstorming

| Q | Decision | Notes |
|---|----------|-------|
| Scope appetite | **B — single source of truth + lifecycle discipline** | Not bandaid (A) or ECS rewrite (C) |
| PvE/PvP | **Both replaced simultaneously** | Per CLAUDE.md parity rule — splitting recreates the parity problem we're trying to delete |
| Controller surface | **B — combat + room exploration** | Bugs reported in both; ExplorationScene addresses the second surface |
| Dev-mode safety net | **B — invariants throw in dev, stripped in prod** | Plus aggressive leak-detector planned for later |
| Migration approach | **A — big bang in worktree** | Strangler fig means living in the broken structure longer |
| Stack choice | **Stay on PixiJS, build scene model on top** | Phaser switch is a renderer swap; pattern is the actual fix, not the framework |

## Architecture

### Three concepts

**1. `Scene` base class.** Represents the lifetime of one rendering setup (one combat encounter, one room visit). Owns a `ResourceRegistry` of every PIXI sprite, container, ticker, DOM element, listener, timer, and async load it creates.

```
new Scene()        construct, allocate root containers
scene.enter(opts)  populate sprites/DOM, start tickers (async)
scene.update(dt)   per-frame work (driven by SceneManager)
scene.exit()       destroy ALL owned resources, return to clean baseline
```

After `exit()`, accessing the scene throws (in dev). The scene is dead.

**2. Concrete scenes:**
- `BattleScene` — owns combat sprites (player + enemy formations), status pills, status VFX, HP bars, damage popups, attack VFX, combat banners. Lives for one encounter.
- `ExplorationScene` — owns NPC sprites, room creature row, room-specific overlays. Lives for one room visit.

**3. `SceneManager`.** Singleton holding the currently active scene. `transition(NextSceneClass, opts)` calls `currentScene.exit()`, then constructs and `enter()`s the next scene. Exactly one scene is active at a time — refuses to construct a new scene without exiting the current one.

### Long-lived infrastructure

Not owned by any scene:

- PIXI `Application` (one global, lives forever)
- `ResizeObserver` (lifetime tied to the app)
- Parallax background system (scenes *configure* via `parallax.start(speed)` / `parallax.stop()` in their `enter()` / `beforeExit()` hooks)

```
┌─────────────────────────────────────────────────┐
│  App-level (long-lived)                         │
│   PIXI Application • ResizeObserver • Parallax  │
└─────────────────────────────────────────────────┘
                      ▲
                      │  (configures, never owns)
                      │
┌─────────────────────────────────────────────────┐
│  SceneManager (singleton)                       │
│    currentScene: Scene | null                   │
│    transition(NextSceneClass, opts)             │
└─────────────────────────────────────────────────┘
                      │  (owns one)
                      ▼
┌─────────────────────────────────────────────────┐
│  Scene (abstract)                               │
│    registry: ResourceRegistry                   │
│    enter() / update() / exit()                  │
└─────────────────────────────────────────────────┘
                      △  (extends)
                ┌─────┴─────┐
        ┌──────────────┐  ┌──────────────────┐
        │ BattleScene  │  │ ExplorationScene │
        └──────────────┘  └──────────────────┘
```

### Why this fixes the bugs

- *"Element left behind"* → `exit()` destroys every owned resource. Cannot leave anything behind.
- *"Element appears later when it shouldn't"* → Tickers and timers are owned; `exit()` cancels them. Cannot fire after teardown.
- *"Browser refresh fixes it"* → `exit()` *is* the rendering-layer equivalent of refresh. Per-scene state replaces module-level state, which gets nuked on every transition.

## Resource registry & ownership model

**Insight that simplifies everything:** PIXI containers are recursive. Destroying a container with `{ children: true }` destroys all descendants. So we don't track every sprite — we track **containers** plus the ephemeral non-container things (tickers, listeners, timers, async, DOM nodes).

```js
class ResourceRegistry {
  containers   = new Set();          // PIXI containers owned by this scene
  updaters     = new Set();          // per-frame functions (run by scene.update)
  domNodes     = new Set();          // DOM elements appended by this scene
  listeners    = [];                 // { target, event, handler, options }
  timers       = new Set();          // setTimeout/setInterval IDs
  tweens       = new Set();          // active tween handles
  pendingAsync = new Set();          // AbortControllers for in-flight loads
}
```

The `Scene` exposes convenience methods that wrap creation **and** registration in one call. There is no path to add a sprite, listener, or ticker outside the scene API:

```js
scene.addContainer(parent?)        // creates Container, addChild, tracks
scene.addUpdater(fn)               // per-frame work tied to scene lifetime
scene.addListener(target, ev, fn)  // addEventListener + tracks
scene.setTimer(fn, ms)             // setTimeout + tracks (auto-untracks on fire)
scene.tween(target, to, opts)      // existing tween() + tracks
scene.loadAsset(path)              // Assets.load wrapped in AbortController
scene.addDom(node, parent)         // appendChild + tracks
```

### Disposal — one method, ordered correctly

```js
exit() {
  this.disposed = true;
  this.beforeExit?.();             // subclass hook (e.g., parallax.stop())

  registry.pendingAsync.forEach(c => c.abort());
  registry.timers.forEach(clearTimeout);
  registry.updaters.clear();       // they only ran via scene.update(), now defunct
  registry.tweens.forEach(t => t.cancel());
  registry.listeners.forEach(({target, event, handler, options}) =>
    target.removeEventListener(event, handler, options));
  registry.domNodes.forEach(n => n.remove());
  registry.containers.forEach(c => c.destroy({children: true}));

  if (DEV) assertRegistryEmpty(registry);
}
```

Order rationale:
1. Cancel async first → can't register more resources after this point.
2. Cancel timers → can't enqueue updater work.
3. Drop updaters → next frame they don't run.
4. Cancel tweens → tween system uses scene.update internally; safe to drop.
5. Remove listeners → no more event-driven work.
6. Remove DOM → visual continuity until last (helps perceived smoothness).
7. Destroy PIXI containers (recursive `{children: true}`).

### Stable lookup, not array indices

```js
class BattleScene extends Scene {
  spritesByUid = new Map();   // uid → PIXI.Sprite
  hpBarsByUid  = new Map();   // uid → DOM element
  pillsByUid   = new Map();   // uid → PIXI.Container
  vfxByUid     = new Map();   // uid → { stun?: VfxHandle, sleep?: ..., ... }

  getSprite(uid) { return this.spritesByUid.get(uid); }
}
```

All maps are registry-tracked; on `scene.exit()`, every map drops its entries and every PIXI/DOM resource is destroyed.

## Lifecycle methods & scene transitions

### Single ticker registration at app boot

Currently multiple files call `app.ticker.add(...)` directly (`battle-stage.js`, `formation.js`, `status-vfx.js`). After the refactor, **only `SceneManager` registers with `app.ticker`**:

```js
// In SceneManager.init(), called once at app boot:
app.ticker.add(dt => {
  parallax.update(dt);                                  // long-lived
  if (this.currentScene && !this.transitioning) {
    this.currentScene.update(dt);
  }
});
```

Per-scene work uses `scene.addUpdater(fn)` instead of `app.ticker.add(fn)`. The status-vfx.js bug class (function refs stored in `entry.tickerId`, never properly removed) becomes impossible: there are no tickers to leak — just updaters that only run while the scene is alive.

### Transitions are atomic

```js
async transition(NextSceneClass, opts) {
  if (this.transitioning) {
    if (DEV) throw new Error('transition already in progress');
    return; // production: ignore
  }
  this.transitioning = true;

  this.currentScene?.exit();      // synchronous, full teardown
  this.currentScene = null;

  const next = new NextSceneClass();
  try {
    await next.enter(opts);       // async — texture loads, intro animations
    this.currentScene = next;
  } catch (err) {
    next.exit();                  // clean up partial setup
    throw err;
  } finally {
    this.transitioning = false;
  }
}
```

### Three guarantees

1. **Old scene is fully dead before new one starts.** No overlap. The `creatureSprites`/`ongoingVfx` drift class can't exist because there's only ever one scene's sprites/VFX alive.
2. **Failed/aborted `enter()` can't leak.** Whatever the scene registered before throwing gets disposed by the `catch`.
3. **`update()` never runs on a dead or transitioning scene.** Two guards: `transitioning` flag in the manager, `disposed` flag on the scene that throws on any method call.

### Async safety

`scene.loadAsset(path)` returns a Promise that rejects with `SceneDisposedError` if the scene is disposed before load completes. Callers `await` normally; if disposal happens mid-load, the await throws and the caller's continuation never runs. Backed by `AbortController`.

### Who triggers transitions

Game logic, explicitly. `combat-loop.js` calls `sceneManager.transition(ExplorationScene, ...)` when combat ends. `exploration.js` calls `sceneManager.transition(BattleScene, ...)` on encounter. **No reactive subscription to `gameState`** — explicit calls are easier to trace. The current bugs come partly from implicit, scattered cleanup; we don't recreate that with implicit, scattered transitions.

## Component breakdown

### Naming collision resolution

`public/js/ui/scene.js` already exists (DOM HP bars + formation slots). The new `Scene` class needs that name (Phaser convention). Existing file → renamed to `public/js/ui/combat-dom.js`, which is more accurate for what it does.

### New files

| File | Role |
|------|------|
| `public/js/scenes/scene.js` | `Scene` base class + `ResourceRegistry` |
| `public/js/scenes/scene-manager.js` | Singleton: `currentScene`, `transition()`, drives `app.ticker` |
| `public/js/scenes/battle-scene.js` | `BattleScene extends Scene` |
| `public/js/scenes/exploration-scene.js` | `ExplorationScene extends Scene` |
| `public/js/scenes/leak-detector.js` | (Dev only) PIXI tree + ticker count sampler |

### Modified files

| File | Change | Risk |
|------|--------|------|
| `pixi/battle-stage.js` | **Split.** PIXI Application + ResizeObserver stay (renamed `pixi/app.js`). Ticker registration moves to `SceneManager`. `getStage()` retired in favor of `getApp()` + `sceneManager.currentScene.root`. | M |
| `pixi/formation.js` | **Gutted of state.** Module-level `creatureSprites`, `lastFormationInput`, `npcSprite`, `walkingEnabled`, `activeGlow` → all move into `BattleScene` or `ExplorationScene` (NPC sprite). Functions become `(scene, ...)` calls that register with the scene. | **H** |
| `pixi/status-vfx.js` | **Gutted of state.** `ongoingVfx` Map → `BattleScene.vfxByUid`. Every `app.ticker.add(onTick)` → `scene.addUpdater(onTick)`. Function refs in `entry.tickerId` go away — bug class deleted by construction. | **H** |
| `pixi/element-blasts.js` | Wrap calls to take `scene`. Tweens via `scene.tween()`. Containers via `scene.addContainer()`. | L |
| `pixi/text.js`, `pixi/banners.js` | Take parent container or scene param. Text utilities themselves unchanged. | L |
| `pixi/effects.js` | Particle pool stays long-lived (cheap reuse). On `scene.exit()`, hook returns in-flight particles to pool. Screen shake/recoil/lunge use `scene.tween()`. | M |
| `pixi/parallax.js` | New API: scenes call `parallax.start(speed)` / `parallax.stop()` in `enter()`/`beforeExit()`. Otherwise unchanged. | L |
| `ui/scene.js` → `ui/combat-dom.js` | **Renamed.** HP bar / formation slot DOM functions take `(scene, ...)`. DOM elements registered via `scene.addDom(...)`. NPC display extracted to `exploration-dom.js`. | M |
| `ui/combat-loop.js` | `cleanupCombat()` becomes `sceneManager.transition(...)`. Per-feature cleanup calls (`clearAllPixiStatusLabels`, etc.) deleted. Turn orchestration unchanged. | M |
| `ui/combat-vfx.js` | Sprite lookups route through `sceneManager.currentScene.getSprite(uid)`. HP-bar map keyed by uid. Tweens via scene. | M |
| `ui/exploration.js` | Calls `sceneManager.transition(ExplorationScene, {roomId})` on room entry. Module-level `discoveryState` and `shrineInProgress` move into `ExplorationScene`. | M |
| `ui/creature-row.js` | Document-level click listener registered via `scene.addListener(document, ...)`. Stops accumulating across module reloads. | L |
| `src/game/creatures.js` | `instantiateCreature()` assigns `creature.uid = crypto.randomUUID()`. Lazy migration on save load for legacy creatures. | M |

### Untouched

`pixi/tween.js`, `ui/move-select.js`, `ui/whack-a-mole.js`, `ui/speed-review.js`, `ui/dom-effects.js` — no PIXI lifecycle involvement.

### What we are NOT changing

- The PIXI `Application` lifetime (still one global app, lives forever).
- The DOM structure of HP bars, status icons, narration boxes — all visual output stays identical.
- The combat turn protocol with the server.
- `gameState` shape and update flow (except the `creature.uid` field addition).
- Save data format, vocab caches, audio, settings.

The refactor is **purely lifecycle plumbing**. No player-visible change is intended; if there is one, it's a regression.

## Data flow & creature instance IDs

### The uid scope expansion

`creature.id` in `src/game/creatures.js:99` is the **template/species ID** (e.g., `neko_kit`), not per-instance. Two creatures of the same species share an `id`. The recent "match by ID" fixes (109d463, b37d516) currently work only because parties don't usually duplicate — **a latent bug today.**

To make the new scene's keying mechanism actually correct:
- Add `creature.uid = crypto.randomUUID()` in `instantiateCreature()` (`src/game/creatures.js:73`).
- Lazy migration on save load: any creature without `uid` gets one assigned.
- Server-side combat state includes `uid` in serialized creatures.

This expands the spec from "pure rendering refactor" to "rendering refactor + tiny data model change". Justified: without per-instance uids, the scene's keying is built on the same sand the bugs grew out of.

### State → Scene synchronization

```
Server response → updateGameState(newState)
                       │
                       ▼
              combat-loop.js detects state change
                       │
                       ▼
       sceneManager.currentScene.syncCreatures({allies, enemies})
                       │
                       ▼
          BattleScene.syncCreatures() — diffs by uid:
              new uids       → spawn sprite + HP bar + pill containers
              removed uids   → fade-out + destroy sprite + bar + pills
              kept uids      → update HP, status flags, position
```

The scene becomes a **rendered projection of game state**. State is the source of truth; the scene reflects it via diffing. **No more index-driven array iteration.** The "server compacts allies after KO" bug class disappears because we compare uid sets, not indices.

```js
class BattleScene extends Scene {
  syncCreatures({allies, enemies}) {
    this._diff('player', allies);
    this._diff('enemy', enemies);
  }

  _diff(side, creatures) {
    const incomingUids = new Set(creatures.map(c => c.uid));

    for (const [uid, sprite] of this.spritesByUid) {
      if (sprite._side === side && !incomingUids.has(uid)) {
        this._destroyCreature(uid);  // fade-out, then destroy + remove from all maps
      }
    }

    for (const c of creatures) {
      if (this.spritesByUid.has(c.uid)) this._updateCreature(c);
      else                              this._spawnCreature(side, c);
    }
  }
}
```

### Bug classes killed by this design

- **Index drift** (109d463, b37d516): no array indices in render path; everything keyed by uid.
- **Ghost sprites after KO** (5e37226, b6b43de): KO removes uid from state → next sync diffs and destroys sprite.
- **Stale references in status VFX**: VFX handles stored by uid; when uid is destroyed, its VFX entry is destroyed in the same pass.

## Dev-mode invariants & testing

### Invariants (dev-only, stripped from production)

| Invariant | When it fires | Catches |
|-----------|---------------|---------|
| `scene.X()` after `exit()` | Any public method on a disposed scene | "Tween fires after combat ends" |
| `registry.assertEmpty()` after `exit()` | Disposal complete | Forgot to track a resource |
| `app.ticker.count` > expected baseline | Sampled in `SceneManager.tick()` after exit | Ticker added outside `scene.addUpdater()` |
| PIXI stage descendant count > expected | Sampled after exit | `app.stage.addChild()` outside scene API |
| `scene.getSprite(uid)` for unknown uid | On lookup | Stale uid in tween closure |
| `SceneManager.transition()` re-entered | While `transitioning === true` | Double-transition races |
| Two scenes alive simultaneously | Manager invariant | Structural impossibility, asserted anyway |

The registry assertions are the load-bearing safety net. The ticker/stage descendant counts are the **leak-detector**: if any code bypasses the scene API and goes straight to `app.ticker.add()`, the count assertion catches it on the next transition. **Bypass attempts become loud, not silent.**

### Testing strategy

**Tier 1 (unit):**
- `ResourceRegistry`: register all resource types, dispose, assert empty.
- `Scene` base: cannot call methods after `exit()`; failed `enter()` still cleans up.
- `SceneManager`: refuses concurrent transitions; failed transition leaves no scene active.

**Tier 2 (integration, runs in CI):**
- **Combat lifecycle smoke test**: programmatically construct `BattleScene`, `enter()` with mock allies/enemies, simulate 5 turns of move use + status apply + KO, `exit()`, assert `scene.registry` is empty and PIXI/ticker counts return to baseline.
- **Exploration lifecycle smoke test**: same shape for `ExplorationScene` with NPC sprite show/hide.
- **Cross-scene transition test**: run `BattleScene → ExplorationScene → BattleScene → ExplorationScene` × 5 cycles, assert no PIXI/DOM/ticker leaks accumulate. **This is the test that would have caught every recent firefighting bug.**
- **Failed-enter recovery**: induce `Assets.load` failure mid-`enter()`, assert scene is fully cleaned up.

**Tier 3 (Playwright, on-demand):**
- 10-encounter playthrough script with JS-injected leak assertion after each transition.

### Dev overlay (settings-toggled)

A debug HUD showing current scene name, registry sizes (containers/updaters/listeners/timers/etc.), and a leak-warning badge if counts grow without exit between transitions. Helps during manual playtesting — leaks become visible the moment they happen, not three weeks later in a player report.

**Toggled via the in-game settings menu**, not a hotkey. The setting persists across sessions. The HUD itself is lightweight (samples values that exist in production builds anyway: registry sizes, scene name) so it can ship to production for power users / developers, default off. The throw-on-violation invariants remain dev-only.

## Migration approach

**Big bang in a worktree** (per CLAUDE.md worktree workflow):

```bash
git worktree add ../koto-wt-bulletproof-render -b feature/scene-controller
cd ../koto-wt-bulletproof-render
```

Single worktree, single PR when complete. Estimated 2 weeks of focused work. The dev-mode invariants from Section 6 + Tier 1/2 tests are the safety net for the big-bang merge.

The implementation plan (next document) will sequence the work into independently-verifiable steps within the worktree, each with a runnable test gate.

## Backwards compatibility

- **Save data** unchanged in shape. Lazy `uid` migration runs on load for any creature missing the field.
- **Server API** unchanged except serialized creatures now include `uid`.
- **Vocab caches, audio, settings, dialogue, item data** untouched.
- **Production behavior** identical to today minus the bug classes. No player-visible UI change is intended.

## Out of scope (deliberate)

- Reactive subscription system to `gameState` (explicit `syncCreatures()` is easier to debug).
- Refactoring non-PIXI/DOM systems (audio, vocab cache, settings).
- Rewriting `move-select.js`, `whack-a-mole.js`, `speed-review.js` — already self-contained.
- ECS-style component architecture (rejected as too heavy for the actual problem).
- Switching to Phaser (rejected; it's a renderer swap, not a thin layer).
- Running the throw-on-violation invariants in production (the dev-only assertions from the table above). The HUD display itself is allowed in production behind the settings toggle since it only samples values, but the assertions that throw on violation are stripped from production builds.

## Open questions

1. **Where does the "settings" UI live for the dev overlay toggle?** Need to confirm the existing settings menu module path (`/api/settings` is the endpoint, but the client UI module isn't pinned in the spec).
2. **Server-side serialization of `uid`**: confirm the API layer in `server.js` passes `uid` through unchanged on combat state responses.
3. **PvP-specific scene class?** The spec assumes `BattleScene` covers both PvE and PvP. If they diverge in setup needs, may want `BattleScenePvP extends BattleScene`. Defer until implementation reveals divergence.

## References

- [Phaser Scene Lifecycle (DeepWiki)](https://deepwiki.com/phaserjs/phaser/3.1-scene-lifecycle) — the canonical pattern we're borrowing
- [PixiJS Discussion #7205 — ECS architecture](https://github.com/pixijs/pixijs/discussions/7205) — confirmation that PixiJS is unopinionated
- Recent firefighting commits: 109d463, b37d516, 5e37226, 40df18a, 196542a, b6b43de
- Source files cited throughout: `pixi/formation.js`, `pixi/status-vfx.js`, `ui/scene.js`, `ui/combat-loop.js`, `src/game/creatures.js`
