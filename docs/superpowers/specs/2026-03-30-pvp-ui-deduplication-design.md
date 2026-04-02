# PvP UI Deduplication

**Date:** 2026-03-30
**Status:** Approved

## Problem

`pvp-battle.js` hand-rolls combat UI that already exists in shared modules: target selection, attack cards, and `escapeHtml`. This causes visual inconsistency (PvP buttons look different from PvE) and maintenance burden (changes to combat UI must be made in multiple places).

## Approach: Export-and-Import (Minimal Change)

Export the private functions PvP needs, then have `pvp-battle.js` import and call them. No new abstraction layers or files beyond a tiny `escapeHtml` utility.

## Changes

### 1. Target Selection — Use `target-select.js`

**Delete** `showTargetSelection()` and `showAllyTargetSelection()` from `pvp-battle.js`.

**Replace with:**
- Import `init`, `showEnemies`, `showAllies` from `target-select.js`
- Call `init()` with PvP callbacks in `startPvpBattle()`:
  - `onTargetSelectCb` → calls `addMoveChoice(creatureIndex, move.id, targetIndex)`
  - `onCancelCb` → calls `showMoveSelection()`
- Call `showEnemies(pvpState.enemies, move)` / `showAllies(pvpState.allies, move)` in `handleMoveSelected()`

**Note:** `target-select.js` filters out `target.befriended` creatures. PvP has no befriending, so this filter is harmless.

**Note:** `target-select.js` uses module-level callbacks via `init()`. PvP and PvE don't run simultaneously, so re-initializing is safe.

### 2. Attack Cards — Export `insertAttackCard` from `combat-loop.js`

**Add `export`** to `insertAttackCard(atk, isEnemy)` in `combat-loop.js`.

**Replace** the hand-rolled `showAttackSummary()` in `pvp-battle.js`:
- Import `insertAttackCard` from `combat-loop.js`
- For each attack in the round result, call `insertAttackCard(atk, isEnemy)` then `await delay()`
- Determine `isEnemy` from `atk.side`: the server sends each player results with their side as sideA, so `isEnemy = (atk.side !== 'sideA')`

**Data compatibility:** The server's `processMoveTurn` already populates the full `buildAttackRecord` fields (attackerId, attackerBaseWord, attackerSkillName, etc.) that `buildSplitAttackCard` expects. No server changes needed.

**Side effects:** `insertAttackCard` prefetches and plays TTS audio for base word + skill name. This is desirable in PvP too.

### 3. `escapeHtml` — Extract to Shared Utility

**Create** `public/js/ui/html-utils.js` with single export:
```js
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
```

**Replace** all 6 local copies with imports:
- `pvp-battle.js`
- `pvp-lobby.js`
- `actions.js`
- `game.js`
- `speed-review.js`
- `lookup.js`

## What Stays in `pvp-battle.js`

These are genuinely PvP-only and have no PvE equivalent:
- Victory/defeat/rematch screen (socket-driven rematch flow)
- Waiting for opponent state
- Opponent disconnected/reconnected handlers
- `returnToHub()` (PvP cleanup — disconnects socket, resets state)

## What Was Already Fixed

`buildMoveCell` was exported from `move-select.js` and PvP now uses it instead of hand-rolled move buttons. This change is already in the working tree.
