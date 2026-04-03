# Ghost Sprite Bulletproof Fix (A+C) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate ghost enemy sprites that reappear during room transitions after combat victory.

**Architecture:** Two surgical additions to `stopCombatLoop()` in combat-loop.js. Fix A sets `combat.active = false` on the client immediately so `derivePhase()` stops returning `'combat'`, preventing any stray `updateUI()` from re-rendering defeated enemies. Fix C clears the DOM enemy formation after the 720ms damage-number delay, closing the window where stale DOM slots could trigger Pixi sprite recreation via the dedup path.

**Tech Stack:** Vanilla JS, PixiJS (client-side only)

---

## Context

After combat victory, the server sets `combat.active = false`, but the CLIENT-SIDE `gameState` retains `combat.active: true` until `loadGameState()` fetches fresh state ~2200ms later (720ms delay + 1500ms victory timer). During this window, any code path that triggers `updateUI()` → `updateScene()` sees `phase === 'combat'` (derived from `combat.active`) and re-renders the defeated enemy formation as live sprites — the "ghost" bug.

Four fixes were previously applied (uncommitted on `dev` branch) addressing specific symptoms. This plan adds the two remaining fixes that close all remaining ghost vectors.

### Task 1: Fix A — Set `combat.active = false` client-side immediately

**Files:**
- Modify: `public/js/ui/combat-loop.js:3272-3275`

- [ ] **Step 1: Add client-side combat deactivation after `combatActive = false`**

At line 3275 (`combatPausedForVocab = false;`), insert immediately after:

```js
  // Fix A: Immediately mark combat inactive on the client so derivePhase()
  // stops returning 'combat'. Any stray updateUI() during the victory window
  // will now hit the non-combat branch and call hideEnemies() instead of
  // re-rendering defeated enemies as live sprites.
  const gs = getGameState();
  if (gs.combat) {
    updateGameState({ ...gs, combat: { ...gs.combat, active: false } });
  }
```

This goes between line 3275 and the existing line 3277 (`if (result?.victory) combatEvents.emit('victory');`).

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

### Task 2: Fix C — Clear DOM enemy formation after damage numbers finish

**Files:**
- Modify: `public/js/ui/combat-loop.js:3312`

- [ ] **Step 1: Add DOM formation clear after the 720ms delay**

At line 3312 (`await delay(720);`), insert immediately after:

```js
  // Fix C: Clear stale DOM enemy formation slots. Pixi sprites were already
  // removed at pixiHideFormation('enemy') above; this closes the window where
  // leftover DOM slots could trigger the showFormation() dedup path to
  // recreate Pixi sprites. The 720ms delay above lets damage numbers finish.
  const enemyFormationEl = document.getElementById('enemy-formation');
  if (enemyFormationEl) enemyFormationEl.innerHTML = '';
```

This goes between the `await delay(720)` and the dialogue dismiss promise check.

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

### Task 3: Commit and update fix doc

- [ ] **Step 1: Update the fix doc status**

In `docs/fixes/2026-04-02-ghost-sprites-room-transition.md`, change:
- `**Status:** Applied, pending playtest verification` → `**Status:** Applied + bulletproofed (A+C)`
- Add a new section at the end:

```markdown
### 5. Bulletproof fixes (2026-04-03)

**Fix A — Client-side combat deactivation (combat-loop.js)**

`stopCombatLoop` now sets `gameState.combat.active = false` on the client immediately after `combatActive = false`. This makes `derivePhase()` return a non-combat phase instantly, so any `updateUI()` call during the ~2200ms victory window hits `scene.hideEnemies()` instead of re-rendering defeated enemies.

**Fix C — DOM formation clear after damage numbers (combat-loop.js)**

After the 720ms damage-number delay, the DOM `#enemy-formation` container is cleared (`innerHTML = ''`). This closes the window where stale DOM formation slots could trigger the `showFormation()` dedup path to recreate Pixi sprites via `skipEnter: true`.
```

- [ ] **Step 2: Commit all changes**

```bash
git add public/js/ui/combat-loop.js docs/fixes/2026-04-02-ghost-sprites-room-transition.md
git commit -m "fix: bulletproof ghost sprite elimination (A+C)

Fix A: Set combat.active=false client-side immediately in stopCombatLoop
so derivePhase() returns non-combat phase during the victory window.

Fix C: Clear DOM enemy formation after 720ms damage-number delay to close
the dedup-path sprite recreation window."
```
