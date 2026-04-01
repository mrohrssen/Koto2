# Dead Code Removal — Design Spec

**Date:** 2026-04-01
**Status:** Approved

## Problem

The codebase contains ~1,000 lines of dead code across ~12 files — fully implemented features that are never triggered at runtime. These "ghosts" add maintenance burden, confuse readers, and bloat the client bundle.

## Scope

Four independent deletion targets. Each is self-contained with no cross-dependencies.

### Target 1: Ultimate Attacks (~809 lines)

Full animation pipeline (5 elements), procedural audio synthesis (5 elements), 13 CSS classes, charge UI — none of it triggered. No creature has ultimate data, no combat code increments charge, entry points imported but never called.

**Files:**
- `public/js/ui/combat-effects.js` — Delete lines ~706-1088: `ULTIMATE_ELEMENT_CONFIG`, `playUltimateAnimation`, `_spawnUltimateParticles`, `_spawnElementOverlayEffect`, and 5 element overlay functions
- `public/js/ui/combat-audio.js` — Delete lines ~278-633: 5 element ultimate sound functions, `ULTIMATE_SOUNDS` table, `playUltimateSound` export
- `public/game.css` — Delete ~117 lines: all `ultimate-*` classes, `.creature-popup-ultimate-btn`, `.formation-slot.charged`
- `public/js/ui/scene.js` — Delete lines 211-215: `ultimateCharge` check
- `src/game/loop.js` — Delete line 1464: `capturedCopy.ultimate` stub
- `src/game/services/creature-collection-service.js` — Delete line 74: `ultimate: r.ultimate`
- `public/js/ui/combat-loop.js` — Remove `playUltimateAnimation` from import
- `public/game.js` — Remove `playUltimateSound` and `playUltimateAnimation` from imports

### Target 2: Combat End Narration Round-Trip (~100 lines)

Server endpoint `/combat-end-narration` is hardcoded to return null. Frontend calls it after every fight, checks for text, gets nothing. Dead HTTP round-trip on every combat.

**Files:**
- `src/routes/game/combat.js` — Delete `/combat-end-narration` endpoint (lines ~57-82)
- `public/js/ui/combat-loop.js` — Delete fetch call and narration display logic
- Clean up orphaned narration imports/helpers

### Target 3: DM Narration Pipeline (~70 lines)

`generateGameNarration()` in server.js generates AI text + TTS prefetch + word tracking, but the result is discarded because the combat endpoint returns null.

**Files:**
- `server.js` — Delete `generateGameNarration()` function (lines ~557-629) and dependency injection into combat routes
- `src/routes/game/index.js` — Remove `generateGameNarration` from `createCombatRoutes()` params
- Clean up orphaned dm.js imports in server.js

### Target 4: getLevels / selectLevel (~30 lines)

Two frontend API functions calling endpoints superseded by area selection system.

**Files:**
- `public/js/api.js` — Delete `getLevels()` and `selectLevel()` definitions + exports
- Check and remove corresponding server endpoints if orphaned

## Out of Scope (Kept)

- **Kana mode** — paused, coming back
- **Game stats functions** — planned for future use
- **Debug endpoints** — intentional dev tools
- **Stale imports** — cleaned up incidentally as part of the 4 targets

## Safety

- Each target gets its own commit
- `node --check` on every modified JS file
- `npm test` after all targets to catch regressions
- Purely subtractive — no behavioral changes
