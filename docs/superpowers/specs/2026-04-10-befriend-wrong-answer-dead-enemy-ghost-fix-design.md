# Fix: Dead enemies reappear after befriend quiz wrong answer

**Date:** 2026-04-10
**Status:** Approved

## Problem

After a failed befriend quiz (wrong answer), dead enemy sprites reappear as small faded ghosts.

### Root cause

`animateKO()` (pixi/formation.js:516) tweens dead enemy sprites to `alpha=0` (fully invisible) and half scale. After a wrong befriend answer, `updateUI()` (combat-loop.js:3081) triggers `updateScene()` → `showFormation()` → Pixi dedup path, which sets dead enemies to `alpha=0.3` — overriding the animation's `alpha=0` and resurrecting invisible sprites as faded ghosts.

This only affects the befriend wrong-answer path because it's the only code that calls `updateUI()` after KO animations have played. Normal combat uses `syncFinalState()` which updates HP bars in-place without re-rendering formations.

## Fix

**File:** `public/js/ui/combat-loop.js`, lines 3067-3087

Replace the `updateUI()` call with targeted HP bar syncs, matching the pattern `syncFinalState()` already uses:

- Update game state (unchanged)
- Sync enemy HP bars via `updateEnemyHPAtIndex` / `updateEnemyHPBar`
- Sync ally HP bars via `updateCreatureHpBars`
- Keep existing `updateCreatureRowData` call

This avoids triggering formation re-render, so KO-animated sprites stay invisible.

## Scope

- ~5 lines changed in one code path
- No rendering contract changes
- No new abstractions
