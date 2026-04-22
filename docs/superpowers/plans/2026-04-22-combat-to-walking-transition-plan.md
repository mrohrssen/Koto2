# Combat-to-Walking Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut ~1 s of hard-coded delays on the combat-victory → walking path and flip the walking wobble on the instant combat ends, so the background parallax and the creature animation begin in lockstep (no more "BG moving, chars frozen" dead air).

**Architecture:** Three surgical changes, no new files, no new plumbing. (1) Delete a 300 ms `setTimeout` inside `showVictoryModal`. (2) Delete a 720 ms `await delay` inside `stopCombatLoop`. (3) Flip `battleScene.formation.walkingEnabled = true` at the same site that calls `setScrollState('accelerating')`. `BattleScene` already owns a `formation` context with the exact same `walkingEnabled` flag that `ExplorationScene` already toggles — we just pull the flip earlier by ~1 second.

**Tech Stack:** Vanilla JS ES6 modules, PixiJS 8 scene graph, no new deps.

**Design spec:** `docs/superpowers/specs/2026-04-22-combat-to-walking-transition-design.md`

---

## File Map

Only two files change:

- **Modify:** `public/js/ui/combat-loop.js` — two changes in `stopCombatLoop` (~line 1510 flip walkingEnabled, ~line 1529 delete 720 ms delay)
- **Modify:** `public/game.js` — one change in `showVictoryModal` (~line 1351 delete 300 ms setTimeout)

No tests are added: the spec establishes that this is a visual/timing change and the success criterion is manual playtest. Existing unit/integration tests must continue to pass.

---

## Task 0: Set up an isolated worktree

Multiple Claude sessions may share this repo. Per `CLAUDE.md`, all code work must happen in a dedicated worktree.

**Files:**
- None yet — this is environment setup.

- [ ] **Step 1: Confirm current location**

Run:
```bash
/usr/bin/git rev-parse --show-toplevel
/usr/bin/git status --short
```

Expected: repo root is `/Users/michia/Documents/Claude Projects/Koto2`; working tree may have unrelated staged or untracked files (that's fine — the worktree clones the current branch, not the working tree).

- [ ] **Step 2: Pull latest on the base branch**

From the main repo:
```bash
cd "/Users/michia/Documents/Claude Projects/Koto2"
/usr/bin/git fetch origin
```

- [ ] **Step 3: Create and enter the worktree**

```bash
cd "/Users/michia/Documents/Claude Projects/Koto2"
/usr/bin/git worktree add ../koto-wt-combat-walking-transition -b feature/combat-walking-transition dev
cd ../koto-wt-combat-walking-transition
```

Expected: new directory `koto-wt-combat-walking-transition` next to the repo root, branched from `dev`. The remainder of this plan assumes the working directory is this worktree.

- [ ] **Step 4: Install deps if missing**

```bash
[ -d node_modules ] || npm install
```

---

## Task 1: Drop the 300 ms pre-reload wait in `showVictoryModal`

This is the smallest, most isolated change — good warm-up. `showVictoryModal` is awaited exactly once (from `stopCombatLoop`), so we can rewrite its body in place.

**Files:**
- Modify: `public/game.js:1351-1369`

- [ ] **Step 1: Read the current function body**

Run:
```bash
sed -n '1351,1369p' public/game.js
```

Expected: the function matches the block shown in Step 2 under "old_string".

- [ ] **Step 2: Replace `setTimeout` with an immediate async IIFE**

Use the Edit tool on `public/game.js`:

old_string:
```js
function showVictoryModal(result) {
  audio.stopBGM();
  actions.clear();

  if (result.newCollectionAdditions?.length > 0) {
    showCollectionToast(result.newCollectionAdditions);
  }

  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        await loadGameState();
        updateUI();
      } finally {
        resolve();
      }
    }, 300);
  });
}
```

new_string:
```js
function showVictoryModal(result) {
  audio.stopBGM();
  actions.clear();

  if (result.newCollectionAdditions?.length > 0) {
    showCollectionToast(result.newCollectionAdditions);
  }

  return (async () => {
    try {
      await loadGameState();
      updateUI();
    } catch (err) {
      console.error('[showVictoryModal] state reload failed', err);
    }
  })();
}
```

**Why this shape:** the original `new Promise(…setTimeout(…, 300))` pattern (a) waited 300 ms for no visible reason and (b) swallowed errors in `loadGameState` via the `finally {resolve()}`. The async IIFE returns the same `Promise<void>` contract to the single awaiter at `combat-loop.js:1583` while surfacing errors to the console. The outer `.catch` at the caller still guards against rejection; see `combat-loop.js:1587-1591`.

- [ ] **Step 3: Syntax-check the modified file**

Run:
```bash
node --check public/game.js && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Run the test gate**

Run:
```bash
npm test
```

Expected: pass (same Tier 1+2 suite that passes on `dev`). If anything fails that passed on `dev`, stop and investigate before continuing — the change is pure-sync-to-sync, nothing should regress.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/game.js
/usr/bin/git commit -m "$(cat <<'EOF'
perf(combat): drop 300ms pre-reload wait in showVictoryModal

The 300ms setTimeout had no associated UI — it was pure dead air before
loadGameState. The async IIFE preserves the single caller's await contract
while surfacing state-reload errors instead of swallowing them via
Promise#finally.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds, no pre-commit hook errors.

---

## Task 2: Drop the redundant 720 ms delay in `stopCombatLoop`

The spec marks this delay as vestigial: KO animations are already awaited upstream and the 500 ms victory settle at `combat-loop.js:1122` already provides breathing room. The "Fix C" DOM clear comment just above it still makes sense — we just prune the reference to the deleted delay.

**Files:**
- Modify: `public/js/ui/combat-loop.js:1528-1537`

- [ ] **Step 1: Read the current block**

Run:
```bash
sed -n '1528,1537p' public/js/ui/combat-loop.js
```

Expected (whitespace exactly as below — copy into `old_string`):
```
  // Brief pause before narration (let final damage numbers display)
  await delay(720);

  // Fix C: Clear stale DOM enemy formation slots. Pixi enemy sprites were
  // already removed via syncCreatures above; this closes the window where
  // leftover DOM slots could trigger the showFormation() dedup path to
  // recreate ghost sprites. The 720ms delay above lets damage numbers finish.
  const enemyFormationEl = document.getElementById('enemy-formation');
  if (enemyFormationEl) enemyFormationEl.innerHTML = '';
```

- [ ] **Step 2: Remove the delay and retighten the comment**

Use the Edit tool on `public/js/ui/combat-loop.js`:

old_string:
```js
  // Brief pause before narration (let final damage numbers display)
  await delay(720);

  // Fix C: Clear stale DOM enemy formation slots. Pixi enemy sprites were
  // already removed via syncCreatures above; this closes the window where
  // leftover DOM slots could trigger the showFormation() dedup path to
  // recreate ghost sprites. The 720ms delay above lets damage numbers finish.
  const enemyFormationEl = document.getElementById('enemy-formation');
  if (enemyFormationEl) enemyFormationEl.innerHTML = '';
```

new_string:
```js
  // Clear stale DOM enemy formation slots. Pixi enemy sprites were already
  // removed via syncCreatures above; this closes the window where leftover
  // DOM slots could trigger the showFormation() dedup path to recreate
  // ghost sprites.
  const enemyFormationEl = document.getElementById('enemy-formation');
  if (enemyFormationEl) enemyFormationEl.innerHTML = '';
```

Two edits happen in one replacement: the `await delay(720)` line and its "Brief pause" comment are removed; the following comment loses its "Fix C:" prefix and the trailing sentence about the 720 ms delay (which no longer exists).

- [ ] **Step 3: Syntax-check**

Run:
```bash
node --check public/js/ui/combat-loop.js && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Run tests**

Run:
```bash
npm test
```

Expected: pass. No test exercises this 720 ms delay specifically — its removal changes timing only.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/js/ui/combat-loop.js
/usr/bin/git commit -m "$(cat <<'EOF'
perf(combat): drop redundant 720ms pause in stopCombatLoop

The delay was labeled "let final damage numbers display", but KO
animations are already awaited upstream at line 1044 and the 500ms
victory settle at line 1122 already gives the final popups room to
resolve. Removing it shaves ~0.7s off the visible combat-end → modal
path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Enable walking wobble on BattleScene the instant combat ends

The perceptual fix. We flip `walkingEnabled` on the *current* `BattleScene`'s formation context inside the same guarded `if` that already calls `syncCreatures({ enemies: [] })` — one guard, one intent. Ally sprites (kept alive through the victory modal by existing code) will wobble immediately, matching the background parallax that's already accelerating from the `setScrollState('accelerating')` line just above. When `ExplorationScene` takes over later in `stopCombatLoop`, its `onEnter` already sets `walkingEnabled = true`, so the wobble carries over seamlessly.

**Files:**
- Modify: `public/js/ui/combat-loop.js:1510-1526`

Preconditions already verified:
- `BattleScene` is imported at `combat-loop.js:29` — no new import.
- `BattleScene.formation` is the public `createFormationContext(this)` handle (`battle-scene.js:44`) — same surface as `ExplorationScene.formation`.
- `BattleScene` registers `_updateFormations(this.formation, dt)` as a per-frame updater (`battle-scene.js:57`), so flipping `walkingEnabled` takes effect on the very next tick.

- [ ] **Step 1: Read the current block**

Run:
```bash
sed -n '1510,1526p' public/js/ui/combat-loop.js
```

Expected: the block exactly matches the `old_string` below.

- [ ] **Step 2: Add the wobble flip inside the existing scene-guard block**

Use the Edit tool on `public/js/ui/combat-loop.js`:

old_string:
```js
  setScrollState('accelerating');
  const battleSceneForCleanup = mgr.currentScene;
  if (battleSceneForCleanup instanceof BattleScene && !battleSceneForCleanup.disposed && !mgr.transitioning) {
    try {
      await battleSceneForCleanup.syncCreatures({
        allies: getGameState()?.combat?.allies ?? getGameState()?.run?.creatureParty?.active ?? [],
        enemies: [],
      });
    } catch (err) {
      // Scene disposed mid-sync (e.g., rapid reload into post-combat): the
      // ExplorationScene transition below will re-seed sprites from the
      // updated ally roster, so there's nothing to recover.
      if (!(err instanceof SceneDisposedError)) {
        console.error('[CombatLoop] failed to clear enemy sprites via scene diff', err);
      }
    }
  }
```

new_string:
```js
  setScrollState('accelerating');
  const battleSceneForCleanup = mgr.currentScene;
  if (battleSceneForCleanup instanceof BattleScene && !battleSceneForCleanup.disposed && !mgr.transitioning) {
    // Flip walking wobble on immediately so the ally sprites (kept alive
    // through the victory modal) animate in lockstep with the BG parallax
    // acceleration above. ExplorationScene.onEnter will keep it on after
    // the scene transition below.
    battleSceneForCleanup.formation.walkingEnabled = true;
    try {
      await battleSceneForCleanup.syncCreatures({
        allies: getGameState()?.combat?.allies ?? getGameState()?.run?.creatureParty?.active ?? [],
        enemies: [],
      });
    } catch (err) {
      // Scene disposed mid-sync (e.g., rapid reload into post-combat): the
      // ExplorationScene transition below will re-seed sprites from the
      // updated ally roster, so there's nothing to recover.
      if (!(err instanceof SceneDisposedError)) {
        console.error('[CombatLoop] failed to clear enemy sprites via scene diff', err);
      }
    }
  }
```

- [ ] **Step 3: Syntax-check**

Run:
```bash
node --check public/js/ui/combat-loop.js && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Run tests**

Run:
```bash
npm test
```

Expected: pass. The flag flip runs before the `await`, so if any test stubs `syncCreatures` the flip still happens; nothing in the test suite asserts `walkingEnabled` stays false post-combat.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/js/ui/combat-loop.js
/usr/bin/git commit -m "$(cat <<'EOF'
feat(combat): start walking wobble when combat ends

Flip BattleScene.formation.walkingEnabled=true alongside the existing
setScrollState('accelerating') call in stopCombatLoop. The ally sprites
that persist through the victory modal now animate together with the
accelerating background parallax, eliminating the "BG whooshing past
frozen characters" visual during the post-victory window.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Visual verification via Playwright

Per `CLAUDE.md`: "All visual/CSS/animation/rendering changes MUST be verified with screenshots before reporting completion."

**ASK the user first** — `CLAUDE.md` explicitly prohibits launching Playwright blindly ("Chrome session conflicts are common"). If the user OKs, follow the `docs/playtest-guide.md` strictly.

**Files:**
- None — this is verification only. Any screenshots saved must be `rm`'d in the same tool block.

- [ ] **Step 1: Ask the user**

Send a message like:
> Ready to verify visually. Want me to launch Playwright to play through a combat end, or would you rather playtest it yourself?

Wait for a yes before continuing.

- [ ] **Step 2: Start dev server (if not already)**

Run (in background via Bash `run_in_background: true`):
```bash
npm run dev
```

Wait 5 seconds, then:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 3: Navigate to combat via Playwright MCP**

Follow `docs/playtest-guide.md` sections covering login → hub → area → room → combat. Before each interaction, take a `browser_snapshot` (refs change every DOM update). Dismiss narration by clicking OUTSIDE the narration box, per `CLAUDE.md`.

- [ ] **Step 4: Trigger combat end**

In combat, defeat all enemies. Standard PvE: flip vocab cards, swipe right (knew it) to attack until all enemies are KO'd.

- [ ] **Step 5: Capture the transition window**

Take screenshots at these moments (measure from the last KO fade):
1. Immediately at last KO.
2. +500 ms.
3. +1000 ms.
4. +1500 ms.
5. Once the ExplorationScene is clearly active (creatures in normal walking state).

Acceptance criteria (all must hold):
- The ally sprites visibly wobble within one frame of the last KO (screenshot #1 or #2 should already show wobble).
- The background parallax is accelerating in the same frames — no "BG scrolling, chars frozen" discrepancy at any point.
- No visual pop, ghost formation, or HP-bar-without-sprite gap during the transition.
- Damage numbers and KO fade complete naturally; nothing is cut off.
- Wall-clock from last KO to ExplorationScene visibly active is perceptibly under 2 seconds (previously ~3-5 s).

- [ ] **Step 6: Delete screenshots immediately**

Per `CLAUDE.md` session cleanup rules:
```bash
rm -f <each-screenshot-filename>
```

- [ ] **Step 7: Record the outcome**

If acceptance criteria pass, report to the user with a one-line summary.

If any criterion fails, STOP — do not attempt to fix on the fly. Report the exact failure mode and ask for guidance; the fix may require a revisit of the spec (e.g., walking wobble may need to also propagate through the scene transition differently).

- [ ] **Step 8: Stop dev server**

Bash process from Step 2 — either kill by PID if you captured it, or leave it running if the user wants to continue iterating; ask.

---

## Task 5: Finish the branch

Only after Task 4's acceptance criteria pass.

**Files:**
- None — git operations only.

- [ ] **Step 1: Confirm branch state**

Run:
```bash
/usr/bin/git log --oneline dev..HEAD
/usr/bin/git status --short
```

Expected: exactly three commits (from Tasks 1, 2, 3), clean working tree (screenshots deleted).

- [ ] **Step 2: Ask the user how to land it**

Offer:
> Three commits on `feature/combat-walking-transition` verified visually. How should I land it?
> (a) Merge into `dev` locally and push.
> (b) Open a PR to `dev`.
> (c) Leave the branch as-is for you to review.

Wait for a choice — do NOT auto-push or auto-merge per `CLAUDE.md`'s "Executing actions with care" guidance.

- [ ] **Step 3: Execute the chosen landing path**

Follow the standard git workflow in `CLAUDE.md` under "Git Workflow (Multi-Session Safe with Worktrees)". After landing, remove the worktree:
```bash
cd "/Users/michia/Documents/Claude Projects/Koto2"
/usr/bin/git worktree remove ../koto-wt-combat-walking-transition
/usr/bin/git branch -d feature/combat-walking-transition
```

---

## Self-Review Notes

- **Spec coverage.** All three spec changes map 1:1 to Tasks 1, 2, 3. The "PvE/PvP parity" spec section is handled pre-implementation via the grep we already ran: PvP (`public/js/ui/pvp-battle.js`) doesn't call `stopCombatLoop` or `showVictoryModal`, so these changes don't silently regress PvP — and there's no PvP path to also update. Visual verification in Task 4 maps to the spec's "Visual verification" section.
- **Placeholder scan.** No TBDs, no "add validation", no "similar to". Every code step shows the full replacement.
- **Type consistency.** `battleSceneForCleanup.formation.walkingEnabled` — `formation` is `scene.formation` in both `BattleScene` and `ExplorationScene`; `walkingEnabled` is the exact property name the formation ctx ships with (`formation.js:37`) and that `ExplorationScene.onEnter` already sets (`exploration-scene.js:66`). Consistent.
- **Non-obvious risk.** If something downstream of `showVictoryModal` relies on the 300 ms delay as an ad-hoc synchronization beat (e.g., a DOM cleanup racing a style transition), we'd see a cosmetic flicker. Task 4's screenshot acceptance criteria catches this. If it appears, the remediation is to reintroduce a narrower `await delay(N)` at the exact point that needed it — not to revert the whole change.
