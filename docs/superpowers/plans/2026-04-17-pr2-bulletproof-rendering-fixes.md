# PR #2 Bulletproof Rendering — Structural Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship structural fixes for the 7 bugs in `docs/pr2-bulletproof-rendering-smoke-test.md` so every visible game phase has an active scene, NPC interjection mid-combat routes through an explicit scene API, disposed scenes can't receive stale calls, and the inspector catches sprite regressions outside combat.

**Architecture:** The root cause across 6 of 7 bugs is "some phases have no active scene mounted," so scene-routed calls silently no-op. Fix order: (1) unblock testing by patching the dangling `pixiShowNpcSprite` reference, (2) introduce a `HubScene` that owns `background + npcs + creatures + labels` layers and mount it for prologue/hub/area_selection/skillMaster phases, (3) remove the silent bails that hid these regressions (convert to `console.error`), (4) add `pauseForNpcInterjection`/`resumeFromNpcInterjection` on the `Scene` base class and wire befriend tutorial steps through them, (5) guard `creature-row.render` against disposed scenes and audit other trailing callers, (6) extend the `inspector` to cover non-combat formations and NPC sprites.

**Tech Stack:** Vanilla ES module JS on the client, PixiJS 8 scene layers, node:test (Tier 1 + Tier 2) with `--experimental-test-module-mocks`, Playwright MCP for the manual re-test gate.

---

## Context

The smoke-test bug report (`docs/pr2-bulletproof-rendering-smoke-test.md`) traces 7 bugs to two recent commits:
- `f09885ee feat(scenes): wire ExplorationScene into room flow + encounter (17)`
- `42996496 cleanup(pixi): delete legacy _defaultCtx rendering path (18)`

These commits completed the "scenes own rendering" refactor for combat and room flow but left four phases (`no_save`/prologue, `hub`, `area_selection`, `skillMaster`) without any active scene. All DOM side-effect paths that used to coexist with the legacy `_defaultCtx` now delegate to `getSceneManager().currentScene.X(...)` and bail silently when the scene is null. Where there's no scene, there's no rendering — which is how Cid and the fire creature turned invisible.

Commit `42996496` also left one dangling reference: `public/js/ui/exploration-dom.js:133` still calls `pixiShowNpcSprite(...)`, which was deleted in that commit. This throws on every friendly NPC room entry. Once a save lands in a friendly NPC room, every refresh throws the same ReferenceError, soft-locking the run — hence the blocker severity.

The common structural fix is "always have a scene." This plan adds a `HubScene` mounted from boot and on phase transitions so every visible phase has somewhere to place sprites. With that guarantee in place, the silent bails can be converted to `console.error` so future regressions fail loudly.

The befriend tutorial side-effect chain (`showNpcInDisplay('Cid', ..., { skipPixi: true })` → assumes `hideFormation('enemy')` also hides the Pixi enemy sprite) is a second-order problem: the DOM/Pixi lifecycle split broke the stale contract without replacing it. The fix is an explicit `scene.pauseForNpcInterjection()`/`resumeFromNpcInterjection()` pair that the befriend flow drives directly.

Finally, the inspector pipeline (`[CHK] ✓`/`[CHK] ✗`) only runs checks in combat phase; outside combat it returns `ok: true` with zero-value summaries. This is why bugs #1 and #3 slipped through the "run Playwright, watch intent log" test gate. Extending the inspector to cover non-combat phases and NPC sprites is the single highest-leverage diagnostic fix in this plan.

---

## File Structure

**New files:**

- `public/js/scenes/hub-scene.js` — lightweight `Scene` subclass with `background + npcs + creatures + labels` layers; mounted during boot, prologue, hub, area_selection, skillMaster phases. Owns a formation ctx (via `createFormationContext`) so `creature-row.render` can place player sprites for `skillMaster`.
- `tests/unit/scenes/hub-scene.test.js` — unit tests for HubScene instantiation, layer presence, dispose cleanup.
- `tests/unit/ui/exploration-dom.test.js` — unit tests covering `showNpcTrainer` (no more ReferenceError), `showNpcInDisplay` (no longer clears DOM when no scene is active).

**Modified files:**

- `public/js/ui/exploration-dom.js` — remove dangling `pixiShowNpcSprite` reference (Bug #2); convert silent bail in `sceneShowNpc` to `console.error`.
- `public/js/ui/creature-row.js:163-181` — add `scene.disposed` and `scene.entered` guards in `render()`; convert the silent `if (!scene?.syncCreatures) return` to `console.error` (Bug #7).
- `public/js/ui/combat-dom.js` — add reveal-on-reuse safety in `showFormation`: when a sprite already exists on the active scene and is not entering, call `revealFormationInfo` explicitly (belt-and-braces for Bug #6).
- `public/js/scenes/scene.js` — add `pauseForNpcInterjection({ fadeEnemies, fadeAllies } = {})` and `resumeFromNpcInterjection()` to the `Scene` base class. Fades the per-side `formation.{player,enemy}Container` opacity via `scene.tween`. Stores pre-pause state so resume restores exactly what pause changed.
- `public/js/ui/befriend.js:384-414` and `befriend.js:466-486` — replace the `showNpcInDisplay(..., { skipPixi: true })` + manual `showNpcSprite` chain with an explicit `pauseForNpcInterjection` + `showNpcSprite` + `hideNpcSprite` + `resumeFromNpcInterjection` sequence (Bugs #5, #6).
- `public/game.js` — (a) mount HubScene at boot after `SceneManager.init()`, before `loadGameState()`; (b) add `ensureSceneForPhase(phase)` helper called from `updateScene()` that transitions to the right scene class for each phase; (c) wrap the inspector's `getPixiSprites` closure so it also exposes `getNpcSprites(phase)`; (d) rewire `playPrologue()` to run against the active HubScene rather than calling `scene.showCid()` (the DOM-only function).
- `public/js/inspector.js` — extend `checkCreatures` to cover non-combat phases (rename internal to `checkSprites`; expose both names during migration). Add NPC sprite counting to `fullScan`. Make "formation shown but zero Pixi sprites placed" an automatic `DOM_GHOST` mismatch.
- `tests/unit/ui/inspector.test.js` — add non-combat phase tests; cover the new `DOM_GHOST` detection path.
- `tests/unit/ui/befriend.test.js` — add pause/resume invocation test for tutorial step 1.
- `tests/unit/scenes/scene.test.js` — add pauseForNpcInterjection / resumeFromNpcInterjection coverage.
- `docs/pr2-bulletproof-rendering-smoke-test.md` — append "Fixes applied" section at the bottom once the full plan lands.

---

## Pre-flight — Worktree and branch

All tasks below assume you're in a dedicated worktree. Verify first.

- [ ] **Step 1: Verify you're in a dedicated worktree (not the main repo)**

Run: `/usr/bin/git rev-parse --show-toplevel`

Expected: a path containing `-wt-` (e.g. `/Users/michia/Documents/koto-wt-pr2-fixes`). If it's the main repo (`/Users/michia/Documents/Claude Projects/Koto2`), create a worktree:

```bash
cd "/Users/michia/Documents/Claude Projects/Koto2"
/usr/bin/git pull origin master
/usr/bin/git fetch origin
/usr/bin/git worktree add ../koto-wt-pr2-fixes -b fix/pr2-bulletproof-rendering
cd ../koto-wt-pr2-fixes
npm install
```

- [ ] **Step 2: Confirm tests pass on the fresh worktree before touching anything**

Run: `npm test`

Expected: green. If red, stop and fix the baseline before starting — you won't be able to tell which of your changes broke anything otherwise.

---

## Task 1: Fix Bug #2 — dangling `pixiShowNpcSprite` reference (save-state unblock)

**Files:**
- Modify: `public/js/ui/exploration-dom.js:133`
- Test: `tests/unit/ui/exploration-dom.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ui/exploration-dom.test.js`:

```js
import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- DOM stubs --------------------------------------------------------------
const domStub = {
  npcDisplay:    { classList: { add() {}, remove() {}, contains: () => false } },
  enemyName:     { textContent: '', innerHTML: '' },
  enemyInfo:     { classList: { add() {}, remove() {} } },
  enemyHpBar:    { style: { display: '' } },
  enemySkillBar: { innerHTML: '', style: { display: '' } },
  enemySprite:   { src: '', classList: { add() {}, remove() {} }, onerror: null, onload: null },
  playerFormation: { innerHTML: '', style: { opacity: '' }, querySelectorAll: () => [] },
  enemyFormation:  { innerHTML: '', style: { opacity: '' }, querySelectorAll: () => [] },
};

await mock.module('../../../public/js/dom.js', { namedExports: { dom: domStub } });
await mock.module('../../../public/js/ui/sprite-utils.js', { namedExports: { SPRITE_VERSION: 'test' } });
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: () => '',
    getKnownWords: () => new Set(),
    entityToToken: (x) => x,
    esc: (s) => s,
  },
});
await mock.module('../../../public/js/ui/combat-dom.js', {
  namedExports: { hideFormation: () => {}, hideEnemy: () => {} },
});
// getSceneManager returns null so we hit the "no scene" path — this is the
// exact path that was throwing the ReferenceError on production.
let sceneRef = null;
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => ({ currentScene: sceneRef }) },
});

const { showNpcTrainer } = await import('../../../public/js/ui/exploration-dom.js');

describe('showNpcTrainer', () => {
  beforeEach(() => { sceneRef = null; });

  it('does not throw ReferenceError when called with skipPixi: false and no scene mounted', () => {
    assert.doesNotThrow(() =>
      showNpcTrainer('Boy', 'boy-1', { role: 'trainer' }, { skipPixi: false })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails with the expected error**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/exploration-dom.test.js`

Expected: FAIL with `ReferenceError: pixiShowNpcSprite is not defined` (or equivalent — this reproduces the production bug).

- [ ] **Step 3: Fix the dangling reference**

In `public/js/ui/exploration-dom.js`, change line 133:

```js
    pixiShowNpcSprite(spritePath);
```

to:

```js
    sceneShowNpc(spritePath);
```

(Function `sceneShowNpc` is already defined at line 13 of the same file — the cleanup commit `42996496` missed this one call site.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/exploration-dom.test.js`

Expected: PASS.

- [ ] **Step 5: Run full unit suite to catch collateral damage**

Run: `npm run test:unit`

Expected: all green.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add public/js/ui/exploration-dom.js tests/unit/ui/exploration-dom.test.js
/usr/bin/git commit -m "fix(exploration-dom): replace dangling pixiShowNpcSprite with sceneShowNpc

Unblocks save-state soft-lock in friendly NPC rooms. Completes the
cleanup sweep commit 42996496 left half-done.

Fixes Bug #2 from docs/pr2-bulletproof-rendering-smoke-test.md."
```

---

## Task 2: Create `HubScene` class (always-on-scene infrastructure)

**Files:**
- Create: `public/js/scenes/hub-scene.js`
- Test: `tests/unit/scenes/hub-scene.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scenes/hub-scene.test.js`:

```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeContainer {
  constructor() { this.children = []; this.parent = null; this._destroyed = false; this.visible = true; }
  addChild(c) { this.children.push(c); c.parent = this; return c; }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    if (c.parent === this) c.parent = null;
    return c;
  }
  removeChildren() { for (const c of this.children) { if (c.parent === this) c.parent = null; } this.children = []; }
  destroy() { this._destroyed = true; }
}

await mock.module('pixi.js', { namedExports: { Container: FakeContainer } });
await mock.module('../../../public/js/pixi/parallax.js', {
  namedExports: { startParallax: () => {}, stopParallax: () => {} },
});
await mock.module('../../../public/js/pixi/formation.js', {
  namedExports: {
    createFormationContext: (scene) => ({
      scene,
      playerContainer: scene.addContainer(new FakeContainer(), scene.layers.formations),
      enemyContainer: scene.addContainer(new FakeContainer(), scene.layers.formations),
      creatureSprites: { player: new Map(), enemy: new Map() },
      lastFormationInput: { player: null, enemy: null },
      walkingEnabled: false,
      walkTime: 0,
    }),
    _updateFormations: () => {},
    spawnFormationSprite: async () => null,
    removeFormationSprite: () => {},
    updateFormationSprite: () => {},
  },
});
await mock.module('../../../public/js/ui/creature-row.js', {
  namedExports: { setupCreatureRowListeners: () => {} },
});

const { HubScene } = await import('../../../public/js/scenes/hub-scene.js');

function makeFakeApp() {
  return {
    ticker: { add() {}, remove() {} },
    stage: new FakeContainer(),
    screen: { width: 400, height: 600 },
  };
}

describe('HubScene', () => {
  it('exposes background, npcs, formations, labels layers', () => {
    const scene = new HubScene(makeFakeApp());
    assert.ok(scene.layers.background, 'background layer present');
    assert.ok(scene.layers.npcs,       'npcs layer present');
    assert.ok(scene.layers.formations, 'formations layer present');
    assert.ok(scene.layers.labels,     'labels layer present');
    scene.exit();
  });

  it('syncCreatures is callable (delegates to formation ctx)', async () => {
    const scene = new HubScene(makeFakeApp());
    await scene.enter({ allies: [] });
    await assert.doesNotReject(() => scene.syncCreatures({ allies: [] }));
    scene.exit();
  });

  it('dispose clears scene.npcSprite and marks disposed', async () => {
    const scene = new HubScene(makeFakeApp());
    await scene.enter({ allies: [] });
    scene.exit();
    assert.strictEqual(scene.disposed, true);
    assert.strictEqual(scene.npcSprite, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-test-module-mocks --test tests/unit/scenes/hub-scene.test.js`

Expected: FAIL with "Cannot find module '.../hub-scene.js'".

- [ ] **Step 3: Implement HubScene**

Create `public/js/scenes/hub-scene.js`:

```js
import { Scene } from './scene.js';
import { Container } from 'pixi.js';
import {
  createFormationContext,
  spawnFormationSprite,
  removeFormationSprite,
  updateFormationSprite,
  _updateFormations,
} from '../pixi/formation.js';
import { setupCreatureRowListeners } from '../ui/creature-row.js';

/**
 * Lightweight scene mounted for phases that have no dedicated scene of their
 * own: boot / no_save / prologue / hub / area_selection / skillMaster.
 *
 * Exists to satisfy the PR-#2 invariant "there is always an active scene."
 * Provides the same layer surface as BattleScene / ExplorationScene so
 * showNpcSprite() and syncCreatures() calls route somewhere real instead of
 * bailing silently.
 *
 * Exploration-style player formation (wobble animation on) so the skillMaster
 * tutorial sees the fire creature sprite render next to its HP bar.
 */
export class HubScene extends Scene {
  constructor(app) {
    super('HubScene', app);

    this.layers = {
      background: this.addContainer(new Container(), app.stage),
      formations: this.addContainer(new Container(), app.stage),
      npcs:       this.addContainer(new Container(), app.stage),
      labels:     this.addContainer(new Container(), app.stage),
    };

    this.spritesByUid = new Map();
    this.formation = createFormationContext(this);
  }

  async onEnter({ allies = [] } = {}) {
    await this.syncCreatures({ allies, initial: true });
    this.formation.walkingEnabled = true;
    this.addUpdater((dt) => _updateFormations(this.formation, dt));
    setupCreatureRowListeners(this);
  }

  beforeExit() {
    this.spritesByUid.clear();
  }

  getSprite(uid) { return this.spritesByUid.get(uid); }

  async syncCreatures({ allies = [], initial = false } = {}) {
    this._guard('syncCreatures');
    await this._diff('player', allies, initial);
  }

  async _diff(side, creatures, _initial) {
    this._guard('_diff');
    const incomingUids = new Set(creatures.map(c => c.uid));
    const sideMap = this.formation.creatureSprites[side];

    for (const uid of [...sideMap.keys()]) {
      if (!incomingUids.has(uid)) {
        removeFormationSprite(this.formation, side, uid);
        this.spritesByUid.delete(uid);
      }
    }

    const slotFor = (i, total) => {
      if (total === 1) return 1;
      if (total === 2) return i === 0 ? 0 : 2;
      return i;
    };

    const total = creatures.length;
    const spawnPromises = [];
    for (let i = 0; i < total; i++) {
      const c = creatures[i];
      const slotI = slotFor(i, total);
      const opts = { slotI, isBoss: false, skipEnter: true };
      if (sideMap.has(c.uid)) {
        updateFormationSprite(this.formation, side, c, i, opts);
      } else {
        spawnPromises.push(
          spawnFormationSprite(this.formation, side, c, i, opts)
            .then(sprite => { if (sprite) this.spritesByUid.set(c.uid, sprite); })
            .catch(err => { console.error(`[HubScene] spawn failed for ${side}[${i}] uid=${c.uid}:`, err); })
        );
      }
    }
    await Promise.all(spawnPromises);

    this.formation.lastFormationInput[side] = { creatures, opts: { isBoss: false } };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-test-module-mocks --test tests/unit/scenes/hub-scene.test.js`

Expected: PASS (3 tests).

- [ ] **Step 5: Run the full unit suite**

Run: `npm run test:unit`

Expected: all green.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add public/js/scenes/hub-scene.js tests/unit/scenes/hub-scene.test.js
/usr/bin/git commit -m "feat(scenes): add HubScene for phases without a dedicated scene

HubScene is mounted for boot/prologue/hub/area_selection/skillMaster
phases so scene-routed rendering calls (showNpcSprite, syncCreatures)
have somewhere to write. Mirrors ExplorationScene's layer layout but
exposes the same npcs/formations/labels surface the base Scene class
expects.

Groundwork for Bugs #1 and #3 (no visible sprite on prologue/skill
master)."
```

---

## Task 3: Mount HubScene at boot + on phase transitions (wire-up)

**Files:**
- Modify: `public/game.js:338-505` (updateUI/updateScene), `public/game.js:1652-1664` (boot wire-up)

- [ ] **Step 1: Read the current `updateScene` and boot sequence**

Open `public/game.js` and reread lines `1648-1665` (SceneManager init) and `431-505` (updateScene). Confirm the plan below still matches the real function layout; if not, flag it and stop.

- [ ] **Step 2: Import HubScene and ExplorationScene at the top of game.js**

Find line 135 (`import { BattleScene } from './js/scenes/battle-scene.js';`) and replace it with:

```js
import { BattleScene } from './js/scenes/battle-scene.js';
import { ExplorationScene } from './js/scenes/exploration-scene.js';
import { HubScene } from './js/scenes/hub-scene.js';
```

- [ ] **Step 3: Add the `ensureSceneForPhase` helper**

Insert this new function immediately after `syncBattleStageParallax()` ends (find `function syncBattleStageParallax` then its closing `}` — currently around line 332):

```js
/**
 * Guarantees every visible phase has an active scene. Called from
 * updateScene() on every updateUI(). Idempotent — skips the transition if
 * the correct scene class is already mounted. Throws are caught and logged
 * so a transient scene bug can't hang UI updates.
 *
 * Phase → scene mapping:
 *   no_save, hub, area_selection, skillMaster, whackAMole, shrine, quiz,
 *   wordDiscovery, speedReviewRoom, dealer, friendlyNpc, npc_skill_selection,
 *   npc_dialogue                → HubScene (or the existing ExplorationScene
 *                                 if we're mid-room). HubScene is used when
 *                                 no run is active; ExplorationScene takes
 *                                 over once rooms begin.
 *   exploring, room, room_encounter, post_combat_shop → ExplorationScene (mounted by room-transition.js)
 *   combat                      → BattleScene (mounted by combat-loop.js / startEncounter)
 */
async function ensureSceneForPhase(phase) {
  const mgr = getSceneManager();
  if (!mgr || mgr.transitioning) return;

  const current = mgr.currentScene;
  const hubPhases = new Set([
    'no_save', 'hub', 'area_selection', 'skillMaster',
  ]);

  // Phases that mount their own scenes elsewhere — don't clobber them here.
  const skipPhases = new Set([
    'combat', 'exploring', 'room', 'room_encounter', 'post_combat_shop',
    'friendlyNpc', 'whackAMole', 'dealer', 'shrine', 'quiz',
    'wordDiscovery', 'speedReviewRoom', 'npc_skill_selection', 'npc_dialogue',
  ]);

  if (hubPhases.has(phase) && !(current instanceof HubScene)) {
    try {
      const allies = gameState.run?.creatureParty?.active ?? [];
      await mgr.transition(HubScene, { allies });
    } catch (err) {
      console.error('[ensureSceneForPhase] HubScene transition failed', err);
    }
    return;
  }

  // For skipPhases, the relevant scene transition is owned by the code path
  // that drives the phase (e.g. combat-loop.startCombatLoop, room-transition).
  // If a user somehow lands in one of these phases with no scene mounted
  // (e.g. page refresh into a stale friendlyNpc state), fall back to HubScene
  // so at minimum the scene-routed calls don't silently bail.
  if (skipPhases.has(phase) && !current) {
    try {
      const allies = gameState.run?.creatureParty?.active ?? [];
      await mgr.transition(HubScene, { allies });
    } catch (err) {
      console.error('[ensureSceneForPhase] fallback HubScene transition failed', err);
    }
  }
}
```

- [ ] **Step 4: Call `ensureSceneForPhase` from `updateScene`**

Find `function updateScene()` (currently line 431) and add the call at the very top, before the phase-switch:

```js
function updateScene() {
  if (gameState.phase !== 'npc_dialogue') npcDialogueRecoveryDone = false;
  if (gameState.phase !== 'combat') combatRecoveryDone = false;
  if (gameState.phase !== 'post_combat_shop') postCombatShopRecoveryDone = false;

  // Guarantee an active scene exists for the current phase. Fire-and-forget:
  // the transition resolves on its own; subsequent updateScene calls are
  // idempotent so the eventual consistency is fine for DOM-side work.
  void ensureSceneForPhase(gameState.phase);

  if (gameState.phase === 'combat') {
    // ...existing body unchanged...
```

- [ ] **Step 5: Mount HubScene at boot (before `loadGameState()`)**

Find the SceneManager init block at line 1652 (`const sceneManager = new SceneManager(pixiApp);`). After the existing `setSceneManager(sceneManager);` call (line 1663), add:

```js
    setSceneManager(sceneManager);

    // Mount HubScene at boot so phases with no run (no_save, hub) render
    // correctly from the first frame. Later phases re-use this scene or
    // transition to ExplorationScene / BattleScene as they activate.
    try {
      await sceneManager.transition(HubScene, { allies: [] });
    } catch (err) {
      console.error('[boot] HubScene initial transition failed', err);
    }
```

- [ ] **Step 6: Syntax check**

Run: `node --check public/game.js && echo "OK"`

Expected: `OK`.

- [ ] **Step 7: Start dev server and verify boot**

Run: `npm run dev`

Wait 5 seconds, then in a separate terminal:

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`

Expected: `200`.

Ask the user before launching Playwright (see CLAUDE.md — don't launch blindly). If approved, navigate to `http://localhost:5173`, log in, and confirm:
- Hub loads with its usual UI — no console errors.
- `window.__sceneManager?.currentScene?.name === 'HubScene'` (run in console via Playwright `browser_evaluate`).

- [ ] **Step 8: Run unit suite**

Run: `npm run test:unit`

Expected: all green.

- [ ] **Step 9: Commit**

```bash
/usr/bin/git add public/game.js
/usr/bin/git commit -m "feat(scenes): mount HubScene at boot + ensure scene per phase

Every phase now has an active scene. ensureSceneForPhase() is called
from updateScene() and transitions to HubScene when the current phase
needs one; battle/exploration/etc. phases keep their existing
transition owners.

Fixes the 'no scene mounted' half of Bugs #1 and #3 (Cid + fire
creature missing during prologue and skillMaster)."
```

---

## Task 4: Route prologue NPC through the active HubScene (Bug #1 Cid visible)

**Files:**
- Modify: `public/game.js:747-840` (playPrologue)

- [ ] **Step 1: Read the current prologue flow**

Reread `public/game.js:747-840`. The prologue calls `scene.showCid()` (which is `explorationDom.showCid`) — that function calls `showNpcInDisplay` which calls `sceneShowNpc` which currently bails silently when no scene has an `npcs` layer. With Task 3 done, HubScene is now active, so `sceneShowNpc` will place the sprite on HubScene's `npcs` layer automatically.

No rewrite is required — verify end-to-end via Playwright. The DOM side is already present; the only thing missing pre-Task-3 was the Pixi scene.

- [ ] **Step 2: Add a belt-and-braces assertion at prologue entry**

Insert immediately after `actions.clear();` in `playPrologue()` (currently line 754):

```js
  // Guardrail: prologue assumes an active scene with an npcs layer.
  // ensureSceneForPhase() on the previous updateUI() should have mounted
  // HubScene already; this is a fast-fail check so a regression in the scene
  // wire-up surfaces as a console error instead of an invisible Cid.
  const prologueScene = getSceneManager()?.currentScene;
  if (!prologueScene || prologueScene.disposed || !prologueScene.layers?.npcs) {
    console.error('[playPrologue] no scene with npcs layer mounted — Cid will be invisible');
  }
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/game.js && echo "OK"`

Expected: `OK`.

- [ ] **Step 4: Playtest — prologue**

Ask the user before launching Playwright. If approved:
1. Clear any cookies / log out + log in as a fresh account (or use a test user with no run).
2. Navigate to `http://localhost:5173`, let the prologue play.
3. Confirm Cid's sprite renders above the narration box throughout the prologue, including the English "Do you understand me NOW?" line.
4. Confirm console shows zero errors. The belt-and-braces warning should NOT fire.
5. Take a screenshot (`browser_take_screenshot`), review visually, then `rm` the screenshot file.

Expected: Cid visible throughout the prologue (Bug #1 fixed).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/game.js
/usr/bin/git commit -m "feat(scenes): assert active scene on prologue entry

Adds a fast-fail guardrail that logs if playPrologue() runs without
an active scene. With HubScene now mounted at boot (Task 3), Cid's
sprite renders correctly through sceneShowNpc on HubScene.layers.npcs.

Fixes Bug #1 from docs/pr2-bulletproof-rendering-smoke-test.md."
```

---

## Task 5: SkillMaster / pre-combat creature sprite visible (Bug #3 resolution)

**Files:**
- No code edits beyond Tasks 2-3. This task is a verification + regression test gate.
- Test: `tests/unit/scenes/hub-scene.test.js` (extend)

- [ ] **Step 1: Add a regression test that HubScene.syncCreatures places a sprite**

In `tests/unit/scenes/hub-scene.test.js`, inside the existing `describe('HubScene', ...)` block, add:

```js
  it('syncCreatures with one ally records it in spritesByUid via formation ctx', async () => {
    // Intercept spawnFormationSprite so we don't rely on Pixi asset loading.
    // The real formation.spawnFormationSprite returns a Sprite; we return a
    // sentinel so the test asserts the plumbing, not the rendering.
    const sentinel = { _uid: 'hi-1' };
    await mock.module('../../../public/js/pixi/formation.js', {
      namedExports: {
        createFormationContext: (scene) => ({
          scene,
          playerContainer: scene.addContainer(new FakeContainer(), scene.layers.formations),
          enemyContainer: scene.addContainer(new FakeContainer(), scene.layers.formations),
          creatureSprites: { player: new Map(), enemy: new Map() },
          lastFormationInput: { player: null, enemy: null },
          walkingEnabled: false,
          walkTime: 0,
        }),
        _updateFormations: () => {},
        spawnFormationSprite: async () => sentinel,
        removeFormationSprite: () => {},
        updateFormationSprite: () => {},
      },
    });
    const { HubScene: HS } = await import(`../../../public/js/scenes/hub-scene.js?v=${Date.now()}`);
    const scene = new HS(makeFakeApp());
    await scene.enter({ allies: [{ uid: 'hi-1', id: 'hi', hp: 10, maxHp: 10 }] });
    assert.strictEqual(scene.spritesByUid.size, 1, 'sprite recorded');
    assert.strictEqual(scene.spritesByUid.get('hi-1'), sentinel);
    scene.exit();
  });
```

- [ ] **Step 2: Run the test**

Run: `node --experimental-test-module-mocks --test tests/unit/scenes/hub-scene.test.js`

Expected: PASS (4 tests now).

- [ ] **Step 3: Playtest — skillMaster tutorial**

Ask the user before launching Playwright. If approved:
1. Use a save where prologue is done but the first skillMaster pick hasn't happened yet, or start a fresh account and advance through prologue to the Starting Meadow skill master.
2. Confirm Cid's sprite renders alongside her narration box.
3. Confirm the fire creature sprite (`hi`) renders below/beside its HP bar on the meadow background.
4. In the console: `window.__inspector.fullScan()` — after Task 10 this will return a non-trivial summary; for now just confirm zero console errors.
5. Take a screenshot, review, then `rm` it.

Expected: Both Cid and fire creature visible on Starting Meadow (Bug #3 fixed).

- [ ] **Step 4: Commit the test**

```bash
/usr/bin/git add tests/unit/scenes/hub-scene.test.js
/usr/bin/git commit -m "test(scenes): HubScene.syncCreatures records sprites by uid

Regression test for Bug #3 — player fire creature not rendered during
the skillMaster tutorial phase. With HubScene active, the existing
creature-row.render() path drives scene.syncCreatures which reaches
this spawn plumbing."
```

---

## Task 6: Remove silent bails — make missing-scene regressions loud

**Files:**
- Modify: `public/js/ui/exploration-dom.js:13-20` (sceneShowNpc)
- Modify: `public/js/ui/creature-row.js:163-181` (render)

- [ ] **Step 1: Write the failing test for loud-fail on missing scene**

Append to `tests/unit/ui/exploration-dom.test.js`:

```js
describe('sceneShowNpc', () => {
  it('logs an error when called with no active scene (missed HubScene invariant)', async () => {
    sceneRef = null; // no active scene
    const errors = [];
    const origErr = console.error;
    console.error = (...a) => errors.push(a);
    try {
      // showCid() exercises sceneShowNpc internally via showNpcInDisplay.
      const { showCid } = await import(`../../../public/js/ui/exploration-dom.js?v=${Date.now()}`);
      showCid();
    } finally {
      console.error = origErr;
    }
    assert.ok(
      errors.some(e => /sceneShowNpc.*no.*scene|active scene/i.test(String(e[0]))),
      'expected a loud error about missing active scene'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/exploration-dom.test.js`

Expected: FAIL — current `sceneShowNpc` bails silently with no log.

- [ ] **Step 3: Convert silent bail to console.error in `sceneShowNpc`**

In `public/js/ui/exploration-dom.js`, replace lines 13-20 with:

```js
function sceneShowNpc(spritePath) {
  const scene = getSceneManager()?.currentScene;
  if (!scene || scene.disposed || !scene.layers?.npcs) {
    // With HubScene mounted at boot (PR2 fix), there should always be a
    // scene with an npcs layer. If we hit this branch it's a regression in
    // ensureSceneForPhase() or a mid-transition window. Fail loudly instead
    // of rendering an invisible NPC.
    console.error('[exploration-dom] sceneShowNpc: no active scene with npcs layer — sprite will not render', { spritePath });
    return;
  }
  scene.showNpcSprite(spritePath).catch(err => {
    console.warn('[exploration-dom] scene.showNpcSprite failed:', err);
  });
}
```

- [ ] **Step 4: Write a similar failing test for creature-row.render**

Create `tests/unit/ui/creature-row-no-scene.test.js`:

```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const domStub = {
  playerFormation: { innerHTML: '', style: { opacity: '' }, querySelectorAll: () => [] },
  enemyFormation:  { innerHTML: '', style: { opacity: '' }, querySelectorAll: () => [] },
  creaturePopup:   { innerHTML: '', classList: { add() {}, remove() {} }, style: {} },
};

await mock.module('../../../public/js/dom.js', { namedExports: { dom: domStub } });
await mock.module('../../../public/js/ui/combat-dom.js', {
  namedExports: { showFormation: () => {}, hideFormation: () => {} },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: { renderJpSentence: () => '', getKnownWords: () => new Set(), entityToToken: (x) => x },
});
let initialized = false;
let sceneRef = null;
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: {
    getSceneManager: () => ({ currentScene: sceneRef }),
    isSceneManagerInitialized: () => initialized,
  },
});

const { render } = await import('../../../public/js/ui/creature-row.js');

describe('creature-row.render scene guards', () => {
  it('silently does nothing when scene manager not initialized (expected boot phase)', () => {
    initialized = false;
    assert.doesNotThrow(() => render([{ id: 'hi', uid: 'hi-1' }]));
  });

  it('logs error when scene manager is initialized but has no current scene', () => {
    initialized = true;
    sceneRef = null;
    const errors = [];
    const origErr = console.error;
    console.error = (...a) => errors.push(a);
    try { render([{ id: 'hi', uid: 'hi-1' }]); } finally { console.error = origErr; }
    assert.ok(
      errors.some(e => /creature-row.*no.*scene/i.test(String(e[0]))),
      'expected loud error about missing scene'
    );
  });

  it('does not call disposed scene syncCreatures', () => {
    initialized = true;
    let syncCalled = false;
    sceneRef = {
      disposed: true,
      entered: true,
      syncCreatures: async () => { syncCalled = true; },
      formation: { lastFormationInput: {} },
    };
    const errors = [];
    const origErr = console.error;
    console.error = (...a) => errors.push(a);
    try { render([{ id: 'hi', uid: 'hi-1' }]); } finally { console.error = origErr; }
    assert.strictEqual(syncCalled, false, 'disposed scene should not receive syncCreatures');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/creature-row-no-scene.test.js`

Expected: FAIL (silent bail on all three cases).

- [ ] **Step 6: Update creature-row.render with loud-fail + disposed guard**

In `public/js/ui/creature-row.js`, replace lines 163-181 with:

```js
export function render(creatures) {
  _creatures = creatures;
  currentActiveCreatures = creatures || [];
  showFormation('player', creatures);

  // Scene-aware Pixi sync. With HubScene mounted at boot (PR2 fix), a scene
  // should always be available once the scene manager finishes init. The
  // guards below distinguish legitimate pre-init calls (silent) from
  // regressions (loud) so missing sprites surface as console.error instead of
  // invisible NPCs/creatures.
  if (!isSceneManagerInitialized()) return; // scene manager not booted yet
  const scene = getSceneManager().currentScene;
  if (!scene) {
    console.error('[creature-row] no active scene — player sprites will not render. Check ensureSceneForPhase().');
    return;
  }
  // Disposed/exiting scenes cannot receive syncCreatures; quietly skip so a
  // trailing render() during the brief transition window doesn't throw.
  if (scene.disposed || scene._exiting) return;
  if (!scene.syncCreatures) return; // scene type doesn't own creatures (no-op)

  const enemies = scene.formation?.lastFormationInput?.enemy?.creatures ?? [];
  scene.syncCreatures({ allies: creatures || [], enemies })
    .catch(err => console.error('[creature-row] scene.syncCreatures failed', err));
}
```

- [ ] **Step 7: Run both tests**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/exploration-dom.test.js tests/unit/ui/creature-row-no-scene.test.js`

Expected: PASS (all tests).

- [ ] **Step 8: Run full unit suite**

Run: `npm run test:unit`

Expected: all green.

- [ ] **Step 9: Commit**

```bash
/usr/bin/git add public/js/ui/exploration-dom.js public/js/ui/creature-row.js tests/unit/ui/exploration-dom.test.js tests/unit/ui/creature-row-no-scene.test.js
/usr/bin/git commit -m "refactor: convert silent scene-missing bails to console.error

With HubScene mounted at boot, a missing currentScene now reflects a
real regression in ensureSceneForPhase — fail loudly so future bugs of
this class surface on first frame. Adds disposed-scene guard to
creature-row.render (Bug #7 fix; broader audit in Task 9).

Fixes diagnostic half of Bugs #1 and #3; prevents SceneDisposedError
noise during combat→room transitions (Bug #7)."
```

---

## Task 7: Add `pauseForNpcInterjection` / `resumeFromNpcInterjection` to `Scene` base

**Files:**
- Modify: `public/js/scenes/scene.js`
- Test: `tests/unit/scenes/scene.test.js` (extend)

- [ ] **Step 1: Write the failing tests**

In `tests/unit/scenes/scene.test.js`, find the existing test file and append at the end (before the last `});`):

```js
describe('Scene pause/resume for NPC interjection', () => {
  // Reuse test harness from scene-npc.test.js pattern (FakeContainer, etc.).
  // If the existing file in this test isn't structured to import the helpers,
  // copy the minimal FakeContainer setup from scene-npc.test.js into this
  // describe block.

  it('pauseForNpcInterjection fades enemy formation container to 0', async () => {
    const { Scene } = await import('../../../public/js/scenes/scene.js');
    // Stub the fake scene with a formation ctx exposing enemyContainer
    const app = { ticker: { add() {}, remove() {} }, stage: { addChild() {}, removeChild() {} } };
    class S extends Scene {
      constructor() {
        super('TestPause', app);
        this.layers = { npcs: { addChild() {}, removeChild() {} } };
        this.formation = {
          playerContainer: { alpha: 1, visible: true },
          enemyContainer:  { alpha: 1, visible: true },
        };
      }
    }
    const s = new S();
    // Stub tween so it resolves immediately and mutates the target.
    s.tween = async (target, props) => { Object.assign(target, props); };
    await s.pauseForNpcInterjection({ fadeEnemies: true });
    assert.strictEqual(s.formation.enemyContainer.alpha, 0, 'enemy faded out');
    assert.strictEqual(s.formation.playerContainer.alpha, 1, 'player untouched');
    await s.resumeFromNpcInterjection();
    assert.strictEqual(s.formation.enemyContainer.alpha, 1, 'enemy restored');
    s.exit();
  });

  it('pauseForNpcInterjection can also fade allies when requested', async () => {
    const { Scene } = await import('../../../public/js/scenes/scene.js');
    const app = { ticker: { add() {}, remove() {} }, stage: { addChild() {}, removeChild() {} } };
    class S extends Scene {
      constructor() {
        super('TestPauseBoth', app);
        this.layers = { npcs: { addChild() {}, removeChild() {} } };
        this.formation = {
          playerContainer: { alpha: 1 },
          enemyContainer:  { alpha: 1 },
        };
      }
    }
    const s = new S();
    s.tween = async (target, props) => { Object.assign(target, props); };
    await s.pauseForNpcInterjection({ fadeEnemies: true, fadeAllies: true });
    assert.strictEqual(s.formation.playerContainer.alpha, 0);
    assert.strictEqual(s.formation.enemyContainer.alpha, 0);
    await s.resumeFromNpcInterjection();
    assert.strictEqual(s.formation.playerContainer.alpha, 1);
    assert.strictEqual(s.formation.enemyContainer.alpha, 1);
    s.exit();
  });

  it('resumeFromNpcInterjection is a no-op if pause was never called', async () => {
    const { Scene } = await import('../../../public/js/scenes/scene.js');
    const app = { ticker: { add() {}, remove() {} }, stage: {} };
    class S extends Scene {
      constructor() {
        super('TestResumeNoop', app);
        this.layers = { npcs: {} };
        this.formation = { playerContainer: { alpha: 1 }, enemyContainer: { alpha: 1 } };
      }
    }
    const s = new S();
    s.tween = async () => {};
    await assert.doesNotReject(() => s.resumeFromNpcInterjection());
    assert.strictEqual(s.formation.enemyContainer.alpha, 1);
    s.exit();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/scenes/scene.test.js`

Expected: FAIL with "pauseForNpcInterjection is not a function".

- [ ] **Step 3: Implement `pauseForNpcInterjection` and `resumeFromNpcInterjection` on the `Scene` base class**

In `public/js/scenes/scene.js`, add these methods to the `Scene` class (insert before the `tween` method at line 267):

```js
  /**
   * Fade formation sprites out while an NPC takes the stage.
   *
   * Mid-combat NPC interjections (e.g. Cid speaks during a befriend tutorial
   * step) need the enemy sprite to step aside so the NPC can slide in without
   * overlapping. The scene is the authoritative owner of formation sprite
   * lifetime, so pause/resume live here rather than as a DOM side-effect
   * chain through showNpcInDisplay + hideFormation.
   *
   * Stores the pre-pause alpha per side so resumeFromNpcInterjection restores
   * exactly what was changed. Calling pause twice is idempotent (second call
   * notices the stash exists and keeps it).
   *
   * @param {{ fadeEnemies?: boolean, fadeAllies?: boolean, duration?: number }} [opts]
   * @returns {Promise<void>}
   */
  async pauseForNpcInterjection({ fadeEnemies = true, fadeAllies = false, duration = 200 } = {}) {
    this._guard('pauseForNpcInterjection');
    if (!this.formation) return;
    if (!this._interjectionStash) this._interjectionStash = {};

    const fades = [];
    if (fadeAllies && this.formation.playerContainer && this._interjectionStash.player == null) {
      this._interjectionStash.player = this.formation.playerContainer.alpha ?? 1;
      fades.push(this.tween(this.formation.playerContainer, { alpha: 0 }, { duration, ease: 'easeOut' }));
    }
    if (fadeEnemies && this.formation.enemyContainer && this._interjectionStash.enemy == null) {
      this._interjectionStash.enemy = this.formation.enemyContainer.alpha ?? 1;
      fades.push(this.tween(this.formation.enemyContainer, { alpha: 0 }, { duration, ease: 'easeOut' }));
    }
    if (fades.length) await Promise.all(fades);
  }

  /**
   * Restore formation sprites previously faded by pauseForNpcInterjection.
   * Idempotent — no-ops if there's nothing to restore.
   *
   * @param {{ duration?: number }} [opts]
   * @returns {Promise<void>}
   */
  async resumeFromNpcInterjection({ duration = 200 } = {}) {
    this._guard('resumeFromNpcInterjection');
    if (!this.formation || !this._interjectionStash) return;

    const restores = [];
    if (this._interjectionStash.player != null && this.formation.playerContainer) {
      restores.push(this.tween(this.formation.playerContainer, { alpha: this._interjectionStash.player }, { duration, ease: 'easeOut' }));
    }
    if (this._interjectionStash.enemy != null && this.formation.enemyContainer) {
      restores.push(this.tween(this.formation.enemyContainer, { alpha: this._interjectionStash.enemy }, { duration, ease: 'easeOut' }));
    }
    this._interjectionStash = null;
    if (restores.length) await Promise.all(restores);
  }
```

- [ ] **Step 4: Run tests**

Run: `node --experimental-test-module-mocks --test tests/unit/scenes/scene.test.js tests/unit/scenes/scene-npc.test.js tests/unit/scenes/scene-tween.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/js/scenes/scene.js tests/unit/scenes/scene.test.js
/usr/bin/git commit -m "feat(scenes): add pauseForNpcInterjection/resumeFromNpcInterjection

Scene-level API for hiding formation sprites while an NPC takes the
stage mid-combat (e.g. Cid speaks during befriend tutorial). Fades the
enemy and/or ally formation containers via scene.tween so the tween
auto-cancels on scene exit. Stash restores exact pre-pause alpha.

Groundwork for Bugs #5 and #6 befriend-tutorial enemy-still-visible
regression."
```

---

## Task 8: Wire befriend.js tutorial + retry paths through pause/resume

**Files:**
- Modify: `public/js/ui/befriend.js:384-414` (tutorial step 1) and `befriend.js:466-486` (tutorialRetry)
- Test: `tests/unit/ui/befriend.test.js` (extend)

- [ ] **Step 1: Write failing tests that tutorial step 1 calls pause + resume**

Append to `tests/unit/ui/befriend.test.js` (within the existing describe block if it matches, or a new one):

```js
describe('renderBefriendQuiz — tutorial step 1 NPC interjection', () => {
  it('calls scene.pauseForNpcInterjection before showing Cid and resumeFromNpcInterjection after', async () => {
    // This is an integration-style test: we mock the coordinator ctx and scene
    // manager, then call renderBefriendQuiz with a tutorial=1 game state.
    // Assert that pause runs before showNpcSprite and resume runs after
    // hideNpcSprite.
    const calls = [];
    const scene = {
      disposed: false,
      layers: { npcs: {} },
      npcSprite: null,
      pauseForNpcInterjection: async () => { calls.push('pause'); },
      showNpcSprite: async () => { calls.push('showNpc'); scene.npcSprite = { ok: true }; return scene.npcSprite; },
      hideNpcSprite: async () => { calls.push('hideNpc'); scene.npcSprite = null; },
      resumeFromNpcInterjection: async () => { calls.push('resume'); },
    };
    await mock.module('../../../public/js/scenes/scene-manager.js', {
      namedExports: { getSceneManager: () => ({ currentScene: scene }) },
    });
    // ... wire up the rest of the ctx mocks and invoke renderBefriendQuiz ...
    // See befriend-quiz-state.test.js for the ctx-mock pattern.

    // Assertion: calls must be in the order [pause, showNpc, ..., hideNpc, resume].
    const pauseIdx = calls.indexOf('pause');
    const showIdx  = calls.indexOf('showNpc');
    const hideIdx  = calls.indexOf('hideNpc');
    const resumeIdx = calls.indexOf('resume');
    assert.ok(pauseIdx >= 0, 'pause called');
    assert.ok(pauseIdx < showIdx, 'pause before showNpc');
    assert.ok(hideIdx < resumeIdx, 'resume after hideNpc');
  });
});
```

If the befriend.test.js file structure doesn't easily support this integration-style test, split the assertion: verify the befriend tutorial calls these scene methods by directly inspecting the call log. A minimal test that asserts `ctx.narration.showNarration` is called with `speaker: 'Cid'` between `pause` and `resume` is acceptable.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/befriend.test.js`

Expected: FAIL (no pause/resume calls in the order log).

- [ ] **Step 3: Replace the tutorial step 1 Cid side-effect chain**

In `public/js/ui/befriend.js`, find the block starting at line 386 (`if (tutorialStep === 1) {`) and replace lines 390-406 (from `const cidSprite = ...` through `}` closing the `if (slideScene...)`) with:

```js
    const cidSprite = `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`;

    // Explicit scene API (replaces the former showNpcInDisplay({ skipPixi })
    // side-effect chain which assumed hideFormation('enemy') would also
    // hide the Pixi enemy sprite — it doesn't since the PR2 refactor).
    // Pause fades the enemy formation container; Cid slides in without
    // overlapping the tetsu sprite.
    const pauseScene = getSceneManager()?.currentScene;
    if (pauseScene && !pauseScene.disposed && pauseScene.layers?.npcs) {
      await pauseScene.pauseForNpcInterjection({ fadeEnemies: true });
      await pauseScene.showNpcSprite(cidSprite, { slideIn: true });
    } else {
      console.error('[befriend] tutorial step 1: no scene with npcs layer — Cid will not render');
    }

    // Keep the DOM side of the NPC info pill in sync (name label, etc.).
    // skipPixi: true because we just drove the Pixi side explicitly above.
    showNpcInDisplay('Cid', cidSprite, { skipPixi: true });
```

Then find line 404-406 (the `slideOutScene` block immediately below) and replace it with:

```js
    const slideOutScene = getSceneManager()?.currentScene;
    if (slideOutScene && !slideOutScene.disposed) {
      if (slideOutScene.npcSprite) {
        await slideOutScene.hideNpcSprite({ slideOut: true });
      }
      await slideOutScene.resumeFromNpcInterjection();
    }
```

- [ ] **Step 4: Apply the same treatment to the tutorialRetry path**

In the same file, find the `if (answerResult.tutorialRetry) {` block (currently line 466). Replace lines 467-477 with:

```js
      const cidSprite = `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`;

      const retryScene = getSceneManager()?.currentScene;
      if (retryScene && !retryScene.disposed && retryScene.layers?.npcs) {
        await retryScene.pauseForNpcInterjection({ fadeEnemies: true });
        await retryScene.showNpcSprite(cidSprite, { slideIn: true });
      } else {
        console.error('[befriend] tutorial retry: no scene with npcs layer');
      }
      showNpcInDisplay('Cid', cidSprite, { skipPixi: true });

      await ctx.narration.showNarration(getBefriendWrongNarration(), { speaker: 'Cid' });

      const retrySceneOut = getSceneManager()?.currentScene;
      if (retrySceneOut && !retrySceneOut.disposed) {
        if (retrySceneOut.npcSprite) {
          await retrySceneOut.hideNpcSprite({ slideOut: true });
        }
        await retrySceneOut.resumeFromNpcInterjection();
      }
```

- [ ] **Step 5: Syntax check**

Run: `node --check public/js/ui/befriend.js && echo "OK"`

Expected: `OK`.

- [ ] **Step 6: Run tests**

Run: `npm run test:unit`

Expected: all green. If the test from Step 1 was simplified, confirm its assertion matches the new call order.

- [ ] **Step 7: Playtest — befriend tutorial**

Ask the user before launching Playwright. If approved:
1. Fresh account, advance through prologue to first combat. Attack tetsu until HP is low enough to trigger tutorial step 1.
2. Click the card to attack; when Cid slides in for "Wow! This creature wants to talk!":
   - Confirm **the tetsu sprite fades out** during Cid's narration.
   - Confirm no overlap between Cid and tetsu.
3. After Cid slides out:
   - Confirm **the tetsu sprite fades back in**.
   - Confirm the tetsu HP bar + "tetsu/てつ" name label are visible above/below the sprite.
4. Answer the befriend quiz correctly; befriend success.
5. Take a screenshot at each checkpoint; `rm` after reviewing.

Expected: Bugs #5 and #6 both resolved.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add public/js/ui/befriend.js tests/unit/ui/befriend.test.js
/usr/bin/git commit -m "fix(befriend): route tutorial NPC interjection through scene API

Replaces showNpcInDisplay({ skipPixi: true }) side-effect chain — which
assumed hideFormation('enemy') would also hide the Pixi enemy sprite —
with explicit scene.pauseForNpcInterjection + showNpcSprite +
hideNpcSprite + resumeFromNpcInterjection. Applies to both tutorial
step 1 (Cid encourages befriending) and tutorialRetry (Cid helps after
wrong answer).

Fixes Bugs #5 and #6 from docs/pr2-bulletproof-rendering-smoke-test.md."
```

---

## Task 9: Reveal-on-reuse safety net in `showFormation` (belt-and-braces for Bug #6)

**Files:**
- Modify: `public/js/ui/combat-dom.js` — add reveal call when an existing Pixi sprite is already past its entrance animation.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ui/combat-dom-reveal.test.js`:

```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const slotHtml = () => ({
  dataset: { index: '0', creatureId: 'tetsu', hp: '10' },
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  querySelectorAll: () => [],
  querySelector: () => ({ classList: { remove() { this.removed = true; } }, style: {}, textContent: '' }),
});

const fakeFormation = {
  innerHTML: '',
  style: { opacity: '' },
  classList: { toggle() {} },
  querySelectorAll: () => [],
  appendChild() {},
};

await mock.module('../../../public/js/dom.js', {
  namedExports: {
    dom: {
      sceneBackground: { style: {} },
      playerFormation: fakeFormation,
      enemyFormation:  fakeFormation,
      enemySprite:     { src: '', classList: { add() {}, remove() {} }, style: {}, onerror: null, onload: null },
      enemyName:       { textContent: '' },
      enemyInfo:       { classList: { add() {}, remove() {} } },
      enemyHpFill:     { style: { width: '' } },
      enemyHpText:     { textContent: '' },
      enemyHpBar:      { style: { display: '' } },
      enemySkillBar:   { innerHTML: '', style: { display: '' } },
      npcDisplay:      { classList: { add() {}, remove() {}, contains: () => false }, appendChild() {} },
      sceneToast:      { textContent: '', classList: { add() {}, remove() {} } },
    },
  },
});
await mock.module('../../../public/js/ui/sprite-utils.js', { namedExports: { SPRITE_VERSION: 'test' } });
await mock.module('../../../public/js/ui/romaji.js', { namedExports: { toRomaji: (s) => s } });
let sceneRef = null;
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => ({ currentScene: sceneRef }) },
});

describe('showFormation reveal-on-reuse', () => {
  it('calls revealFormationInfo when an existing Pixi sprite is already in place', async () => {
    // Scene has a formation ctx with a sprite already resting (not _entering).
    // showFormation called again with the same creature should trigger a
    // reveal on the DOM slot, not wait for a nonexistent entrance animation.
    const revealCalls = [];
    const existingSprite = { _entering: false };
    sceneRef = {
      disposed: false,
      formation: {
        lastFormationInput: { enemy: { creatures: [{ uid: 'tetsu-1', id: 'tetsu' }] } },
        creatureSprites: { enemy: new Map([['tetsu-1', existingSprite]]) },
      },
    };
    // Patch document.querySelector so the reveal call finds the slot.
    const origDoc = globalThis.document;
    globalThis.document = {
      querySelector: (sel) => {
        if (sel.includes('formation-info')) {
          return { classList: { remove: (cls) => revealCalls.push({ sel, cls }) } };
        }
        return null;
      },
    };
    try {
      const { showFormation } = await import(`../../../public/js/ui/combat-dom.js?v=${Date.now()}`);
      await showFormation('enemy', [{ id: 'tetsu', uid: 'tetsu-1', hp: 10, maxHp: 100 }]);
    } finally {
      globalThis.document = origDoc;
    }
    assert.ok(
      revealCalls.some(c => c.cls === 'formation-info--hidden'),
      'expected revealFormationInfo to remove the hidden class'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/combat-dom-reveal.test.js`

Expected: FAIL (current code never calls reveal when the sprite already exists and isn't entering).

- [ ] **Step 3: Add reveal-on-reuse in `showFormation`**

In `public/js/ui/combat-dom.js`, at the end of the `slots.forEach(...)` block (just before `}` at line 204, right after `container.appendChild(slotEl);`), add this reveal check:

```js
    container.appendChild(slotEl);

    // Reveal-on-reuse safety net: if the active scene already has a Pixi
    // sprite for this creature that's past its entrance animation, the
    // DOM-rebuild-then-wait-for-Pixi-entrance reveal protocol won't fire
    // (no entering sprite → no revealFormationInfo). Remove the hidden
    // class explicitly so the quiz flow (Bug #6) sees the HP bar + name.
    if (side === 'enemy') {
      const scene = getSceneManager()?.currentScene;
      const uidKey = creature.uid ?? `__idx_${dataIndex}_${creature.id || ''}`;
      const existing = scene?.formation?.creatureSprites?.enemy?.get(uidKey);
      if (existing && !existing._entering) {
        const infoEl = document.querySelector(
          `.enemy-formation .formation-slot[data-index="${dataIndex}"] .formation-info`
        );
        if (infoEl) infoEl.classList.remove('formation-info--hidden');
      }
    }
```

- [ ] **Step 4: Run test**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/combat-dom-reveal.test.js`

Expected: PASS.

- [ ] **Step 5: Full unit suite**

Run: `npm run test:unit`

Expected: all green.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add public/js/ui/combat-dom.js tests/unit/ui/combat-dom-reveal.test.js
/usr/bin/git commit -m "fix(combat-dom): reveal formation info when Pixi sprite is reused

When showFormation rebuilds the DOM slot for an enemy whose Pixi sprite
already exists and is past its entrance animation, the wait-for-
entrance reveal protocol never fires — leaving HP bar + name hidden.
Belt-and-braces complement to the Bug #5/#6 pause/resume fix.

Fixes Bug #6 from docs/pr2-bulletproof-rendering-smoke-test.md."
```

---

## Task 10: Bug #7 — Audit + fix trailing `currentScene.X(...)` call sites

**Files:**
- Modify: All trailing-call sites identified by the audit (see Step 1)

- [ ] **Step 1: Grep for trailing scene method calls that lack a `.disposed` check**

Run:

```bash
/usr/bin/grep -rn 'getSceneManager()\s*\.currentScene\|getSceneManager()\?\.currentScene' public/js public/game.js
```

For each match, read ±5 lines of context. Classify each as:
- **Safe (already guarded)** — precedes the call with `.disposed` or `_exiting` check, or the method itself guards internally.
- **Unsafe (fix needed)** — calls a method directly on the scene that could throw `SceneDisposedError`.

Record the unsafe set. The known one from the bug report is `public/js/ui/creature-row.js:163` (already fixed in Task 6). Expect additional matches in `combat-loop.js`, `combat-vfx.js`, and PvP-related files.

- [ ] **Step 2: Add the `_exiting || disposed` guard to each unsafe call site**

For each match, wrap with:

```js
const scene = getSceneManager()?.currentScene;
if (!scene || scene.disposed || scene._exiting) return;
```

before the method call. If the call is inside a larger conditional, fold the check into the existing one.

- [ ] **Step 3: Syntax check each modified file**

Run: `for f in <list-of-modified-files>; do node --check "$f" && echo "$f OK"; done`

Expected: `OK` for each.

- [ ] **Step 4: Run full unit suite**

Run: `npm run test:unit`

Expected: all green.

- [ ] **Step 5: Playtest — combat → room transition**

Ask the user before launching Playwright. If approved:
1. Start a fresh run, befriend tetsu (or simply win a combat by attacking).
2. When combat ends and the next room loads (friendly NPC or exploration), watch the console.
3. Confirm **zero** `SceneDisposedError` logs during the transition.
4. Walk 3+ consecutive rooms — confirm no accumulated `SceneDisposedError`s.

Expected: Bug #7 gone.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add <list-of-modified-files>
/usr/bin/git commit -m "fix: guard every currentScene call site against disposed scenes

Audits public/js and public/game.js for getSceneManager().currentScene
calls that reach into scene methods without first checking .disposed /
._exiting. Each unsafe call now short-circuits cleanly when the scene
is in transition.

Fixes Bug #7 from docs/pr2-bulletproof-rendering-smoke-test.md."
```

---

## Task 11: Bug #4 — Extend inspector for non-combat phases + NPC sprites

**Files:**
- Modify: `public/js/inspector.js`
- Modify: `public/game.js` — wire a new `getNpcSprites(phase)` query into `createInspector`.
- Test: `tests/unit/ui/inspector.test.js` (extend)

- [ ] **Step 1: Write failing tests for non-combat phase coverage**

Append to `tests/unit/ui/inspector.test.js`:

```js
describe('Inspector — non-combat phases', () => {
  function mockQueries({
    stateAllies = [],
    domAllyBars = 0,
    pixiAllySprites = [],
    phase = 'hub',
    npcDisplayVisible = false,
    npcPixiCount = 0,
  } = {}) {
    return {
      getState: () => ({ run: { creatureParty: { active: stateAllies } } }),
      getPhase: () => phase,
      countDomBars: (side) => side === 'player' ? domAllyBars : 0,
      getPixiSprites: (side) => side === 'player' ? pixiAllySprites : [],
      getNpcSprites: () => {
        const sprites = [];
        for (let i = 0; i < npcPixiCount; i++) sprites.push({ alpha: 1 });
        return sprites;
      },
      isNpcDisplayVisible: () => npcDisplayVisible,
    };
  }

  it('skillMaster phase: detects "formation shown but 0 pixi sprites"', () => {
    const inspector = createInspector(mockQueries({
      phase: 'skillMaster',
      stateAllies: [{ hp: 30 }],
      domAllyBars: 1,
      pixiAllySprites: [],
    }));
    const result = inspector.checkCreatures();
    assert.equal(result.ok, false, 'should flag missing Pixi sprite');
    assert.match(result.mismatches[0].detail, /pixi.*0.*state.*1|missing/i);
  });

  it('hub phase: detects NPC display visible but zero NPC pixi sprites', () => {
    const inspector = createInspector(mockQueries({
      phase: 'hub',
      npcDisplayVisible: true,
      npcPixiCount: 0,
    }));
    const result = inspector.checkCreatures();
    assert.equal(result.ok, false);
    assert.match(result.mismatches[0].detail, /npc|sprite/i);
  });

  it('hub phase: passes when NPC display visible with one NPC pixi sprite', () => {
    const inspector = createInspector(mockQueries({
      phase: 'hub',
      npcDisplayVisible: true,
      npcPixiCount: 1,
    }));
    const result = inspector.checkCreatures();
    assert.equal(result.ok, true);
  });

  it('fullScan in hub phase returns npc counts in summary', () => {
    const inspector = createInspector(mockQueries({
      phase: 'hub',
      npcDisplayVisible: true,
      npcPixiCount: 1,
    }));
    const report = inspector.fullScan();
    assert.ok(report.summary.npcs, 'summary.npcs present');
    assert.strictEqual(report.summary.npcs.pixi, 1);
    assert.strictEqual(report.summary.npcs.dom, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/inspector.test.js`

Expected: FAIL with "getNpcSprites is not a function" or equivalent.

- [ ] **Step 3: Extend inspector.js**

Replace the body of `public/js/inspector.js` with:

```js
export function createInspector({ getState, getPhase, countDomBars, getPixiSprites, getNpcSprites, isNpcDisplayVisible } = {}) {

  // Safe defaults so call sites that haven't wired the new queries yet don't
  // regress to throwing. When a query is missing, that layer is skipped.
  getNpcSprites       = getNpcSprites       || (() => []);
  isNpcDisplayVisible = isNpcDisplayVisible || (() => false);

  function getAliveCount(creatures) {
    if (!creatures) return 0;
    return creatures.filter(c => c.hp > 0 && !c.befriended).length;
  }

  function getVisiblePixiCount(sprites) {
    if (!sprites) return 0;
    return sprites.filter(s => s.alpha > 0.3).length;
  }

  function sideAliveFromState(state, phase, side) {
    if (phase === 'combat' && state?.combat) {
      return side === 'player' ? state.combat.allies : state.combat.enemies;
    }
    // Non-combat: the "enemy" side isn't meaningful; "player" tracks the run's
    // active party (e.g. skillMaster, exploration, hub-with-party).
    if (side === 'player') return state?.run?.creatureParty?.active;
    return null;
  }

  function checkCreatures() {
    const mismatches = [];
    const phase = getPhase();
    const state = getState();
    const inCombat = state?.combat && phase === 'combat';

    // Formation checks — combat has both sides; non-combat has player only.
    const sidesToCheck = inCombat ? ['player', 'enemy'] : ['player'];
    for (const side of sidesToCheck) {
      const creatures = sideAliveFromState(state, phase, side);
      if (!creatures) continue;
      const aliveCount = getAliveCount(creatures);
      const domCount = countDomBars(side);
      const pixiSprites = getPixiSprites(side);
      const pixiVisibleCount = getVisiblePixiCount(pixiSprites);

      if (inCombat && creatures && pixiSprites) {
        for (let i = 0; i < creatures.length; i++) {
          const c = creatures[i];
          const s = pixiSprites[i];
          if (c && s && c.hp <= 0 && !c.befriended && s.alpha > 0.3) {
            mismatches.push({
              type: 'DOM_GHOST',
              detail: `${side}[${i}] KO (hp=${c.hp}) but sprite alpha=${s.alpha} — should be ≤0.3`,
            });
          }
        }
      }

      if (domCount !== aliveCount) {
        mismatches.push({
          type: 'DOM_GHOST',
          detail: `${side} dom=${domCount} but state=${aliveCount} alive`,
        });
      }

      if (pixiVisibleCount !== aliveCount) {
        mismatches.push({
          type: 'DOM_GHOST',
          detail: `${side} pixi=${pixiVisibleCount} visible but state=${aliveCount} alive`,
        });
      }
    }

    // NPC layer — every phase that shows an NPC display should have one
    // matching Pixi sprite on the npcs layer. Silent when the DOM pill isn't
    // visible; catches "Cid narration showing but no Pixi Cid" on first frame.
    if (isNpcDisplayVisible()) {
      const npcs = getNpcSprites();
      const npcPixiCount = getVisiblePixiCount(npcs);
      if (npcPixiCount === 0) {
        mismatches.push({
          type: 'DOM_GHOST',
          detail: 'npc display visible but 0 NPC pixi sprites — scene.showNpcSprite may have silently bailed',
        });
      }
    }

    return { ok: mismatches.length === 0, mismatches };
  }

  function fullScan() {
    const phase = getPhase();
    const state = getState();
    const inCombat = state?.combat && phase === 'combat';
    const creatureResult = checkCreatures();

    const summary = {
      allies:  { state: 0, dom: 0, pixi: 0 },
      enemies: { state: 0, dom: 0, pixi: 0 },
      npcs:    { dom: 0, pixi: 0 },
    };

    if (inCombat) {
      summary.allies = {
        state: getAliveCount(state.combat.allies),
        dom: countDomBars('player'),
        pixi: getVisiblePixiCount(getPixiSprites('player')),
      };
      summary.enemies = {
        state: getAliveCount(state.combat.enemies),
        dom: countDomBars('enemy'),
        pixi: getVisiblePixiCount(getPixiSprites('enemy')),
      };
    } else {
      const activeParty = state?.run?.creatureParty?.active;
      if (activeParty) {
        summary.allies = {
          state: getAliveCount(activeParty),
          dom: countDomBars('player'),
          pixi: getVisiblePixiCount(getPixiSprites('player')),
        };
      }
    }

    summary.npcs = {
      dom: isNpcDisplayVisible() ? 1 : 0,
      pixi: getVisiblePixiCount(getNpcSprites()),
    };

    return { ok: creatureResult.ok, mismatches: creatureResult.mismatches, summary, phase };
  }

  function checkGameRules(result) {
    const mismatches = [];
    if (!result) return { ok: true, mismatches };

    for (const atk of [...(result.playerAttacks || []), ...(result.enemyAttacks || [])]) {
      if (atk.attackerHpBefore !== undefined && atk.attackerHpBefore <= 0) {
        mismatches.push({
          type: 'LOGIC_BUG',
          detail: `KO creature attacked: ${atk.attackerSide}[${atk.attackerIndex}] had HP=${atk.attackerHpBefore}`,
        });
      }
    }

    for (const creatures of [result.allies || [], result.enemies || []]) {
      for (const c of creatures) {
        if (c.hp < 0) {
          mismatches.push({ type: 'LOGIC_BUG', detail: `HP below 0: creature has hp=${c.hp}` });
        }
      }
    }

    for (const creatures of [result.allies || [], result.enemies || []]) {
      for (const c of creatures) {
        for (const eff of (c.activeEffects || [])) {
          if (eff.remainingTurns !== undefined && eff.remainingTurns <= 0) {
            mismatches.push({
              type: 'LOGIC_BUG',
              detail: `Expired effect still active: ${eff.type} with remainingTurns=${eff.remainingTurns}`,
            });
          }
        }
      }
    }

    return { ok: mismatches.length === 0, mismatches };
  }

  return { checkCreatures, fullScan, checkGameRules };
}
```

- [ ] **Step 4: Wire `getNpcSprites` and `isNpcDisplayVisible` into the `createInspector` call in `game.js`**

In `public/game.js`, find the `createInspector({...})` call (currently line 1605). Extend the options object to include:

```js
  const inspector = createInspector({
    getState: () => store.get('gameState'),
    getPhase: () => {
      const gs = store.get('gameState');
      return gs?.phase || 'unknown';
    },
    countDomBars: (side) => {
      const container = side === 'player'
        ? document.querySelector('.player-formation')
        : document.querySelector('.enemy-formation');
      if (!container) return 0;
      return container.querySelectorAll('.formation-slot:not(.defeated):not(.befriended) .formation-hp-fill').length;
    },
    getPixiSprites: (side) => {
      const activeScene = getSceneManager()?.currentScene;
      const sprites = [];
      for (let i = 0; i < 3; i++) {
        const s = getCreatureSpriteForScene(activeScene, side, i);
        if (s) sprites.push({ alpha: s.alpha, tint: s.tint });
        else sprites.push(null);
      }
      return sprites.filter(Boolean);
    },
    getNpcSprites: () => {
      const scene = getSceneManager()?.currentScene;
      if (!scene?.layers?.npcs) return [];
      return scene.layers.npcs.children
        .filter(c => c && typeof c.alpha === 'number' && c.visible !== false);
    },
    isNpcDisplayVisible: () => {
      const el = document.getElementById('npc-display');
      return !!el && el.classList.contains('visible');
    },
  });
```

- [ ] **Step 5: Run tests**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/inspector.test.js`

Expected: PASS. Update existing tests that previously assumed `summary.npcs` was absent.

- [ ] **Step 6: Run full unit suite**

Run: `npm run test:unit`

Expected: all green.

- [ ] **Step 7: Playtest — inspector on non-combat screens**

Ask the user before launching Playwright. If approved:
1. Load hub; in console: `window.__inspector.fullScan()`.
2. Confirm `summary.npcs.dom` and `summary.npcs.pixi` are reported (both 0 on empty hub).
3. Enter a friendly NPC room. Run `fullScan()` again. Expect `npcs.dom=1`, `npcs.pixi=1`, `ok:true`.
4. As a pre-merge regression check: use `window.__inspector.checkCreatures()` during the skillMaster phase. If Task 3-5 is working, it should be `ok: true`; if something regresses, this now fires `ok: false` with a real mismatch detail.

Expected: Bug #4 closed. Future regressions will surface as `[CHK] ✗`.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add public/js/inspector.js public/game.js tests/unit/ui/inspector.test.js
/usr/bin/git commit -m "feat(inspector): extend checks to non-combat phases + NPC sprites

checkCreatures now covers run.creatureParty.active outside combat and
compares NPC pixi sprite count against npc-display DOM visibility.
fullScan returns structured npc counts alongside allies/enemies.

Fixes Bug #4 from docs/pr2-bulletproof-rendering-smoke-test.md — the
vacuous-pass behaviour that hid Bugs #1 and #3 from the intent-log
pipeline."
```

---

## Task 12: End-to-end re-test gate + documentation update

**Files:**
- Modify: `docs/pr2-bulletproof-rendering-smoke-test.md` — append a "Fixes applied" section.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: Tier 1 + Tier 2 all green. No console warnings.

- [ ] **Step 2: Playwright end-to-end re-test (the list from the smoke-test bug report)**

Ask the user before launching Playwright. If approved, walk through **every** checkbox in the "Re-test gates after fixes land" section of `docs/pr2-bulletproof-rendering-smoke-test.md`:

- [ ] Prologue: Cid sprite visible throughout, DOM + Pixi state consistent.
- [ ] Hub → Explore → Area selection → Skill master: fire creature + Cid sprite both visible. `window.__inspector.fullScan()` reports the allies in the summary.
- [ ] Encounter first combat: enemy slides in, ally renders, HP bars correct.
- [ ] Drop enemy to befriend threshold: Fight/Talk buttons appear. Tutorial step 1 triggers.
- [ ] Cid slides in for "wants to talk": enemy Pixi fades; Cid slides out; enemy fades back in with HP bar + name label.
- [ ] Answer befriend quiz correctly: enemy befriended, joins party.
- [ ] Room advances to friendly-NPC room: NPC sprite + name label + greeting narration, zero console errors.
- [ ] Refresh mid-friendly-NPC-room: game re-enters cleanly, no boot ReferenceError.
- [ ] Walk 3+ consecutive rooms: no accumulated stale NPC sprites.
- [ ] Boss encounter: boss sprite renders at 120px (note pre-existing `isBoss` serialization bug per the report — flag separately if it still happens).
- [ ] Lose combat → return to hub: clean.
- [ ] Console: zero unhandled promise rejections, zero `SceneDisposedError` logs, every `[CHK] ✗` maps 1:1 to a visible mismatch.

For each gate, `browser_take_screenshot` at key checkpoints so the user can visually verify. **`rm` each screenshot file immediately after it's been shown** (CLAUDE.md session-cleanup rule).

If any gate fails, stop. Diagnose root cause (reread the bug report for the affected bug), add a fix task, and rerun. Do NOT mark this plan done if any gate is red.

- [ ] **Step 3: Append a "Fixes applied" section to the bug report**

In `docs/pr2-bulletproof-rendering-smoke-test.md`, append at the bottom:

```markdown

---

## Fixes applied (2026-04-17)

Structural fixes landed per `docs/superpowers/plans/2026-04-17-pr2-bulletproof-rendering-fixes.md`.

Summary of changes:

- **Bug #2** — `sceneShowNpc` now replaces the dangling `pixiShowNpcSprite` reference in `public/js/ui/exploration-dom.js:133`. Friendly-NPC-room save-state unlocked.
- **Bugs #1 + #3** — New `public/js/scenes/hub-scene.js` mounted at boot and on hub/prologue/area_selection/skillMaster phase entry via `ensureSceneForPhase()` in `public/game.js`. Every phase now has a scene with `background + npcs + creatures + labels` layers.
- **Silent-bail cleanup** — `sceneShowNpc` and `creature-row.render` now `console.error` when they encounter a missing or disposed scene. Missing-scene regressions will surface on first frame instead of rendering invisible sprites.
- **Bugs #5 + #6** — New `Scene.pauseForNpcInterjection`/`resumeFromNpcInterjection` API on the scene base class. `befriend.js` tutorial step 1 and `tutorialRetry` paths route through it. Belt-and-braces reveal-on-reuse in `showFormation` for enemy formations whose Pixi sprite already exists.
- **Bug #7** — Disposed-scene guard added to `creature-row.render` and every other `getSceneManager().currentScene.X(...)` call site audited (see Task 10 of the plan).
- **Bug #4** — `inspector.checkCreatures` + `fullScan` now cover non-combat phases and NPC sprites. `[CHK] ✗` fires on "formation shown but zero Pixi sprites placed."

Re-test gate (see above) walked through end-to-end on 2026-04-17 with the fixes applied — all checkboxes green.

Pending follow-ups flagged during re-test: {fill in if any, or "none" — include the pre-existing `isBoss` state-serialization bug if it still repros after these fixes}.
```

Fill in the final line based on the actual re-test results.

- [ ] **Step 4: Commit the doc update**

```bash
/usr/bin/git add docs/pr2-bulletproof-rendering-smoke-test.md
/usr/bin/git commit -m "docs(pr2): record fixes applied and re-test gate results"
```

- [ ] **Step 5: Merge the worktree back per CLAUDE.md workflow**

Use the Finishing a Development Branch skill (`superpowers:finishing-a-development-branch`) to decide whether to merge directly to master or open a PR. Do not push without user approval.

---

## Appendix — Running tasks in order

The recommended execution order matches the bug-report priority:

1. Task 1 (unblock testing) — **run this first**, it's one commit.
2. Task 2 (HubScene) + Task 3 (wire-up) + Task 4 (prologue) + Task 5 (skillMaster verify) — together these land the always-on-scene guarantee.
3. Task 6 (loud-fail conversion) — immediately after Task 3-5 so regressions during later tasks surface.
4. Task 7 (pause/resume API) + Task 8 (befriend) + Task 9 (reveal-on-reuse) — the befriend tutorial fix cluster.
5. Task 10 (scene-disposed audit) — catches the tail of Bug #7.
6. Task 11 (inspector extension) — the diagnostic fix; run after earlier fixes so we can see the inspector confirm them.
7. Task 12 (end-to-end re-test + docs).

Each task is committable standalone. If you need to pause work, any commit boundary is safe.
