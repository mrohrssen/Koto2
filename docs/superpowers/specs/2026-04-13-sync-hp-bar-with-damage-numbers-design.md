# Sync HP Bar Drain with Damage Numbers

**Date:** 2026-04-13  
**Status:** Approved

## Problem

HP bars update after attack animations complete, causing a visible delay between the damage number popping and the HP bar starting to drain. Affects all combat flows (PvE boss, PvE creature, PvP).

## Solution

Thread an `onImpact` callback through the attack effect chain. Fire it synchronously right after `pixiDamageNumber()` in `impactEffect()`, so HP bar CSS transitions start on the same frame as the damage number.

## Changes

1. **`impactEffect()`** (combat-loop.js:78) — add `onImpact` param, call it after `pixiDamageNumber()` at line 103
2. **`fireCreatureAttackEffect()`** (combat-loop.js:115) — accept `onImpact`, pass through to `impactEffect()`
3. **`enemyCreatureAttackEffect()`** (combat-loop.js:130) — same
4. **`showAttackDisplay()`** (combat-loop.js:430) — accept `onImpact` in opts, pass through to attack effect functions
5. **PvE boss flow** (combat-loop.js:~1492) — pass HP update as `onImpact` callback, remove post-await `updateEnemyHPBar` call
6. **PvE enemy attack flow** (`showOneEnemyAttackAnimated`, combat-loop.js:~2032) — pass `updateCreatureHpBars` call as `onImpact`, remove post-await call
7. **PvP flow** (`showAttackSummary`, pvp-battle.js:~304) — pass `updateSlotHp` call as `onImpact` in showAttackDisplay opts, remove post-await call

8. **`enemyCreatureAttackEffect()`** (combat-loop.js:137) — remove `showVignette(200)` call (red screen-edge flash on player creature hit). Clean up unused import if no other callers.

## What doesn't change

- HP update functions themselves (`updateCreatureHpBars`, `characterUI.updateEnemyHPBar`, PvP's `updateSlotHp`) stay as-is
- NPC skill attack flow (combat-loop.js:2081) uses a different code path (`showDamageNumber` directly, not via `impactEffect`) — already updates HP on the next line synchronously, gap is negligible

## Testing

- Existing combat tests pass (timing change is visual-only, no API/logic changes)
- Visual verification via Playwright to confirm sync feels right
