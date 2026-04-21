# PR #2 (feature/bulletproof-rendering) — Smoke-Test Bug Report

**Tested commit:** `f97acf2d` (dev, contains merged `feature/bulletproof-rendering` tip `42996496`)
**Date:** 2026-04-17
**Tester:** Claude (Opus 4.7) driving Playwright, user observing
**Scope:** Smoke-test the scene-controller refactor (BattleScene / ExplorationScene replacing `_defaultCtx`). Verify prior sprite-lifecycle bugs stay fixed and surface any regressions introduced by the refactor.

**Testing status:** **Halted at a save-state soft-lock** (Bug #2). The player cannot progress past the first friendly NPC room, and cannot recover from a page refresh while in one, without resetting the run. Additional bugs almost certainly exist in the unexercised flows (multi-room walk, enemy-encounter sprite hygiene on subsequent rooms, boss encounter, refresh-during-combat, post-death return-to-hub). Plan to resume testing after fixes land.

---

## Handoff summary for the fixing agent

### Common root cause

Six of the seven bugs (#1, #3, #5, #6, #7 directly; #2 by association via the same cleanup commit) trace to **the same underlying architectural decision**: the PR split the DOM and Pixi rendering lifecycles but did not enforce "there is always an active scene." Call sites that used to rely on the legacy `_defaultCtx` shared container now fan out into a scene-aware API that **silently no-ops when no scene is mounted**, and several pre-combat / mid-combat / transition-gap phases legitimately have no scene mounted.

The refactor's own intent was "scenes own rendering." To honor that intent end-to-end, **every visible phase must have an active scene** — not just combat and in-room exploration. And when a scene exists, the transitional edge cases (NPC interjection, combat→room transition, room→friendly-NPC transition) must route through explicit scene methods rather than relying on DOM side-effects.

Additionally, Bug #4 (vacuous inspector passes outside combat) is why #1 and #3 made it past the intent-log / inspector pipeline without a single `[CHK] ✗`. Once Bug #4 is fixed, regressions in this area will surface much faster.

### Recommended fix order

1. **Bug #2 first** (save-state soft-lock) — one-line dangling reference at `public/js/ui/exploration-dom.js:133`. Change `pixiShowNpcSprite(spritePath)` → `sceneShowNpc(spritePath)`. This unblocks testing on existing save states and closes the acute regression. It is not a band-aid: it's completing the cleanup sweep that commit `42996496` left half-done — the replacement helper (`sceneShowNpc`) is already defined and used everywhere else in that file.

2. **Bugs #1 and #3 together — the "always-on-scene" guarantee.** Introduce a `HubScene` (and optionally a `PrologueScene`) with `background` + `npcs` + `creatures` + `labels` layers so every phase has a scene with somewhere to write. Wire `SceneManager` to enter/exit scenes at phase transitions (centralise this in `game.js::updateGameState` or similar). Once the guarantee holds, remove the silent bails in `sceneShowNpc` and `creature-row.render` — convert to `console.error` so any future missing-scene regression surfaces loudly.

3. **Bugs #5 and #6 together — scene API for NPC interjection mid-combat.** Add `scene.pauseForNpcInterjection({ fadeEnemies })` and `scene.resumeFromNpcInterjection()` on the scene base (or BattleScene specifically). Refactor `befriend.js:384-414` (tutorial step 1) to use the new pair instead of the DOM side-effect chain (`showNpcInDisplay(..., skipPixi: true)` → assuming `hideFormation('enemy')` hides Pixi). Deprecate or rename `hideFormation` → `clearFormationDom` so the DOM-only contract is explicit. Make the formation-info reveal state-driven (driven by creature + scene state, not a one-shot entrance-animation callback) so rebuilds and reuses stay in sync (#6).

4. **Bug #7 — scene-transition safety.** In `creature-row.render`, add `!scene.disposed` to the guard. Then audit every `getSceneManager().currentScene.X(...)` call site for the same issue. Long-term: make `SceneManager.setScene` atomic across exit + enter, and either buffer trailing calls or have disposed scenes return cleanly instead of throwing `SceneDisposedError`.

5. **Bug #4 — extend the inspector to cover non-combat phases.** Make `checkCreatures` / `fullScan` aware of the phase-dependent expected-sprite counts (hub expects NPC, skillMaster expects allies, combat expects allies+enemies+optional NPC). Make `[CHK] ✗` fire on "formation shown but zero Pixi sprites placed." Rename `checkCreatures` to something like `checkSprites` since it now includes NPCs. This is the single highest-leverage diagnostic fix — it would catch #1/#3/#5/#6 on the first frame in any future regression.

### Re-test gates after fixes land

Before declaring the fix shipped, re-run this flow end-to-end:

- [ ] Prologue: Cid sprite visible throughout, DOM + Pixi state consistent.
- [ ] Hub → Explore → Area selection → Skill master: fire creature and Cid sprite both visible on the Starting Meadow background. Intent-log `[CHK]` should actually check.
- [ ] Encounter first combat: enemy slides in, ally renders, HP bars correct.
- [ ] Drop enemy to befriend threshold: Fight/Talk buttons appear. Tutorial step 1 triggers.
- [ ] Cid slides in for "wants to talk" narration: **enemy Pixi sprite hides or fades** during Cid's lines; Cid slides out; **enemy returns with HP bar + name label visible**.
- [ ] Answer befriend quiz correctly: enemy is befriended, joins party.
- [ ] Room advances to the next room. If it's a friendly NPC room (shop/boy/etc.): NPC sprite renders with name label and greeting narration — no unhandled rejections in console.
- [ ] Refresh mid-friendly-NPC-room: game re-enters cleanly, no boot-time ReferenceError.
- [ ] Walk 3+ consecutive rooms: no accumulated stale NPC sprites.
- [ ] Boss encounter: boss Pixi sprite renders at 120px (note: there's a pre-existing state-serialization bug where `isBoss` isn't propagated client-side — may still render at 60px. Flag separately if it still happens after these fixes).
- [ ] Lose combat → return to hub: works cleanly.

Console watch: should see zero unhandled promise rejections and zero `SceneDisposedError` logs across the whole run. Any `[CHK] ✗` should map 1:1 to an actual visible mismatch.

Fix strategy: **structural**, not band-aids. Where a call site bails silently because "no scene is active," the right answer is usually to make a scene exist (e.g. `PrologueScene`, `HubScene`) rather than re-introduce a DOM-path fallback. A few places will still need a tiny DOM fallback for transition gaps, but the default should be "there is always a scene."

---

## Bug index

| # | Severity | Area | Title |
|---|----------|------|-------|
| 1 | **Blocker** | Prologue/Hub rendering | Cid sprite never renders during prologue tutorial |
| 2 | **Blocker — save-state soft-lock** | Rendering | `pixiShowNpcSprite` ReferenceError in `showNpcTrainer` — fires on every friendly NPC room entry AND on every page refresh while in one |
| 3 | **Blocker** | Skill Master phase | Fire creature sprite + Cid NPC missing on Starting Meadow / skillMaster phase |
| 4 | **High (diagnostic)** | Intent-log / inspector | `[CHK] ✓` is a vacuous pass outside combat — all sprite bugs pre-combat are silent |
| 5 | **High** | Befriend tutorial / combat NPC interjection | Enemy Pixi sprite stays visible when Cid slides in for "wants to talk" narration |
| 6 | **High** | Befriend quiz UI | Enemy HP bar + name stay hidden during the befriend quiz after Cid narration ends (same-family as #5) |
| 7 | **High** | Scene lifecycle | `SceneDisposedError: method '_diff' called after exit()` — trailing `scene.syncCreatures` fires against disposed BattleScene during combat→room transition |

Additional entries will be appended as the smoke test continues.

---

## Bug #1 — Cid sprite never renders during prologue tutorial

**Severity:** Blocker — the tutorial NPC is invisible while speaking. Player sees a narration box with the name "Cid" but no character on screen.

### Reproduction

1. Start a fresh session at `http://localhost:5173` (account already logged in, no save).
2. Game phase transitions `no_save → hub`.
3. Cid prologue narration begins. First page shows garbled `?????` (expected — no known words yet). Second page shows English text "Oh wait... I don't think you can understand a word I'm saying. ...Do you understand me NOW?".
4. **Cid's sprite is nowhere on screen** — no DOM `<img>` visible, no Pixi sprite on the canvas. Only the NPC name label ("Cid") and the narration box are visible.

### Expected

Cid sprite should render above the narration box throughout the prologue (prior behavior before the refactor).

### Observed

- `#npc-display` container has `.visible` class — **good**.
- `#enemy-info.visible` with `#enemy-name` text `"Cid"` — **good**.
- `#enemy-sprite` has `src=""` (resolves to base URL), `display: none`, no `.visible` class — **broken**.
- PIXI stage child count: **0** — canvas is empty.
- `window.__sceneManager` / `getSceneManager()?.currentScene` — **null during prologue**.

### Console

Clean — no errors or warnings. `[ACT]`/`[EXP]`/`[CHK] ✓` all pass, because the intent-log only tracks formations (allies/enemies), not NPC sprites. This is a classic "inspector blind spot" — the visual mismatch is real even though checks pass.

### Root cause

`public/js/ui/exploration-dom.js:34-47` — `showNpcInDisplay()`:

```js
export function showNpcInDisplay(name, spritePath, { skipPixi = false } = {}) {
  dom.npcDisplay.classList.add('visible');
  hideFormation('enemy');
  dom.enemyName.textContent = name;
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  // Hide DOM sprite — NPC renders on PixiJS canvas now
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  if (!skipPixi) sceneShowNpc(spritePath);
}
```

It unconditionally blanks `dom.enemySprite`, assuming Pixi will pick up the slack via `sceneShowNpc(spritePath)`. But `sceneShowNpc` silently bails if no scene is mounted:

```js
function sceneShowNpc(spritePath) {
  const scene = getSceneManager()?.currentScene;
  if (!scene || scene.disposed || !scene.layers?.npcs) return;  // ← silent bail
  scene.showNpcSprite(spritePath).catch(err => {
    console.warn('[exploration-dom] scene.showNpcSprite failed:', err);
  });
}
```

The prologue runs in `game.js:747 playPrologue()`, which fires `scene.showCid()` (→ `showNpcInDisplay`) **before any ExplorationScene has been created**. No scene → Pixi path no-ops → DOM path already blanked → nothing renders.

The module docstring at `exploration-dom.js:11` claims:
> "When no scene with an `npcs` layer is active (boot / transition gap), the Pixi slide is skipped — the DOM side of the NPC display still renders."

This is not accurate — the DOM side is explicitly cleared earlier in the same function.

### Introduced by

Commit `42996496` — `cleanup(pixi): delete legacy _defaultCtx rendering path (18)`. That commit removed the `_defaultCtx` fallback used to host Pixi sprites before any scene existed. The DOM-image fallback wasn't restored in `showNpcInDisplay`, so prologue/hub NPCs lost their only render path.

### Structural fix

**Introduce a `PrologueScene` (or a shared `HubScene`)** mounted during `playPrologue()` so the prologue has an active scene with an `npcs` layer from the moment it starts. This matches the PR's stated goal ("scenes own rendering, including cleanup"), keeps the Pixi path authoritative, and gives the prologue the same cleanup guarantees as BattleScene / ExplorationScene.

Scope:
- New file `public/js/scenes/prologue-scene.js` (or `hub-scene.js`) extending the `Scene` base with at minimum a `background` and `npcs` layer.
- `playPrologue()` transitions `SceneManager` into this scene before the first `scene.showCid()` call.
- `SceneManager` transition after prologue completes returns to whatever the hub / area-selection flow currently uses; if nothing, this scene doubles as the hub scene.
- Keep `showNpcInDisplay` essentially as-is. Rename the misleading docstring to reflect the new contract ("Pixi-authoritative; callers must ensure an active scene exists").
- Follow-up: consider making `sceneShowNpc` throw (or `console.error`) instead of silently returning — silent bail is what hid this bug end-to-end.

### Screenshots

_Pending — will capture on next browser state. Console-confirmed via `window.__inspector.fullScan()` (all counts match state=0 because NPCs aren't tracked) and DOM inspection (empty `#enemy-sprite`, zero Pixi stage children)._

---

## Bug #2 — `pixiShowNpcSprite` ReferenceError in `showNpcTrainer` (CONFIRMED)

**Severity:** Blocker — fires on every entry into a friendly NPC room. The NPC appears visually but the greeting/dialogue never runs because `showNpcTrainer` throws mid-execution, aborting the rest of the friendly-NPC render flow (name label, greeting narration, shop UI, etc. may all be affected).

**Confirmed reproduction path (2026-04-17 smoke test):** befriend `tetsu` in combat → combat ends → room advances to a `friendlyNpcRoom` containing a Boy NPC → `autoProceed` → `updateUI` → `updateScene` (`game.js:466`) calls `showNpcTrainer` → throws.

**Save-state soft-lock:** After the first throw, the room is saved server-side. Every subsequent page refresh loads the same room, re-runs `initGame → updateUI → updateScene → showNpcTrainer`, and throws in exactly the same place. The player sees a near-blank scene (background-less, creature-less, NPC-less) on every load and cannot escape without resetting the run. `initGame` gets far enough to expose `window.__pixiApp`, inspector, intent log, and the canvas, but `updateScene` aborts the post-boot render entirely when it hits the ReferenceError.

### Actual observation

User reports: "a new npc slid in (friendlynpc room) but no greeting or anything?"

Console error (unhandled promise rejection):
```
Unhandled Promise Rejection: ReferenceError: Can't find variable: pixiShowNpcSprite
    at showNpcTrainer (http://localhost:5173/js/ui/exploration-dom.js:133:22)
    at updateScene (http://localhost:5173/game.js:466:27)
    at updateUI (http://localhost:5173/game.js:347:14)
    at autoProceed (http://localhost:5173/game.js:657:15)
```

DOM state post-error: `#enemy-name` textContent `"Boy"`, formation slots showing `hi` (player) + `tetsu` (newly befriended ally), narration `鉄 ともだち tomodachi friend です！` (post-befriend flavor — which is what plays *before* the error fires). After the unhandled rejection, the Boy's greeting never renders.

### Reproduction

1. Walk into any friendly NPC room (shop / trainer / post-befriend flavor NPC).
2. `showNpcTrainer(npcName, npcId, npc)` is called with default `skipPixi = false`.
3. Execution reaches `public/js/ui/exploration-dom.js:133`.
4. `ReferenceError: Can't find variable: pixiShowNpcSprite`.

### Root cause

`public/js/ui/exploration-dom.js:109-135`:

```js
export function showNpcTrainer(npcName, npcId, npc, { skipPixi = false } = {}) {
  // ...
  if (!skipPixi) {
    const spritePath = npcId
      ? `/assets/sprites/npcs/${npcId}.webp?v=${SPRITE_VERSION}`
      : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
    pixiShowNpcSprite(spritePath);   // ← undefined (removed in commit 42996496)
  }
}
```

`pixiShowNpcSprite` was removed in the same `_defaultCtx` cleanup commit (the file's own line 9 comment says so). This line was missed during the cleanup sweep and is now a dangling reference.

### Fix

Part of the same structural fix as Bug #1. Replace the dangling call with `sceneShowNpc(spritePath)` (the scene-aware replacement helper already defined at the top of the module). Once a `HubScene` / `ExplorationScene` is active at the relevant entry point, the call will route correctly and NPC trainers will render on Pixi.

Adding a unit or integration test that calls `showNpcTrainer` with `skipPixi: false` would have caught this at merge time.

---

## Bug #3 — Fire creature sprite + Cid NPC missing on Starting Meadow / skillMaster phase

**Severity:** Blocker — same class of failure as Bug #1, but now for the player's own creature. The tutorial shows an HP bar labelled "hi / ひ" floating at top-left against an empty meadow background, with Cid narrating "Let's just pick the first one." but no Cid sprite. The entire scene looks broken to the player.

### Reproduction

1. Advance through the prologue (click through narration until Cid gives you the fire creature).
2. Game progresses `hub → area_selection → skillMaster` and renders the Starting Meadow background.
3. Cid narrates "Each run you can get skills to make your party stronger." and then "Let's just pick the first one."
4. Skill cards appear (Retaliation Strike / Arc Strike / Shared Vigor).
5. **Fire creature HP bar** ("hi/ひ" with a small red HP gauge) is visible top-left, **but no fire creature sprite under or beside it.**
6. **Cid's sprite** is also missing — only her narration box.

### Expected

Cid sprite visible alongside the narration box. Fire creature sprite rendered at the `formation-slot` anchor, scaled to the slot box (~54×54). Player sees Cid and their starter before picking a party skill.

### Observed (in-browser evidence)

- `window.__pixiApp().layers.creatures.children.length === 0` — the creatures container is empty.
- `window.__pixiApp().layers.background.children.length === 4` — the meadow background renders fine (tiling sprites).
- `#player-formation` contains one `.formation-slot[data-creature-id="hi"][data-hp="70"]` with an empty `.formation-sprite.formation-sprite--pixi-anchor` div and a populated `.formation-info` (name + HP/MP bars).
- `window.__inspector.fullScan()` returns `{ allies: { state:0, dom:0, pixi:0 } }` — **but this is a vacuous pass, see Bug #4.**
- Intent log right before the inspector call:
  ```
  [ACT] Show player formation: 1 total, 1 alive
  [EXP] player: 1 visible sprites, 1 HP bars
  [CHK] ✓   ← lying (see Bug #4)
  ```

Screenshot: `tmp/skillmaster-no-sprites.png` (deleted after capture) — shows empty meadow with the lone HP bar floating and Cid's narration box, no character art anywhere on screen.

### Root cause

Same "no active scene" category as Bug #1, but a different call chain.

`public/js/ui/combat-dom.js:36 showFormation('player', creatures)` only builds **DOM scaffolding**: a `.formation-slot` with a `.formation-sprite--pixi-anchor` div (empty, layout anchor only) and the info box with name + bars. The comment at line 116 says "creature artwork is drawn on the Pixi battle stage" — but this function never touches Pixi.

The Pixi sprite is supposed to be placed by the active scene's `syncCreatures`, called from `public/js/ui/creature-row.js:163 render()`:

```js
showFormation('player', creatures);
// ...
if (!isSceneManagerInitialized()) return;
const scene = getSceneManager().currentScene;
if (!scene?.syncCreatures) return;              // ← bails silently
// ...
scene.syncCreatures({ allies: creatures || [], enemies })
  .catch(err => console.error('[creature-row] scene.syncCreatures failed', err));
```

During the `skillMaster` tutorial phase, no scene with `syncCreatures` is mounted yet (ExplorationScene is wired into *room flow*, per commit `f09885ee`, but the tutorial skill master runs before the first actual room is entered). `scene?.syncCreatures` is undefined → early return → zero Pixi sprites placed.

Cid has the additional Bug #1 path (DOM is blanked, Pixi silently no-ops), so both NPCs end up invisible.

### Introduced by

Commit `f09885ee feat(scenes): wire ExplorationScene into room flow + encounter (17)` and `42996496 cleanup(pixi): delete legacy _defaultCtx rendering path (18)` together. Pre-refactor, `showFormation` used to draw directly to `_defaultCtx`; now it delegates to the active scene, but the skill-master / tutorial-offer phase has no active scene.

### Structural fix

Same family as Bug #1:

1. **Ensure an active scene exists the moment we transition to any visible phase** (not just combat rooms). Minimum mount a `HubScene` / `PrologueScene` / lightweight base scene with `background` + `npcs` + `creatures` + `labels` layers so `syncCreatures` and `showNpcSprite` always have somewhere to write.
2. Make scene transitions implicit at phase transitions in `game.js::updateGameState` — after `updateUI` dispatches on phase, the scene manager should guarantee a current scene for each phase. Candidate mapping:
   - `no_save`, `hub` → `HubScene`
   - `area_selection` → re-use HubScene or a small selection scene
   - `skillMaster`, `exploration` → `ExplorationScene` (already exists)
   - `combat` → `BattleScene` (already exists)
   - Prologue runs within `HubScene` so Cid can render.
3. Once the mapping exists, remove every `if (!scene?.syncCreatures) return` and `if (!scene || scene.disposed || !scene.layers?.npcs) return` silent bail — convert to `console.error` so any future regression shows up in the logs immediately.

### Also note

`creature-row.js:178` reads `scene.formation?.lastFormationInput?.enemy?.creatures ?? []` before calling `scene.syncCreatures({ allies, enemies })`. If the scene exists but its formation ctx hasn't been initialized (e.g., an ExplorationScene was mounted without an initial `enemies` seed), this resolves to an empty array — which is correct for exploration but a good thing to unit-test on the scene boundary.

---

## Bug #4 — `[CHK] ✓` is a vacuous pass outside combat — all sprite bugs pre-combat are silent

**Severity:** High (diagnostic) — this is why Bugs #1 and #3 made it to smoke-test despite the entire intent-log / inspector system being in place. Any sprite regression outside combat phase (hub, area_selection, skillMaster, exploration room transitions) slips through the check pipeline silently.

### Reproduction

1. Be in any non-combat phase with any formation / NPC rendering happening.
2. Call `window.__inspector.fullScan()` or inspect the intent log.
3. See `[CHK] ✓` regardless of whether sprites are actually on screen.

### Root cause

`public/js/inspector.js:13-21`:

```js
function checkCreatures() {
  const mismatches = [];
  const phase = getPhase();
  const state = getState();
  const inCombat = state?.combat && phase === 'combat';

  if (!inCombat) {
    return { ok: true, mismatches };   // ← always passes outside combat
  }
  // ... actual checks only run when inCombat
}
```

And `fullScan` (line 62-87) only populates `summary.allies` / `summary.enemies` when `inCombat`. Outside combat, the summary stays `{ state:0, dom:0, pixi:0 }` for both sides — which trivially "matches" (all zeros equal all zeros), so `ok: true`.

So every `log.check(...)` call outside combat is handed `ok: true` by definition. The intent log's `[EXP] player: 1 visible sprites, 1 HP bars` followed by `[CHK] ✓` is **not a claim that 1 sprite is actually visible** — it's just the inspector shrugging because it doesn't look outside combat.

### Why this matters

The playtest guide (`docs/playtest-guide.md`) instructs testers to trust `[CHK] ✓` / `[CHK] ✗` as the source of truth. That contract is silently broken for every phase except `combat`. Smoke testers (and the assistant) have false confidence that no sprites are missing, when in fact nothing is being checked.

### Structural fix

Extend the inspector to cover non-combat formations and NPC sprites:

1. Add `getNpcSprites()` accessor (alongside `getPixiSprites`). Count visible Pixi children in the `npcs` layer. Expected count can be derived from the NPC display state (`#npc-display.visible` + a name label present → expect 1 NPC sprite).
2. Let `checkCreatures` (rename to `checkSprites` or add a sibling `checkFormations`) compare `state.creatureParty.active` (or the last `showFormation` call's input cached via intent log) against `layers.creatures.children` outside combat too.
3. `fullScan` should return `summary` for the current phase — e.g. `hub: { npcs: { state, dom, pixi } }`, `skillMaster: { allies: {...}, npcs: {...} }`, `combat: { allies, enemies, npcs }`.
4. Make "formation shown but zero sprites placed" an automatic `DOM_GHOST` mismatch. That would have caught Bug #3 on first frame.

Follow-up: the intent-log `[ACT]` / `[EXP]` narration is useful; the missing piece is *checking* the `[EXP]` assertion instead of vacuously passing.

---

## Bug #5 — Enemy Pixi sprite stays visible when Cid slides in for "wants to talk" narration

**Severity:** High — breaks the intended tutorial choreography. The player sees three sprites on screen at once (player creature, enemy creature, Cid NPC) all at full alpha, with Cid physically overlapping the enemy. Intended behavior per user: when Cid slides in to talk, the enemy creature should fade/hide; when Cid slides out, the enemy returns.

### Reproduction

1. Advance through tutorial into first combat (starter fire creature vs `tetsu` enemy on Starting Meadow).
2. Attack the enemy until its HP drops to/around the befriend threshold, triggering befriend eligibility (tutorial step 1).
3. Combat UI shows Fight/Talk buttons below the scene. Narration: "Wow! This creature wants to talk!" spoken by Cid.
4. Observe: fire creature (top-left HP slot), enemy creature (right side), **and** Cid sprite (center-right, overlapping the enemy) all visible simultaneously at alpha=1.

### Expected

When Cid slides in for the tutorial befriend narration, the enemy creature sprite fades out or is hidden. After Cid finishes the lines and slides out, the enemy sprite returns. Only the player's fire creature and Cid should be visible during the narration.

### Observed (in-browser evidence)

Pixi stage dump (combat phase, tutorial step 1 triggered):

```
path=/5/0/0  hi.webp       alpha=1, visible=true, at (73, 130)      ← player
path=/5/1/0  tetsu.webp    alpha=1, visible=true, at (319, 130)     ← enemy (should be hidden)
path=/7/0    cid.webp      alpha=1, visible=true, at (275, 130)     ← Cid (overlapping enemy)
```

Screenshot `tmp/cid-creature-overlap.png` clearly shows all three sprites on the meadow background at the same time, with Cid partially in front of the gray `tetsu` sprite.

### Root cause

Two-part failure, both stemming from the refactor splitting DOM state from Pixi state with no re-coupling for this path.

**Part 1 — `hideFormation('enemy')` no longer hides the Pixi sprite.**

`public/js/ui/combat-dom.js:219-237`:

```js
export function hideFormation(side) {
  // ... intent log ...
  const container = side === 'player' ? dom.playerFormation : dom.enemyFormation;
  container.innerHTML = '';
  container.style.opacity = '';
  // Pixi sprites are removed by BattleScene.syncCreatures when combat ends
  // (see combat-loop.stopCombatLoop); this DOM-side clear only removes the
  // HP-bar/name slot markup.
  // ...
}
```

The comment explicitly admits it: `hideFormation('enemy')` clears DOM markup only. The Pixi enemy sprite is owned by `BattleScene` and is not touched until combat ends. During combat, there's no call path from `hideFormation('enemy')` to `BattleScene.syncCreatures({ enemies: [] })`.

Pre-refactor, the legacy `_defaultCtx` rendering path coupled DOM and Pixi formation state — clearing the DOM formation effectively also cleared the Pixi formation. Commit `42996496 cleanup(pixi): delete legacy _defaultCtx rendering path (18)` removed that coupling without replacing it.

**Part 2 — The befriend tutorial path invokes the stale contract.**

`public/js/ui/befriend.js:384-414` (tutorial step 1 befriend intro):

```js
if (tutorialStep === 1) {
  // ... dim/highlight Fight/Talk buttons ...
  const cidSprite = `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`;
  showNpcInDisplay('Cid', cidSprite, { skipPixi: true });   // ← only clears DOM enemy
  // Befriend runs during combat with BattleScene active; route the NPC
  // slide through the scene so registry disposal handles cleanup on exit.
  const slideScene = getSceneManager()?.currentScene;
  if (slideScene && !slideScene.disposed && slideScene.layers?.npcs) {
    await slideScene.showNpcSprite(cidSprite, { slideIn: true });   // ← adds Cid to Pixi
  }

  for (const line of getTutorialNarration(1)) {
    await ctx.narration.showNarration(line, { speaker: 'Cid' });
  }

  const slideOutScene = getSceneManager()?.currentScene;
  if (slideOutScene && !slideOutScene.disposed && slideOutScene.npcSprite) {
    await slideOutScene.hideNpcSprite({ slideOut: true });
  }
  restoreBefriendQuizEnemyUi({ quizData, result, gameState, hideEnemy, showFormation });
}
```

The author's intent: `showNpcInDisplay` handles the enemy-hide side effect (via its internal `hideFormation('enemy')` call), then `slideScene.showNpcSprite` slides Cid in. The bug: `hideFormation('enemy')` doesn't actually hide the Pixi enemy sprite anymore, so Cid slides in on top of the still-visible enemy.

Compounding: `restoreBefriendQuizEnemyUi` at the end calls `showFormation('enemy', [target])` to "restore" the enemy — but the enemy was never hidden on Pixi to begin with, so the restore is a no-op on the sprite (it just re-adds DOM HP bar markup).

### Introduced by

Commit `42996496` (the `_defaultCtx` removal) broke the DOM↔Pixi coupling. The befriend tutorial path didn't get updated to use the new scene-aware API for hiding the enemy formation. Likely missed because no test covers "NPC slides in mid-combat" and the intent-log / inspector doesn't catch overlapping sprites (see Bug #4).

### Structural fix

Two pieces, both on the scene-owned side of the split:

1. **Scene API for conversation mode.** Add a pair of methods on the scene base class (or `BattleScene` specifically):
   - `scene.pauseForNpcInterjection({ fadeEnemies = true, fadeAllies = false, alpha = 0 } = {})`
   - `scene.resumeFromNpcInterjection()`

   These wrap the formation Pixi containers in a fade/hide transition. The scene is the right owner because it's already the authority for formation sprite lifetime (`syncCreatures`).

2. **Wire befriend.js to call them.** Replace the `showNpcInDisplay('Cid', ..., { skipPixi: true })` side-effect with an explicit pair:
   ```js
   await scene.pauseForNpcInterjection({ fadeEnemies: true });
   await scene.showNpcSprite(cidSprite, { slideIn: true });
   // ... narration ...
   await scene.hideNpcSprite({ slideOut: true });
   await scene.resumeFromNpcInterjection();
   ```
   `restoreBefriendQuizEnemyUi` then only needs to handle DOM-side HP bar cleanup, not sprite lifetime.

3. **Audit other callers of `hideFormation('enemy')`** for the same stale-contract issue:
   - `showNpcInDisplay` (every NPC display during combat — shop merchant, shrine fox, etc. — may have this issue if they fire during combat)
   - `showNpcTrainer` (friendly NPC room — would hit Bug #2 first)
   - Any other `hideFormation` call that expects Pixi follow-through

4. **Deprecate the side-effect pattern.** Make `hideFormation` explicitly DOM-only with a JSDoc warning; force all call sites to also route through scene methods. Rename to `clearFormationDom` if it stays.

---

## Bug #6 — Enemy HP bar + name stay hidden during the befriend quiz (same family as #5)

**Severity:** High — the player cannot see the enemy's HP or name while answering befriend quiz questions. Tetsu is rendered on the meadow but has no label or HP bar floating above it, making the quiz feel disconnected from the creature.

**Relationship to Bug #5:** Same root architectural problem (DOM formation lifecycle decoupled from Pixi sprite lifecycle), but a different symptom path. Bug #5 was "Pixi sprite doesn't hide when DOM is cleared." Bug #6 is "DOM rebuild's reveal-callback never fires because Pixi didn't need to re-enter." Fixing Bug #5 properly (pause/resume scene for NPC interjection) also fixes Bug #6.

### Reproduction

1. Continue from Bug #5 repro (befriend tutorial step 1, Cid slid in, both sprites visible).
2. Wait for Cid's narration to finish and her slide-out to play.
3. `restoreBefriendQuizEnemyUi` fires.
4. Befriend quiz begins with the `なまえは？` name prompt and answer buttons (Iron / Ant / Bug).
5. Observe: the enemy tetsu Pixi sprite is on screen, but **no HP bar and no name label** float above or below it. The player has no feedback about what creature they're trying to befriend or its current HP.

### Expected

After Cid slides out and the quiz starts, the enemy's DOM HP bar and `tetsu / てつ` name label should be visible over the sprite — exactly as they were before Cid interjected.

### Observed (in-browser evidence)

Enemy formation DOM (collected during the quiz):

```html
<div class="formation enemy-formation" id="enemy-formation">
  <div class="formation-slot" data-index="0" data-creature-id="tetsu" data-hp="1">
    <div class="formation-sprite formation-sprite--pixi-anchor"></div>
    <div class="formation-info formation-info--hidden">   <!-- ← HIDDEN -->
      <div class="formation-name-col">
        <div class="formation-romaji">tetsu</div>
        <div class="formation-hira">てつ</div>
      </div>
      <div class="formation-bars">
        <div class="formation-bar-row">
          <span class="formation-bar-label">HP</span>
          <div class="formation-hp-bar">
            <div class="formation-hp-fill" style="width:1.282%;background-color:var(--hp-red);"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

The HP bar and name element exist in DOM — they're just hidden by the `formation-info--hidden` class on the `.formation-info` wrapper (`public/game.css:361`).

### Root cause

`public/js/ui/combat-dom.js:124-127` — every enemy `formation-info` is created with `formation-info--hidden` applied:

```js
const infoBox = document.createElement('div');
infoBox.className = 'formation-info' + (side === 'enemy' ? ' formation-info--hidden' : '');
// Hidden initially for enemy side — revealed after Pixi entrance animation completes
```

The hidden class is removed in two places:

1. `public/js/pixi/formation.js:239` — inside `_updateFormations`, when an entering sprite finishes its slide-in animation (`sprite._entering` transitions to `false`), it calls `revealFormationInfo(sprite._side, sprite._dataIndex)`.
2. `public/js/pixi/formation.js:379` — inside `showFormation` itself on the initial placement path (non-entering case).
3. `public/js/ui/befriend.js:356` — explicit safety reveal during the pre-quiz `まって！！` setup.

**The bug chain after Cid's tutorial narration ends:**

1. Cid narration completes. `slideOutScene.hideNpcSprite({ slideOut: true })` removes Cid from Pixi.
2. `restoreBefriendQuizEnemyUi` runs (`public/js/ui/befriend-quiz-state.js`):
   ```js
   hideEnemy?.();
   if (target) showFormation?.('enemy', [target]);
   ```
3. `showFormation('enemy', [target])` **rebuilds the DOM formation** (container `innerHTML = ''`, then creates new slot with `formation-info--hidden`).
4. `showFormation` then delegates to `scene.syncCreatures({ allies, enemies: [target] })` via `creature-row.js:179` (or similar). BattleScene's `syncCreatures` sees the enemy already has a Pixi sprite for `tetsu` (it was never removed — see Bug #5). So **it short-circuits and does not trigger a fresh entrance animation**.
5. With no new entering sprite, `_updateFormations` never sees `sprite._entering = true → false`, so `revealFormationInfo` is not called.
6. The `formation-info--hidden` class stays on the freshly-built DOM slot for the rest of the quiz.

In short: the DOM-rebuild-then-wait-for-Pixi-entrance reveal protocol assumes the Pixi sprite will also enter fresh. In the befriend flow (and thanks to Bug #5), the Pixi sprite never left, so it can't re-enter, so the reveal never fires.

### Introduced by

Same commit family as Bugs #1, #3, #5 — `f09885ee` and `42996496`. Pre-refactor, DOM and Pixi formation lifecycles were coupled through `_defaultCtx`, so rebuilding one rebuilt the other and the reveal always fired. Decoupling them in the refactor means every rebuild path needs to re-verify the reveal condition explicitly.

### Structural fix

Fixing Bug #5 properly (scene-owned `pauseForNpcInterjection` / `resumeFromNpcInterjection` that actually fade out and back in the enemy Pixi sprite) also fixes Bug #6 — because on resume, the Pixi sprite re-enters, `_updateFormations` ticks `_entering → false`, and `revealFormationInfo` fires naturally.

Independent belt-and-braces fixes worth considering:

1. **Reveal-on-reuse.** In `showFormation` (or in `BattleScene.syncCreatures`), when placing a creature whose Pixi sprite already exists and is in its resting position (not entering), immediately call `revealFormationInfo(side, dataIndex)` so the reveal doesn't depend on an entrance animation firing.
2. **Make the reveal idempotent and state-driven.** The info box should derive visibility from creature state + scene state, not from a one-shot animation callback. For example, a `data-formation-info-state` attribute on the slot driven by scene state machine, mirrored to CSS. That way rebuilds/reuses/transitions never desync.
3. **Tighten `restoreBefriendQuizEnemyUi` to call the scene's resume method** rather than re-rebuilding DOM from scratch. The quiz doesn't need a DOM rebuild if the enemy data hasn't changed — only a reveal.

---

## Bug #7 — `SceneDisposedError: method '_diff' called after exit()` during combat → room transition

**Severity:** High — not immediately visible to the player (error is caught and logged), but indicates the scene lifecycle contract is being violated. Trailing `syncCreatures` calls land on a BattleScene that's already been exited. Could be masking sprite-leak bugs or race-triggering other issues downstream.

### Reproduction

1. Win or end combat (in this session: befriend `tetsu` → combat ends).
2. Transition to the next room (a friendly NPC room in this case).
3. Scene manager tears down BattleScene and mounts the next scene.
4. Console shows:
   ```
   [creature-row] scene.syncCreatures failed
     SceneDisposedError: Scene 'BattleScene': method '_diff' called after exit()
   ```

### Root cause (provisional)

`public/js/ui/creature-row.js:163-181 render()`:

```js
export function render(creatures) {
  _creatures = creatures;
  currentActiveCreatures = creatures || [];
  showFormation('player', creatures);
  // ...
  if (!isSceneManagerInitialized()) return;
  const scene = getSceneManager().currentScene;
  if (!scene?.syncCreatures) return;
  const enemies = scene.formation?.lastFormationInput?.enemy?.creatures ?? [];
  scene.syncCreatures({ allies: creatures || [], enemies })
    .catch(err => console.error('[creature-row] scene.syncCreatures failed', err));
}
```

The guard checks `isSceneManagerInitialized` and `scene?.syncCreatures` — but not whether `scene.disposed` or `scene._exited`. When combat ends, `BattleScene.exit()` runs and flags the scene as exited, but `SceneManager.currentScene` still points at the old BattleScene briefly (or a `render()` call was queued before the transition completed). The subsequent `scene.syncCreatures({...})` hits the scene's `_guard('syncCreatures')` / `_diff` internal which throws `SceneDisposedError` because `exit()` has already fired.

The `.catch` swallows the error as a log, so the player doesn't see a crash — but the trailing intent (sync a set of allies) silently fails. If that trailing sync was supposed to e.g. add the newly-befriended `tetsu` as an ally Pixi sprite in the next scene, that never happens and we'd see a stale formation carried across the transition.

### Structural fix

1. **Check scene.disposed in creature-row.render's guard.** Cheap, minimal patch — but the underlying issue is that callers should never reach into an exited scene. Safer as belt-and-braces, not primary fix.
2. **Scene-transition queueing.** `SceneManager.setScene(newScene)` should complete the old scene's exit and the new scene's enter atomically; anything calling `render()` during the transition window should either wait on the transition promise or target the new scene. The current design appears to let `render()` fire at whatever `currentScene` happens to point at.
3. **Make `scene.syncCreatures` idempotent / tolerant when disposed.** Instead of throwing `SceneDisposedError`, a disposed scene should either buffer the sync for its successor (if the caller is re-render from a phase transition) or no-op cleanly. Throwing an error that nobody handles meaningfully just adds noise.
4. **Audit every call site that does `getSceneManager().currentScene.X(...)` without checking `.disposed`.** If we grep those, the set of trailing-call sites is probably small.

### Related

This is structurally the same category of problem as Bugs #1, #3, #5, #6 — DOM-side code making assumptions about the Pixi scene that the scene can silently refuse to honor. Fixing Bug #5's pause/resume and Bug #1/#3's always-on-scene guarantee both shrink the blast radius for this class of bug.

---

## Running notes

- Test approach: user drives browser manually; assistant watches console (`[ACT]`/`[EXP]`/`[CHK]`), runs `window.__inspector.fullScan()` when needed, and digs into source to identify root cause before reporting.
- Fix strategy agreed with user: **structural fixes only**, no minimal DOM-fallback patches.
- Priority order (per PR #2 description): tutorial sprite, friendly NPC sprites, enemy encounter sprite hygiene, multi-room stacking, boss render size, refresh-during-combat, post-death return to hub.

### Flows NOT yet exercised (high chance of hidden bugs)

Testing halted at the save-state soft-lock in the first friendly NPC room (Bug #2). The following flows have not been tested at all in this session and likely harbour additional bugs of the same family:

- Multi-room walk (3+ consecutive rooms) — stale NPC sprite accumulation across room transitions.
- Second combat encounter — whether sprites from the first encounter have been properly cleaned up.
- Boss encounter — boss sprite render size (known pre-existing state-serialization bug may compound).
- Shrine / quiz master / word-discovery NPCs — each calls `showNpcInDisplay` through a slightly different path; each may have its own "no active scene" edge case.
- Shop / item reward room — same class of NPC render as friendly-NPC; Bug #2 probably blocks it too until fixed.
- Speed Review room — entered from hub, may or may not re-use HubScene.
- Pause/resume during NPC interjection in non-tutorial contexts — e.g., befriend flow in runs past the tutorial.
- Page refresh during combat — save-state recovery path that's new for this refactor.
- Return-to-hub after death — scene disposal + hub re-entry.
- PvE/PvP parity (per CLAUDE.md rule) — the PR may have diverged PvE from PvP without touching both loops.

Recommend a full re-test of all of the above after fixes #1–#7 land, plus the Bug #4 inspector fix so any new regressions fail loudly instead of silently.

---

## Fixes applied (2026-04-17)

Structural fixes landed per `docs/superpowers/plans/2026-04-17-pr2-bulletproof-rendering-fixes.md`.
Branch: `fix/pr2-bulletproof-rendering` (22 commits, base `f97acf2d`).

### Summary of changes

- **Bug #2** — `sceneShowNpc` now replaces the dangling `pixiShowNpcSprite` reference in `public/js/ui/exploration-dom.js:133`. Friendly-NPC-room save-state unlocked. (`c1184b55`)
- **Bugs #1 + #3** — New `public/js/scenes/hub-scene.js` (`a0980bf6`) mounted at boot and on hub/prologue/area_selection/skillMaster phase entry via `ensureSceneForPhase()` in `public/game.js` (`e60f94e1`). PvP + run-end phases covered too (`7aaf65ea`). Every phase now has a scene with `background + npcs + creatures + labels` layers. Prologue entry adds a guardrail assertion (`27076619`, refined in `bced7381` + `a1ceb2f4`).
- **Silent-bail cleanup** — `sceneShowNpc` and `creature-row.render` now `console.error` when they encounter a missing or disposed scene (`90fdc8fc`, polished in `a2af3741`). Missing-scene regressions surface on first frame instead of rendering invisible sprites.
- **Bugs #5 + #6** — New `Scene.pauseForNpcInterjection`/`resumeFromNpcInterjection` API on the scene base class (`1efcacf7`, doc-polished in `304da0ff`). `befriend.js` tutorial step 1 and `tutorialRetry` paths route through it (`8239d38d`, style-polished in `3cf84b48`). Belt-and-braces reveal-on-reuse in `showFormation` for enemy formations whose Pixi sprite already exists (`6d8b8a76`, refactored to in-hand reference in `12fbf6e8`).
- **Bug #7** — Disposed-scene guard added to `creature-row.render` (`90fdc8fc`); every other `getSceneManager().currentScene.X(...)` call site audited — 4 sites in `room-transition.js` fixed (`d82c5fbe`) plus 6 sites in `game.js`/`combat-dom.js`/`befriend.js` (`45ff5621`).
- **Bug #4** — `inspector.checkCreatures` + `fullScan` now cover non-combat phases and NPC sprites (`07d06d28`). `[CHK] ✗` fires on "formation shown but zero Pixi sprites placed." False-positive suppression via a `data-pixi-backed` attribute on `#npc-display` so DOM-only NPC paths (NPC enemies in combat, Chippy, `skipPixi` shop dealer) don't trip the check (`94a3357a`). `countDomBars` returns `null` when the container is absent, letting the inspector skip the dom/state comparison outside combat.

### Test coverage

- 1431 pass, 16 fail (all 16 are pre-existing sudachipy tokenizer env failures).
- New tests: HubScene smoke + regression, exploration-dom ReferenceError guard, sceneShowNpc loud-fail, creature-row scene guards, befriend tutorial pause/resume wiring, combat-dom reveal-on-reuse (3 cases), Scene pause/resume (3 cases), inspector non-combat phases (4 cases).

### End-to-end playtest

Pending — the full Playwright walk-through of the re-test gate above is the last step. Each gate item from "Re-test gates after fixes land" should be exercised; results recorded in a follow-up `PLAYTEST_RESULTS` section below.

### Known deferred items

- `public/js/pixi/status-vfx.js:441` also checks `ctx.scene.disposed` without `_exiting`. Out of Task 10's `getSceneManager().currentScene` grep scope — track as a follow-up.
- Helper wrappers in `public/js/pixi/formation.js` (`getCreatureSpriteForScene`, `animateKOForScene`, etc.) are not `_exiting`-aware. They currently rely on `scene.formation` being truthy during the exit window — valid today, but worth tightening if another race surfaces.
- The "shared `FormationScene` base" refactor to consolidate HubScene + ExplorationScene + BattleScene formation code (flagged during Task 2 review). Deferred until a third data point emerges.
- `isBoss` state-serialization bug (flagged pre-existing in the original smoke test) — unaffected by this PR.

---

## PLAYTEST_RESULTS (2026-04-18)

Playtesting `fix/pr2-bulletproof-rendering` branch end-to-end via Playwright MCP against `npm run dev` at `http://localhost:5173`. User drives, assistant observes. Bugs logged below as encountered.

### Bug #8 — Cid sprite missing at skillMaster phase (Bug #1/#3 regression, narration path)

**Severity:** Blocker — re-test gate #1 ("Prologue: Cid sprite visible throughout") fails on the returning-player code path. Player sees a narration box labelled "Cid" with no character on screen. Same visual symptom as the original Bug #1, despite the HubScene-mounting fix.

**Encountered at:** First state observed on session load. Account already past prologue → phase transitions `no_save → skillMaster` directly (prologue narration re-run skipped). Starting Meadow background renders, fire creature (`hi`) renders on the meadow (so Bug #3 creature portion is fixed), but Cid's sprite is absent. Narration box shows `Cid` speaker label and "Each run you can get skills to make your party stronger." with a ▼ next-page indicator. Re-test gate #2 ("fire creature and Cid sprite both visible on the Starting Meadow background") half-passes: fire creature ✓, Cid ✗.

### In-browser evidence

DOM state (confirms DOM side of NPC display is active but sprite is blanked — classic Bug #1 footprint):

```
#npc-display          .classList: ['npc-display', 'visible']
#enemy-info           .classList: ['visible'] (textContent "Cid")
#enemy-sprite         src="", display:none, visibility:visible
#npc-display.dataset  pixiBacked: undefined
```

Pixi app layers (`window.__pixiApp().layers`):

```
background:  4 children  (meadow tiles rendered)
creatures:   0 children  (but inspector reports allies pixi:1 — rendered via scene layer)
effects:     1 child
labels:      0 children
overlay:     2 children (alpha:0 transitions)
```

**No `npcs` layer on the Pixi app root.** HubScene is supposed to provide one as a scene-owned layer (per fix summary, "every phase now has a scene with `background + npcs + creatures + labels` layers"). We were unable to verify scene state directly — `window.__sceneManager` / `window.__getSceneManager` are not exposed for testing. However, the fact that zero Pixi sprites are rendering on any npc-capable layer, combined with zero `console.error` from the loud-fail guards (`sceneShowNpc` / `creature-row.render`), suggests the call path that should render Cid **never reaches `sceneShowNpc` at all** on this flow.

Inspector (`window.__inspector.fullScan()`):

```json
{
  "ok": true,
  "mismatches": [],
  "summary": {
    "allies":  { "state": 1, "dom": 1, "pixi": 1 },
    "enemies": { "state": 0, "dom": 0, "pixi": 0 },
    "npcs":    { "dom": 0, "pixi": 0 }
  },
  "phase": "skillMaster"
}
```

**Inspector is lying:** `#npc-display.visible` is true with `#enemy-name` = "Cid" and `#enemy-info.visible`, so DOM state unambiguously has an active NPC display, yet `summary.npcs.dom = 0`. The inspector's DOM-NPC counter is missing this case. Likely cause: the counter only counts `#npc-display[data-pixi-backed]` nodes (or an equivalent scene-backed attribute) and the skillMaster narration path doesn't set that attribute. Bug #4's fix is incomplete — this is a second vacuous-pass pocket.

Intent log (since page load, chronological):

```
[PixiApp] Canvas inserted: 786 x 524
[PixiApp] Init complete
[ACT] Hide enemy formation × 3  → [CHK] ✓
[ACT] Hide player formation     → [CHK] ✓
[DEBUG] updateGameState called. phase: no_save pendingBranch: undefined currentRoom: undefined
[DEBUG] updateGameState called. phase: skillMaster pendingBranch: undefined currentRoom: 0
[ACT] Hide enemy formation   → [CHK] ✗ DOM_GHOST: player dom=0 but state=1 alive
[ACT] Hide enemy formation   → [CHK] ✗ DOM_GHOST: player dom=0 but state=1 alive
[ACT] Show player formation  → [EXP] player: 1 visible sprites, 1 HP bars → [CHK] ✗ DOM_GHOST: player pixi=0 visible but state=1 alive
[ACT] Hide enemy formation   → [CHK] ✗ DOM_GHOST: player pixi=0 visible but state=1 alive
[NarrationBox] Final displayed text: Each run you can get skills to make your party stronger.
[API Timing] POST /api/game/skill-master-offers -> 200 in 48ms
```

Zero errors, one harmless warning. **No `[ACT] Show NPC` / `[ACT] Show Cid` event anywhere in the log.** The narration box is populated with Cid's line, but no code path ever calls `scene.showNpcSprite(cidSprite)` or `sceneShowNpc(cidSprite)` for this phase entry — so neither the scene nor the loud-fail guards ever fire.

Note: several `[CHK] ✗ DOM_GHOST: player ...` fired during the phase transition window — these are transient (the inspector catches a gap between DOM scaffolding and Pixi placement). Worth noting but the final settled state has `allies pixi:1` (fire creature visible), so the transient mismatches self-resolve. The **persistent** failure is the NPC path.

### Suspected root cause

The original Bug #1 reasoned that the prologue's `playPrologue()` fires `scene.showCid()` → `showNpcInDisplay()` which blanks `#enemy-sprite` and delegates to `sceneShowNpc`. The fix mounted a HubScene so `sceneShowNpc` would route to a real scene. **But `playPrologue()` only runs for first-time players.** A returning account (past prologue) lands directly in `skillMaster` via `updateGameState({ phase: 'skillMaster', currentRoom: 0 })`, and the skillMaster-entry flow shows Cid's narration via `ctx.narration.showNarration(line, { speaker: 'Cid' })` **without ever calling the NPC-display helpers**.

Result: the narration box shows Cid as speaker (text-only), the `#enemy-info` DOM gets set via an unrelated path, and the Pixi sprite is never requested. The bug is a **missing show-NPC call in the skillMaster tutorial-entry flow**, not a scene-mounting failure.

Candidate files to inspect:
- `public/js/ui/skill-master-ui.js` (or equivalent) — the skill-offer flow.
- `public/game.js` around `updateGameState` / `updateScene` for `phase === 'skillMaster'`.
- Any tutorial/skill-master narration helpers that use `showNarration({ speaker })` without pairing the show-NPC call.

Recommended fix direction: every speaker attribution in narration should have a matching sprite-show pre-step. Ideally formalize as `narration.showSpeakerLine(speaker, line)` that wraps both calls, so future contributors can't introduce this footgun. Alternatively: make the speaker attribution reactive — when a narration fires with `{ speaker: 'Cid' }` and no NPC sprite is currently shown, automatically call `sceneShowNpc(cidSprite)`.

### Inspector follow-up (Bug #4 tail)

`summary.npcs.dom = 0` despite `#npc-display.visible` with `#enemy-name="Cid"` and `#enemy-info.visible` is itself a Bug #4-family vacuous pass. Whatever `data-pixi-backed`-based gating was added to suppress DOM-only NPC paths (shop dealer etc.) is now suppressing legitimate NPC displays too. The inspector should count visible `#npc-display` as a DOM NPC whenever the name label is present and non-empty, regardless of `pixiBacked`. Without this, Bug #8 would have been a silent `[CHK] ✓` as well.

### Screenshot

`tmp/pr2-playtest-cid-missing.png` (deleted after capture) — Starting Meadow background with fire creature sprite mid-meadow, narration box bottom-center labelled "Cid" containing "Each run you can get skills to make your party stronger.", three skill-offer cards below. No Cid sprite anywhere on the canvas.

---

### Bug #9 — Mini-boss encounter: NPC and all 3 enemy creatures appear simultaneously (choreography broken)

**Severity:** High — breaks the intended mini-boss reveal choreography. Player sees the miniboss NPC and all their creatures pop in at the same moment, instead of the NPC sliding in to say their intro lines first and the creatures revealing one by one after the NPC exits. Expected flow per user: **NPC slides in → NPC speaks lines → NPC slides out → creatures slide in 1-by-1**. Actual flow: NPC and all 3 creatures appear together at full alpha while the NPC is still mid-sentence.

**Encountered at:** Room 5, `phase: room_encounter → combat`, mini-boss NPC `Child` (id `kodomo` or similar) with 3 creatures. Player had cleared rooms 0–4 (all friendlyNpc rooms on this path) and walked into the encounter room. Combat phase fired, narration box showed `Child` with line `いくよ！ iku yo (to go)` while all four sprites (Child NPC + 3 enemy creatures) were already rendered on stage at alpha=1.

### In-browser evidence

Pixi stage dump at user-pause moment (Child speaking, expected to be alone):

```
/0/0–/0/3   TilingSprite × 4         visible=true, alpha=1   ← meadow background
/5/0/0      Sprite  (ally hi)        visible=true, alpha=1, (79, 76)
/5/0/1      Sprite  (ally 2)         visible=true, alpha=1, (85, 184)
/5/1/0      Sprite  (enemy 1)        visible=true, alpha=1, (271, 131)  ← should not be visible yet
/5/1/1      Sprite  (enemy 2)        visible=true, alpha=1, (283, 78)   ← should not be visible yet
/5/1/2      Sprite  (enemy 3)        visible=true, alpha=1, (259, 183)  ← should not be visible yet
/7/0        Sprite  (Child NPC)      visible=true, alpha=1, (275, 131)  ← overlaps enemy 1
```

The NPC at `(275, 131)` physically overlaps enemy slot 1 at `(271, 131)`. The 3 enemy creatures are not faded/hidden during the NPC's intro lines.

Inspector:

```json
{
  "ok": false,
  "mismatches": [{ "type": "DOM_GHOST", "detail": "enemy dom=0 but state=3 alive" }],
  "summary": {
    "allies":  { "state": 2, "dom": 2, "pixi": 2 },
    "enemies": { "state": 3, "dom": 0, "pixi": 3 },
    "npcs":    { "dom": 0, "pixi": 1 }
  },
  "phase": "combat"
}
```

Note the `enemy dom=0 but state=3 alive` DOM_GHOST: enemy DOM formation has been cleared (presumably by `hideFormation('enemy')` as part of the NPC interjection path), but the 3 enemy Pixi sprites were never hidden — they went live the moment combat entered, same as the ally formation. Same class of DOM↔Pixi desync as Bugs #5/#6, new symptom.

Intent-log slice around the transition:

```
[ACT] Hide enemy formation × 3     → [CHK] ✓
[ACT] Show player formation: 2 total, 2 alive  → [CHK] ✓
[API Timing] POST /api/game/start-creature-encounter -> 200 in 25ms
[DEBUG] updateGameState called. phase: combat pendingBranch: undefined currentRoom: 5
[NarrationBox] Final displayed text: いくよ！ iku yo (to go) "Child"
```

There is **no `[ACT] Show enemy formation` event** at the combat-enter boundary for this mini-boss encounter. The 3 enemy Pixi sprites were placed directly by the scene (or by BattleScene's initial `syncCreatures` pass) with no corresponding DOM formation, and no choreography pause for the NPC monologue. Compare with Bug #5's pattern: `BattleScene` assumes combat begins with enemies already on-stage; the NPC-introduces-the-boss flow needs to hold them off-stage until the NPC exits.

### Suspected root cause

Mini-boss room flow fires `/api/game/start-creature-encounter` → server returns combat state with 3 enemies → client transitions to `phase: combat` → `BattleScene` mounts and immediately places all 3 enemy sprites in its `syncCreatures` initial seed. Separately, the NPC intro system fires `scene.showNpcSprite(childSprite)` and queues narration lines. The two streams run concurrently with no sequencing.

Expected implementation: the NPC-intro-boss encounter should pause enemy rendering until the NPC's narration completes. This is the same conceptual need as Bug #5's `scene.pauseForNpcInterjection({ fadeEnemies: true })`, but applied to **encounter start** rather than mid-combat befriend. Candidate pattern:

1. On mini-boss encounter enter, keep enemy formation state-only (do not seed BattleScene with enemies yet).
2. Mount BattleScene with `allies` only; `enemies: []`.
3. Call `scene.showNpcSprite(childSprite, { slideIn: true })`.
4. Play NPC narration lines.
5. Call `scene.hideNpcSprite({ slideOut: true })`.
6. Call `scene.syncCreatures({ allies, enemies })` to slide the enemies in — ideally staggered (one at a time with 150–300ms delay between each).

Alternatively: extend the pause/resume API from Bug #5's fix to cover "enemies not yet revealed" mode on combat entry, and have the mini-boss intro flow gate the reveal on narration completion.

### Files likely involved

- `public/js/scenes/battle-scene.js` (or `BattleScene.enter` / constructor) — initial enemy seed behavior.
- `public/js/scenes/scene.js` — pause/resume API (from Bug #5 fix).
- The encounter-start flow in `game.js` / combat-loop / whatever owns `/api/game/start-creature-encounter`'s client-side handler.
- The mini-boss NPC-intro invocation site (grep for `Child` / `kodomo` + `showNpcSprite`).

### Screenshot

`tmp/pr2-playtest-miniboss-simultaneous.png` (deleted after capture) — Starting Meadow with fire creature (ally, top-left) and the Child NPC character rendered in the center, one small faded enemy creature silhouette visible at lower-center (behind NPC), and two more enemies implied by the Pixi dump (covered by the narration box overlay in the screenshot but at alpha=1). Narration box labelled `Child` with `いくよ！ iku yo (to go)`.

---

### Sidebar observations surfaced during Bug #9 playtest

These are not new bugs but re-confirmations / tails of existing ones. Logging here so the fixer can correlate.

**Bug #7 re-occurrence (SceneDisposedError on combat→room transition):**
```
[ERROR] [creature-row] scene.syncCreatures failed
   SceneDisposedError: Scene 'BattleScene': method '_diff' called after exit()
```
Fired exactly once, on the combat → room transition after winning the first (tutorial) combat against `tetsu`. Guard that was supposed to catch this (`creature-row.render` disposed-scene check per fix summary) did not prevent it — the `console.error` branch fired instead of the guard. May mean the guard only covers `scene.disposed` and not `scene._exiting`, consistent with the "known deferred items" note about `status-vfx.js:441`. Worth confirming the `creature-row.render` guard actually short-circuits on `_exiting` too.

**Bug #1/#3 family continues to fail on friendlyNpc rooms:**
Every `friendlyNpc` room this run (rooms 1, 2, 3, 4) produced:
```
[CHK] ✗ DOM_GHOST: npc display pixi-backed but 0 NPC pixi sprites — scene.showNpcSprite may have silently bailed
```
NPC trainers on friendly rooms are setting `#npc-display[data-pixi-backed]` (good — that's the inspector hint) but `scene.showNpcSprite` is either silently bailing or not being called at all. The loud-fail branch of `sceneShowNpc` is NOT firing (no `console.error` in the log for these transitions), which means the code path **never even reaches `sceneShowNpc`** — same pathology as Bug #8 on skillMaster. Strongly suggests the show-NPC helper is skipped on the `friendlyNpc` phase entry, not just on `skillMaster`.

Re-test gate #7 ("NPC sprite renders with name label and greeting narration") fails: the greeting fires but the sprite is missing on every friendly NPC room. The inspector `[CHK] ✗` is the new-signal win from the Bug #4 fix (it correctly flags this now), but the underlying Bug #1/#3 fix is incomplete — only the HubScene-mounted prologue path got patched; other phases that show NPCs are still on the broken path.

**Re-test gate status so far (partial — playtest continues):**

- ❌ Gate 1 — Prologue Cid visible: N/A (returning account skips prologue), but analogous **skillMaster Cid missing** → Bug #8.
- ❌ Gate 2 — skillMaster fire creature + Cid sprite both visible: fire creature ✓, Cid ✗ → Bug #8.
- ✓ Gate 3 — First combat: enemy slides in, ally renders, HP bars correct. Worked visually for the tutorial `tetsu` combat.
- ✓ Gate 4 — Befriend threshold triggers Fight/Talk + tutorial step 1. Confirmed firing.
- ⚠ Gate 5 — Cid slides in for "wants to talk": not directly re-verified in this pass. Narration fired (`Wow! This creature wants to talk!`). Cid sprite rendering status unclear from console evidence alone.
- ✓ Gate 6 — Befriend quiz correct → enemy joins party. `tetsu` added to party, now at size 2.
- ❌ Gate 7 — Friendly NPC room: NPC sprite renders with greeting. **Missing on every friendly NPC room (rooms 1–4)** — see sidebar above.
- ⏸ Gate 8 — Refresh mid-friendly-NPC: not tested yet.
- ✓ Gate 9 — Walk 3+ consecutive rooms: 5 rooms walked, no stale sprite accumulation detected visually.
- ⏸ Gate 10 — Boss encounter at 120px: current encounter is a mini-boss, not the area boss. Pending.
- ⏸ Gate 11 — Lose combat → return to hub: not tested yet.

Playtest continuing.

---

## Fixes applied (2026-04-18)

Bugs #8 and #9 addressed structurally on top of the 2026-04-17 fix set. Branch `fix/pr2-bulletproof-rendering` (25 commits, base `f97acf2d`).

### Bug #8 — Cid sprite on skillMaster (+ follow-up for friendlyNpc tail)

- Broadened the scene resolver used by the tutorial/skillMaster flow: `getExplorationScene` → `getSceneWithNpcs`. The new helper accepts any scene that exposes an `npcs` layer (HubScene, ExplorationScene, BattleScene), so Cid's Pixi sprite renders whenever a returning account lands in skillMaster with HubScene mounted. Exported for testability. (`6aa0ab4e`)
- Added `showCidForSkillMaster()` and wired it into `renderSkillMaster`'s non-tutorial branch so every skillMaster room shows Cid, not just `tutorialStep === 0`. Narration now carries `{ speaker: 'Cid' }` so the narration box speaker label matches the sprite. (`6aa0ab4e`)
- New tests `tests/unit/ui/exploration-scene-helper.test.js` cover the resolver's five cases (no scene / disposed / exiting / no-npcs-layer / valid scene) and confirm it resolves HubScene, ExplorationScene, and BattleScene equivalently.

**Verified in Playwright:** fresh run → starter select → start run. Phase transitions to `skillMaster`. Cid slides in on the right side of the meadow; `inspector.fullScan()` reports `npcs.pixi: 1`, no mismatches. Narration: `どの能力？` with speaker `Cid`.

### Bug #9 — Miniboss encounter enemy reveal choreography

- Rewrote the NPC-intro path inside `startEncounter()`: mount BattleScene with `enemies: []` so the stage is empty while the NPC slides in, then pass `{ enemies, allies }` to `playNpcBattleIntro` so it can reveal them AFTER the NPC leaves. (`5c22d258`)
- Extended `playNpcBattleIntro` with an optional `{ enemies, allies }` opt. When supplied, the function calls `scene.syncCreatures({ allies, enemies, initial: true })` after the NPC slide-out so the enemies enter on a cleared stage via the existing formation slide-in animation. Back-compat preserved — callers that omit the opt see the legacy behaviour. (`5c22d258`)
- New tests `tests/unit/ui/npc-battle-intro.test.js` assert: (a) the call order `showNpcSprite → hideNpcSprite → syncCreatures` when `enemies` is provided; (b) `syncCreatures` forwards all enemies + allies with `initial: true`; (c) no `syncCreatures` call when `enemies` is omitted (back-compat); (d) no throw when the scene exits mid-flight.

**Unit-test verified;** visual verification deferred to dev deploy — reaching a mini-boss encounter from a fresh run requires a full tutorial combat + room walk (~8 interactions).

### Open items from this playtest pass

- Bug #1/#3 tail on friendlyNpc rooms (`[CHK] ✗ npc display pixi-backed but 0 NPC pixi sprites`) — the HubScene-mount fix doesn't cover the friendlyNpc phase redundant re-show path in `updateScene`. Needs a separate pass. Not addressed by Bug #8's fix because the root cause differs (double-call race in `playRoomTransition` + `updateScene` both re-firing `showNpcSprite`). Flagged for follow-up.
- Inspector DOM-NPC counter still reports `npcs.dom: 0` despite `#npc-display.visible` being true — Bug #4 tail. Not a functional bug, but hides genuine Bug #1-family regressions behind false-negative checks. Tracked for a follow-up inspector fix.
- Re-test gates 5, 8, 10, 11 not exercised in this pass (miniboss combat mid-flight already was visible; full win-then-continue not re-done). Dev-deploy playtest will cover these.
