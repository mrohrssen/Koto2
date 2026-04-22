# Hide unimplemented Items button in combat move-select

**Date:** 2026-04-22
**Status:** Approved

## Problem

The move-select grid shown during combat currently renders a 🎒 アイテム (Items) cell that does nothing. When tapped, the `onItemsOpen` callback fires and logs `[combat] Items button pressed — not yet implemented`. Users should never see this button — it promises a feature that doesn't exist.

## Scope

Hide the button from all rendered move-select grids. Keep the dormant code (buildItemsCell, the onItemsOpen callback, the split-cell path) in place so Items can be wired back up later without reconstructing the UI scaffolding.

Out of scope: implementing an actual Items system, deleting the dormant code, changing the console-log fallback.

## Changes

All changes in `public/js/ui/move-select.js`, in the `showMoves()` function (lines 141-152 today):

1. **Stop appending the items cell.** Remove the three `grid.appendChild(buildItemsCell())` / `buildSplitCell(...)` code paths inside the `if (includeItems)` block.
2. **Befriend cell stands alone.** Inside the same `if (includeItems)` block, when `opts.befriendAvailable && opts.onBefriend`, append a single `buildBefriendCell(opts.onBefriend)` to the grid. No more split-cell layout (which only existed to pair befriend + items). The `includeItems` gate stays wrapped around befriend to preserve existing caller behavior — passing `includeItems: false` still suppresses everything non-move, exactly as before.
3. **Keep dormant code.** Leave `buildItemsCell`, `buildSplitCell`, the `onItemsOpen` module-level variable, and the `onItemsOpenCb` init parameter untouched so re-enabling is a one-line revert.

## Files touched

- `public/js/ui/move-select.js` — only file that changes.

## What stays unchanged

- `public/js/ui/combat-loop.js` — the `onItemsOpenCb` wiring stays; it just becomes unreachable until the cell is re-enabled.
- CSS for `.move-items-cell`, `.move-split-cell`, `.move-befriend-half` — no changes needed; the befriend cell will render using its existing styles.
- All callers of `showMoves()` — no API changes; the `includeItems` option keeps its existing meaning ("render non-move cells"), it just no longer has any items to render.

## Verification

- Playwright playtest: enter combat, confirm the move grid shows only moves (and, when applicable, a standalone はなす/befriend cell). The 🎒 アイテム cell must not appear in any scenario — single-creature, full-party, befriend-available, befriend-unavailable.
- Confirm no layout regressions in the move grid: moves still fill properly, befriend (when present) occupies its own cell cleanly.
- Run `npm test` — no test should reference the items cell (it was never user-facing enough to be covered).

## Risk

Very low. Single file, render-only change, dormant code preserved. The only thing that could break is the befriend layout — mitigated by the playtest step.
