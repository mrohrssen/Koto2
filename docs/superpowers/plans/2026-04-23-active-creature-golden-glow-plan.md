# Active Creature Golden Glow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floating white ring active-creature indicator with a warm gold silhouette-following glow that pulses intensity over 2s.

**Architecture:** Swap the `PIXI.Graphics` circle inside `_showActiveGlow` for a `GlowFilter` (from `pixi-filters`) attached to the active sprite's `.filters` array. The filter samples the sprite's alpha channel, so the halo follows the creature's exact shape. Public API (`showActiveGlowForScene` / `clearActiveGlowForScene`) and context fields (`ctx.activeGlow`, `ctx.activeGlowTickFn`) remain, but the stored shape is now `{ sprite, filter }` instead of a `Graphics`.

**Tech Stack:** PIXI.js 8.17 (already installed), `pixi-filters` 6.1 (new dependency, compatible with PIXI v8).

**Spec:** `docs/superpowers/specs/2026-04-23-active-creature-golden-glow-design.md`

---

## File Structure

- **Modify:** `package.json` — add `pixi-filters: ^6.1.5` to `dependencies`
- **Modify:** `package-lock.json` — auto-updated by `npm install`
- **Modify:** `public/js/pixi/formation.js`
  - Line 1 — add `GlowFilter` import from `pixi-filters`
  - Top-of-file constants block (after existing constants around line 17) — add glow config constants
  - Lines 185–220 — replace `_showActiveGlow` and `_clearActiveGlow` bodies
  - The `Graphics` import at line 1 must stay; it's used elsewhere in the file (`_updateFormations`, health bars, labels)

No other files change. `ctx.activeGlow` is read/written only inside `formation.js`, so external callers (`public/js/ui/combat-loop.js`, `public/js/ui/befriend.js`) need no edits.

---

## Task 1: Create isolated worktree

**Files:** none (git only)

- [ ] **Step 1: Confirm we're in main repo (not already a worktree)**

Run:
```bash
/usr/bin/git rev-parse --show-toplevel
```
Expected: `/Users/michiarohrssen/Documents/Claude/Koto` (or equivalent main checkout).

If it's already `.../koto-wt-*`, skip to Task 2.

- [ ] **Step 2: Sync main and create worktree**

Run:
```bash
cd /Users/michiarohrssen/Documents/Claude/Koto
/usr/bin/git pull origin master
/usr/bin/git fetch origin
/usr/bin/git worktree add ../koto-wt-golden-glow -b feature/active-golden-glow
```
Expected: new directory `../koto-wt-golden-glow` created on branch `feature/active-golden-glow`.

- [ ] **Step 3: Switch to worktree**

Run:
```bash
cd ../koto-wt-golden-glow
pwd
```
Expected: `.../koto-wt-golden-glow`.

All following tasks execute from this worktree.

---

## Task 2: Add pixi-filters dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install pixi-filters**

Run:
```bash
npm install pixi-filters@^6.1.5
```
Expected: exit 0, `package.json` and `package-lock.json` updated.

- [ ] **Step 2: Verify the package resolves and exports GlowFilter**

Run:
```bash
node -e "import('pixi-filters').then(m => { if (!m.GlowFilter) { console.error('missing GlowFilter'); process.exit(1); } console.log('ok'); })"
```
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
/usr/bin/git add package.json package-lock.json
/usr/bin/git commit -m "deps: add pixi-filters for GlowFilter"
```

---

## Task 3: Replace ring implementation with golden GlowFilter

**Files:**
- Modify: `public/js/pixi/formation.js` (line 1 import, lines ~17 constants, lines 185–220 glow functions)

- [ ] **Step 1: Add the `GlowFilter` import**

Open `public/js/pixi/formation.js` and edit line 1. Change:

```js
import { Sprite, Container, Texture, Graphics, Text } from 'pixi.js';
```

to:

```js
import { Sprite, Container, Texture, Graphics, Text } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
```

Keep the existing `Graphics` import — it is still used by `_updateFormations`, label background boxes, and status-stage rendering elsewhere in the file.

- [ ] **Step 2: Add glow config constants**

Find the existing constants near the top of the file (around lines 7–17: `DEPTH_SCALES`, `PLAYER_STAGGER_X`, `ENEMY_STAGGER_X`, `LABEL_FONT_SIZE`, etc.). Immediately after `const STAT_STAGE_NAMES = { atk: 'ATK', def: 'DEF' };` (line 17), insert:

```js
// Active-creature glow (spec: 2026-04-23-active-creature-golden-glow-design.md)
const GLOW_COLOR = 0xFFC94A;
const GLOW_DISTANCE = 14;
const GLOW_MIN_STRENGTH = 1.2;
const GLOW_MAX_STRENGTH = 2.8;
const GLOW_QUALITY = 0.2;
const GLOW_PERIOD_MS = 2000;
```

- [ ] **Step 3: Replace `_showActiveGlow`**

Locate lines 185–208 (the current `_showActiveGlow` function). Replace the entire function with:

```js
function _showActiveGlow(ctx, index) {
  _clearActiveGlow(ctx);
  const sprite = _getCreatureSprite(ctx, 'player', index);
  const { app } = getApp();
  if (!sprite || !app) return;

  const filter = new GlowFilter({
    distance: GLOW_DISTANCE,
    color: GLOW_COLOR,
    outerStrength: GLOW_MIN_STRENGTH,
    innerStrength: 0,
    quality: GLOW_QUALITY,
    alpha: 1,
  });
  sprite.filters = [filter];

  ctx.activeGlow = { sprite, filter };

  ctx.activeGlowTickFn = () => {
    if (!sprite || sprite.destroyed) return;
    const t = 0.5 + 0.5 * Math.sin((Date.now() / GLOW_PERIOD_MS) * 2 * Math.PI);
    filter.outerStrength =
      GLOW_MIN_STRENGTH + t * (GLOW_MAX_STRENGTH - GLOW_MIN_STRENGTH);
  };
  app.ticker.add(ctx.activeGlowTickFn);
}
```

- [ ] **Step 4: Replace `_clearActiveGlow`**

Locate lines 210–220 (the current `_clearActiveGlow` function). Replace the entire function with:

```js
function _clearActiveGlow(ctx) {
  const g = ctx.activeGlow;
  if (g?.sprite && !g.sprite.destroyed) {
    g.sprite.filters = [];
  }
  if (g?.filter) {
    g.filter.destroy();
  }
  ctx.activeGlow = null;
  if (ctx.activeGlowTickFn) {
    const { app } = getApp();
    app?.ticker.remove(ctx.activeGlowTickFn);
    ctx.activeGlowTickFn = null;
  }
}
```

No other code in `formation.js` references `ctx.activeGlow` as a `Graphics`, so the shape change (`{ sprite, filter }` vs `Graphics`) is contained.

- [ ] **Step 5: Syntax check**

Run:
```bash
node --check public/js/pixi/formation.js && echo OK
```
Expected: prints `OK`.

- [ ] **Step 6: Run full test suite**

Run:
```bash
npm test
```
Expected: all tests pass (Tier 1 + Tier 2). This change has no unit test coverage (it is purely visual, no pure-function logic), so we rely on the existing suite to confirm no regression in imports or module graph.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add public/js/pixi/formation.js
/usr/bin/git commit -m "feat(combat): replace active-creature ring with golden silhouette glow

Swaps the floating white ring for a pixi-filters GlowFilter attached
to the active sprite. Halo follows the sprite silhouette and pulses
outerStrength 1.2 -> 2.8 over 2s. Public API unchanged."
```

---

## Task 4: Visual verification in dev server

**Files:** none (manual / Playwright).

Per `CLAUDE.md`: "All visual/CSS/animation/rendering changes MUST be verified with screenshots before reporting completion."

- [ ] **Step 1: Start dev server**

Run (in the worktree):
```bash
npm run dev
```
Wait ~5 seconds for Vite + Express to be ready.

Verify in another shell:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```
Expected: `200`.

- [ ] **Step 2: Ask the user before opening Playwright**

Per `CLAUDE.md`: "Don't launch Playwright without asking first." Prompt the user to confirm. Only proceed if the user says yes.

- [ ] **Step 3: Launch Playwright and enter combat**

Using Playwright MCP browser:
1. `browser_navigate` to `http://localhost:5173`
2. Log in or resume per `docs/playtest-guide.md`
3. Start a run and progress to the first combat encounter

- [ ] **Step 4: Screenshot the active creature in combat**

When a player creature's move prompt appears:
1. `browser_snapshot`
2. `browser_take_screenshot` — save to `tmp/active-glow-check.png`
3. Visually confirm: the active creature shows a warm gold halo that follows its silhouette, pulsing softly; there is no white floating ring.

- [ ] **Step 5: Verify turn transition**

Attack with the active creature (swipe right on the flash card). Screenshot again after the next creature becomes active. Confirm: the glow leaves the previous creature (no lingering halo) and attaches to the new active creature.

Save to `tmp/active-glow-turn-change.png`.

- [ ] **Step 6: Verify befriend path**

Trigger a befriend action (はなす) on a creature the party can befriend. During the dialogue round, the acting creature should keep its gold glow. Screenshot to `tmp/active-glow-befriend.png`.

- [ ] **Step 7: Verify combat end clears glow**

Finish combat (win or flee). After the combat screen closes, navigate back to exploration. Screenshot the exploration scene and confirm no sprite has a residual filter. Save to `tmp/active-glow-cleared.png`.

- [ ] **Step 8: Verify PvP parity**

Start a PvP match from the pause menu (or whichever path the current build exposes). Confirm the same golden glow appears on the active PvP creature. Screenshot to `tmp/active-glow-pvp.png`.

Per `CLAUDE.md` PvE/PvP parity rule: if the glow does not appear in PvP, stop and investigate before declaring the task done. `combat-loop.js` is shared, so it should just work — but verify.

- [ ] **Step 9: Delete screenshots and stop dev server**

Per `CLAUDE.md` cleanup rule ("Delete screenshots immediately"):
```bash
rm tmp/active-glow-check.png tmp/active-glow-turn-change.png tmp/active-glow-befriend.png tmp/active-glow-cleared.png tmp/active-glow-pvp.png
```

Stop the dev server (Ctrl-C in its shell).

- [ ] **Step 10: If verification passed, no commit needed (no file changes). Done.**

---

## Task 5: Merge and cleanup

**Files:** none (git only)

- [ ] **Step 1: Push the feature branch (optional — skip if working local-only)**

From the worktree:
```bash
/usr/bin/git push -u origin feature/active-golden-glow
```

- [ ] **Step 2: Merge into master**

```bash
cd /Users/michiarohrssen/Documents/Claude/Koto
/usr/bin/git checkout master
/usr/bin/git pull origin master
/usr/bin/git merge feature/active-golden-glow
/usr/bin/git push origin master
```

- [ ] **Step 3: Remove worktree and branch**

```bash
/usr/bin/git worktree remove ../koto-wt-golden-glow
/usr/bin/git branch -d feature/active-golden-glow
```

Done.

---

## Self-review checklist (for the executor)

Before marking the plan complete:

- [ ] `package.json` contains `pixi-filters` in `dependencies`.
- [ ] `public/js/pixi/formation.js` imports `GlowFilter` from `pixi-filters`.
- [ ] `_showActiveGlow` attaches a `GlowFilter` to the sprite (no more `Graphics.circle(...)`).
- [ ] `_clearActiveGlow` removes filters from the sprite, destroys the filter, and removes the ticker fn.
- [ ] `ctx.activeGlow` is now `{ sprite, filter } | null`; `ctx.activeGlowTickFn` usage unchanged.
- [ ] Callers in `combat-loop.js` and `befriend.js` were **not** modified (API preserved).
- [ ] `npm test` passes.
- [ ] Playwright screenshots confirm: gold silhouette halo in combat, no ring, clean turn transitions, PvP parity, no residue after combat.
- [ ] All `tmp/` screenshots deleted before finishing.
