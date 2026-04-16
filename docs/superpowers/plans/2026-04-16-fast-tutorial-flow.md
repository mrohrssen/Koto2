# Fast Tutorial Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skip hub/area/team selection for first-time players — prologue auto-starts them into Starting Meadow with the fire creature.

**Architecture:** Frontend-only change. After prologue dialogue ends, `playPrologue()` auto-selects the fire starter and chains existing API calls (start-run → select-area → confirm-creatures) to land the player at skill master. Conditional on first run ever (`totalRuns === 0`); prologue replays just mark complete and return to hub.

**Tech Stack:** Vanilla JS frontend, JSON data file

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `data/prologue.json` | Modify | Replace starter selection choice with two non-interactive Cid lines |
| `public/game.js` | Modify | Remove starter selection handler, add auto-start chain, remove New Game button |

No new files. No server changes.

---

### Task 1: Update prologue dialogue data

**Files:**
- Modify: `data/prologue.json:71-79`

- [ ] **Step 1: Replace the starter selection entry**

Replace the last entry (lines 71-79) in `data/prologue.json`:

```json
  {
    "id": "prologue-starter-gift",
    "speaker": "Cid",
    "narration": "Every adventurer needs a companion. Here, take this Fire creature."
  },
  {
    "id": "prologue-lets-go",
    "speaker": "Cid",
    "narration": "Now let's head to the Starting Meadow for your first exploration!"
  }
```

This replaces the `prologue-starter-selection` entry that had three choices (fire/water/wood).

- [ ] **Step 2: Syntax check**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/prologue.json'))" && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add data/prologue.json
git commit -m "data: replace starter selection with auto-fire gift dialogue"
```

---

### Task 2: Update playPrologue() to auto-start first run

**Files:**
- Modify: `public/game.js:805-842` (starter selection handler + post-loop prologue-complete)

- [ ] **Step 1: Remove the dead starter selection handler**

In `public/game.js`, delete lines 805-823 (the commented-out hiragana block and the `prologue-starter-selection` handler). The scene ID `prologue-starter-selection` no longer exists in prologue.json, so this code is unreachable.

Remove this block inside the `for` loop:

```js
    // if (prologueScene.id === 'prologue-hiragana-question' && result === 'kana-no') {
    //   await fetch('/api/game/kana-mode', {
    //     method: 'POST',
    //     headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ enabled: true })
    //   });
    // }

    if (prologueScene.id === 'prologue-starter-selection' && result) {
      const resp = await fetch(apiUrl('/api/game/select-starter'), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ starterId: result })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.state) updateGameState(data.state);
      }
    }
```

- [ ] **Step 2: Replace post-loop logic with auto-start chain**

Replace the post-loop section (after `scene.hideCid()`) — currently lines 827-842 — with:

```js
  scene.hideCid();

  // Auto-select fire starter
  await fetch(apiUrl('/api/game/select-starter'), {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ starterId: 'starter-fire' })
  });

  // Mark prologue as complete on server
  await fetch(apiUrl('/api/game/prologue-complete'), {
    method: 'POST',
    headers: getAuthHeaders()
  });

  // First run ever: skip hub/area/team selection — go straight to Starting Meadow
  const isFirstRun = (gameState.meta?.lifetimeStats?.totalRuns ?? 0) === 0 && !gameState.run;
  if (isFirstRun) {
    const runResult = await apiStartRun({});
    if (runResult?.state) updateGameState(runResult.state);
    const areaResult = await apiSelectArea('hajimari-no-hiroba');
    if (areaResult?.state) updateGameState(areaResult.state);
    const confirmResult = await apiConfirmCreatures(['hi']);
    if (confirmResult?.state) updateGameState(confirmResult.state);
  } else {
    // Replaying prologue — just update meta and return to hub
    updateGameState({
      ...gameState,
      meta: {
        ...(gameState.meta || {}),
        prologueComplete: true
      }
    });
  }
```

Note: `apiStartRun`, `apiSelectArea`, and `apiConfirmCreatures` are already imported in `public/game.js` (lines 136-140).

- [ ] **Step 3: Syntax check**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/game.js
git commit -m "feat: auto-start first run after prologue (skip hub/area/team)"
```

---

### Task 3: Remove New Game button

**Files:**
- Modify: `public/game.js:529-539` (`updateGameContent` no_save case)

- [ ] **Step 1: Simplify the no_save case**

Replace the current `no_save` case in `updateGameContent()`:

```js
    case 'no_save':
      // During prologue (player exists, not complete), leave action area for prologue CTAs only.
      if (!gameState.player || gameState.meta?.prologueComplete === true) {
        actions.setContent('<button class="action-btn action-btn-primary" id="new-game-btn">ニューゲーム</button>');
        document.getElementById('new-game-btn')?.addEventListener('click', createCharacter);
      } else {
        actions.clear();
      }
      break;
```

With:

```js
    case 'no_save':
      actions.clear();
      break;
```

The auto-`createCharacter()` at init (line 1908) already handles fresh registrations. The New Game button was dead code in the normal flow.

- [ ] **Step 2: Syntax check**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/game.js
git commit -m "fix: remove dead New Game button from no_save phase"
```

---

### Task 4: Run tests

- [ ] **Step 1: Run unit + integration tests**

Run: `npm test`
Expected: All tests pass. The tutorial-service tests should be unaffected since they test server-side logic. The prologue.json change removes a scene but doesn't break any server endpoint.

- [ ] **Step 2: If any test fails, fix and re-run**

The most likely failure would be an integration test that references `prologue-starter-selection` — check `tests/integration/helpers/game-flow.js:29` which calls `/select-starter` directly (this is fine, it still works as an endpoint).
