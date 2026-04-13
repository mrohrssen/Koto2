# Area Before Creature Select — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the game loop order so players pick their area before selecting their creature team.

**Architecture:** The `startNewRun()` frontend function currently shows the creature select modal, then calls `apiStartRun({ starterIds })`. We reverse this: `startNewRun()` calls `apiStartRun()` with no creatures (creating a bare run in `area_selection` phase), the player picks an area, then the creature select modal appears, and a new API endpoint `confirm-creatures` initializes the party and transitions to `exploring`.

**Tech Stack:** Express.js backend, vanilla JS frontend, existing phase machine.

**Note:** Line numbers are approximate — search for the relevant code patterns if they've drifted.

---

## Chunk 1: Backend — Accept bare run + new creature confirmation endpoint

### Task 1: Make `startRun()` work without starterIds

**Files:**
- Modify: `src/game/loop.js` — the `startRun` method (~line 369)
- Verify: `src/routes/game/run.js` — the `/start-run` route already conditionally validates

- [ ] **Step 1: Update `startRun()` in GameManager to defer creature initialization**

In `src/game/loop.js`, the `startRun` method currently initializes `creatureParty.active` from `starterIds` (~lines 392-397), with a fallback to `metaStarterId` if no IDs are provided (~lines 395-396). **Intentionally remove the `metaStarterId` fallback** — in the new flow, bare runs must have an empty party so the creature-pending phase check works. The `metaStarterId` fallback was for the prologue-only starter and is no longer needed since creature selection always happens explicitly.

Replace the creature initialization block (~lines 387-406) with:

```javascript
// Creature initialization is deferred until after area selection.
// If starterIds are provided (legacy/test path), initialize immediately.
// NOTE: the old metaStarterId fallback is intentionally removed — creature
// selection now always happens explicitly after area selection.
const ids = starterIds || (starterId ? [starterId] : null);
const crestMults = getCrestMultipliers(this.meta);
this.run.crestMults = crestMults;
this.run.itemBuffs.xpMultiplier = crestMults.xpMult;

if (ids && ids.length > 0) {
  this.run.creatureParty.active = ids.map(id => instantiateCreature(id));
  for (const creature of this.run.creatureParty.active) {
    applyCrestBonuses(creature, crestMults);
  }
}
// else: bare run — creatures will be confirmed via confirmCreatures() after area selection
```

- [ ] **Step 2: Verify `/start-run` route already handles bare runs**

The route in `src/routes/game/run.js` (~line 118) already conditionally validates:
```javascript
const ids = starterIds || (starterId ? [starterId] : null);
if (ids) { /* validate */ }
```
No change needed here. However, move `queueBackgroundDialogues(req)` so it only fires when creatures are present (it generates creature/NPC dialogues that need the party):

```javascript
// Only queue dialogues if creatures were provided (legacy path).
// For bare runs, dialogues are queued in /confirm-creatures instead.
const ids2 = starterIds || (starterId ? [starterId] : null);
if (ids2) {
  queueBackgroundDialogues(req);
}
```

- [ ] **Step 3: Verify syntax**

Run: `node --check src/game/loop.js && node --check src/routes/game/run.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/game/loop.js src/routes/game/run.js
git commit -m "refactor: make startRun work without starterIds (deferred creature init)"
```

### Task 2: Add `/confirm-creatures` endpoint

**Files:**
- Modify: `src/game/loop.js` (add `confirmCreatures` method after `startRun`)
- Modify: `src/routes/game/run.js` (add `/confirm-creatures` route after `/select-area`)

- [ ] **Step 1: Add `confirmCreatures()` method to GameManager**

In `src/game/loop.js`, add a new method after `startRun()`:

```javascript
/**
 * Confirm creature selection after area has been chosen.
 * Initializes the creature party for the current run.
 */
confirmCreatures(starterIds) {
  if (!this.run) {
    throw new Error('No active run');
  }
  if (!this.run.currentArea) {
    throw new Error('No area selected — select an area first');
  }
  if (this.run.creatureParty.active.length > 0) {
    throw new Error('Creatures already confirmed');
  }
  if (!starterIds || starterIds.length === 0) {
    throw new Error('No creatures selected');
  }

  this.run.creatureParty.active = starterIds.map(id => instantiateCreature(id));

  // Apply crest bonuses (crestMults was set during startRun)
  for (const creature of this.run.creatureParty.active) {
    applyCrestBonuses(creature, this.run.crestMults);
  }

  this.emitState();
  return { success: true };
}
```

- [ ] **Step 2: Add `/confirm-creatures` route**

In `src/routes/game/run.js`, add after the `/select-area` route:

```javascript
// Confirm creature selection (after area is chosen)
router.post('/confirm-creatures', async (req, res) => {
  const gameManager = req.gameManager;
  const { starterIds } = req.body;
  try {
    if (!starterIds || starterIds.length === 0) {
      return res.status(400).json({ error: 'No creatures selected' });
    }
    const meta = gameManager.getMeta();
    const collection = meta.creatureCollection || [];
    const validation = validateTeamSelection(collection, starterIds);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }

    gameManager.confirmCreatures(starterIds);
    req.saveGame();

    // Queue background dialogues now that party is finalized
    queueBackgroundDialogues(req);

    res.json({ state: req.getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

- [ ] **Step 3: Verify syntax**

Run: `node --check src/game/loop.js && node --check src/routes/game/run.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/game/loop.js src/routes/game/run.js
git commit -m "feat: add /confirm-creatures endpoint for post-area creature selection"
```

### Task 3: Update phase machine

**Files:**
- Modify: `src/game/phase-machine.js` — `derivePhase` function and `VALID_TRANSITIONS`

- [ ] **Step 1: Add creature-pending check to `derivePhase`**

In `src/game/phase-machine.js`, add after the `areaSelectionRequired` check (~line 174):

```javascript
// Creature selection pending — area chosen but no creatures yet.
// Frontend shows creature select modal; server stays in area_selection.
if (run.currentArea && run.creatureParty?.active?.length === 0) {
  return PHASES.AREA_SELECTION;
}
```

This keeps the server phase as `area_selection` while creatures are unconfirmed, preventing the frontend from rendering exploration without a party.

- [ ] **Step 2: Add `SKILL_MASTER` to `AREA_SELECTION` transitions**

In `VALID_TRANSITIONS`, the `AREA_SELECTION` entry currently allows `[EXPLORING, ROOM]`. After creature confirmation, `derivePhase` may return `SKILL_MASTER` (for initial skill pick). Add it:

```javascript
[PHASES.AREA_SELECTION]: [
  PHASES.EXPLORING,
  PHASES.ROOM,
  PHASES.SKILL_MASTER
],
```

- [ ] **Step 3: Verify syntax and run tests**

Run: `node --check src/game/phase-machine.js && npm test`
Expected: `OK` and all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/game/phase-machine.js
git commit -m "feat: derivePhase stays area_selection until creatures confirmed"
```

## Chunk 2: Frontend — Swap the flow

### Task 4: Rewire `startNewRun()` to skip creature select

**Files:**
- Modify: `public/game.js` — the `startNewRun` function (~line 844)

- [ ] **Step 1: Simplify `startNewRun()` — just start a bare run**

Replace the current `startNewRun()` function. It should call `apiStartRun()` with no arguments, update state, and let `updateUI()` render the area selection screen:

```javascript
async function startNewRun() {
  diagnostics.logAction('start_run');

  const result = await apiStartRun({});

  if (result?.state) {
    updateGameState(result.state);
    updateUI();

    // Tutorial: advance step 6→7 (tutorial complete)
    if (gameState?.meta?.tutorialStep === 6) {
      try {
        await fetch(apiUrl('/api/game/tutorial-advance'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedStep: 6 })
        });
      } catch (e) { console.warn('[Tutorial] advance failed:', e); }
    }
  }
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/game.js
git commit -m "refactor: startNewRun skips creature select, goes straight to area selection"
```

### Task 5: Add `apiConfirmCreatures` client function

**Files:**
- Modify: `public/js/api.js` (or wherever `startRun` / `selectArea` are exported — search for `export async function startRun`)
- Modify: `public/game.js` — add to API imports (~line 133)

- [ ] **Step 1: Find the API module**

Run: `grep -rn "export async function startRun" public/js/`

- [ ] **Step 2: Add `confirmCreatures` API function**

In the same file where `startRun` and `selectArea` are exported, add:

```javascript
export async function confirmCreatures(starterIds) {
  const res = await fetch(apiUrl('/api/game/confirm-creatures'), {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ starterIds })
  });
  return res.json();
}
```

- [ ] **Step 3: Import it in `game.js`**

In `public/game.js`, add `confirmCreatures` to the API imports (~line 133):

```javascript
confirmCreatures as apiConfirmCreatures,
```

- [ ] **Step 4: Verify syntax**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/api.js public/game.js
git commit -m "feat: add apiConfirmCreatures client function"
```

### Task 6: Wire creature select modal after area selection

**Files:**
- Modify: `public/game.js` — add `triggerCreatureSelect()` function
- Modify: `public/js/ui/exploration.js` — update `renderAreaSelection` onSelect callback
- Modify: `public/game.js` — pass `triggerCreatureSelect` via `explorationUI.init()` callbacks

**IMPORTANT:** Do NOT import `game.js` from `exploration.js` — this would create a circular dependency. `exploration.js` receives all `game.js` dependencies via callback injection through its `init()` function (~line 1742 of game.js).

- [ ] **Step 1: Create `triggerCreatureSelect()` in `game.js`**

Add after `startNewRun`:

```javascript
async function triggerCreatureSelect() {
  const collectionResult = await apiGetCreatureCollection();
  const catalog = collectionResult?.catalog;
  const collection = collectionResult?.collection;

  if (!catalog || catalog.length === 0) return;

  const starterIds = await showCollectionSelect(catalog, collection);
  if (!starterIds || starterIds.length === 0) {
    removeCollectionOverlay();
    // Player cancelled — forfeit the bare run and return to hub
    await apiForfeitRun();
    const state = await apiGetGameState();
    if (state) {
      updateGameState(state);
      updateUI();
    }
    return;
  }

  removeCollectionOverlay();

  const result = await apiConfirmCreatures(starterIds);
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
  }
}
```

- [ ] **Step 2: Pass `triggerCreatureSelect` to `explorationUI.init()`**

In the `explorationUI.init({...})` call (~line 1742 of game.js), add:

```javascript
triggerCreatureSelect,
```

- [ ] **Step 3: Receive the callback in `exploration.js`**

In `public/js/ui/exploration.js`, find the `init()` function where callbacks are destructured. Add `triggerCreatureSelect` to the destructured callbacks. Store it in a module-level variable.

- [ ] **Step 4: Update `renderAreaSelection` onSelect callback**

In `public/js/ui/exploration.js`, change the `onSelect` in `renderAreaSelection()`:

```javascript
onSelect: async (index) => {
  const result = await apiSelectArea(areas[index].id);
  if (result?.state) {
    updateGameState(result.state);
    // Don't call updateUI() — trigger creature selection first.
    // The area selection UI stays visible underneath the modal overlay.
    await triggerCreatureSelect();
  }
},
```

- [ ] **Step 5: Verify syntax of both files**

Run: `node --check public/game.js && node --check public/js/ui/exploration.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add public/game.js public/js/ui/exploration.js
git commit -m "feat: show creature select modal after area selection"
```

### Task 7: Fix creature row visibility for area_selection phase

**Files:**
- Modify: `public/game.js` — `updateCreatureRow` function (~line 481)

- [ ] **Step 1: Simplify the hide condition**

The existing code hides the creature row with `!gameState.run && phase is hub/no_save/area_selection`. But now a bare run exists during `area_selection`, so `!gameState.run` is false. Simplify to always hide for these phases regardless of run state:

```javascript
const hidePhases = ['hub', 'no_save', 'area_selection'];
if (hidePhases.includes(gameState.phase)) {
  scene.hideFormation('player');
  return;
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/game.js
git commit -m "fix: hide creature row during area_selection regardless of run state"
```

### Task 8: Final cleanup and test

**Files:**
- Verify: `public/game.js` — no orphaned code from old flow

- [ ] **Step 1: Verify `showCollectionSelect` and `removeCollectionOverlay` are still used**

Both are called from `triggerCreatureSelect()`. Confirm no dead references remain from the old `startNewRun`.

- [ ] **Step 2: Final syntax check**

Run: `node --check public/game.js && node --check public/js/ui/exploration.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit if any cleanup was done**

```bash
git add public/game.js
git commit -m "chore: clean up dead code from old creature-first flow"
```

## Chunk 3: Manual verification

### Task 9: Playtest the new flow

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Open Playwright and navigate to the game**

Navigate to `http://localhost:3000`. Log in or use an existing save.

- [ ] **Step 3: Verify the new flow**

1. From the hub, click "潜入" (Infiltrate)
2. Should see the area selection screen (NOT the creature select modal)
3. Pick an area
4. Should see the creature select modal (area selection UI visible underneath — this is expected)
5. Pick creatures and confirm
6. Should enter the exploring phase with the chosen area and creatures
7. Verify creature row shows correctly after selection

- [ ] **Step 4: Verify cancel behavior**

1. From hub, click "潜入"
2. Pick an area
3. In creature select, cancel/dismiss
4. Should forfeit the bare run and return to hub cleanly

- [ ] **Step 5: Take screenshots at each phase as evidence**
