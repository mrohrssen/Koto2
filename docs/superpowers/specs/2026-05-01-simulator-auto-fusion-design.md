# Simulator Auto-Fusion Design

## Goal

Teach the simulator to automatically perform any available creature fusions after hub speed reviews, so long-running simulations model an optimizing player who uses Fusion Cores and owned creature copies when recipes become available.

This is simulator-only behavior. It must not change live game UI, live hub behavior, Fusion Lab behavior, player-facing routes, narration, popups, or any other actual game behavior.

## Current Context

The game already exposes fusion through existing API routes:

- `GET /api/game/fusion` returns recipe state, including whether each visible recipe `canFuse`.
- `POST /api/game/fusion/start` performs one selected fusion using current server rules.

The current fusion service is already quantity-aware: successful fusion consumes owned ingredient copies, spends Fusion Cores, and adds one owned copy of the result. It also allows repeat fusion.

The simulator already performs hub speed reviews between runs in `simulator/engine/runner.js`. That is the correct simulator-only point to attempt auto-fusion before the next exploration run starts.

## Behavior

After the simulator finishes the hub due-word review step for a run, it should run an auto-fusion pass before starting the next run. This pass should still run when there are zero due words, because the simulator may already have Fusion Cores from earlier reviews.

The auto-fusion pass should:

1. Fetch current fusion state with `GET /api/game/fusion`.
2. Find recipes with `canFuse === true`.
3. Prefer recipes whose result is not currently owned (`resultOwned === 0`; missing `resultOwned` counts as `0`).
4. Fall back to the existing order returned by the fusion-state response for already-owned results or ties.
5. Start the selected recipe with `POST /api/game/fusion/start`.
6. Increment the simulator's `fusionsPerformedToday` counter on each successful fusion.
7. Repeat until no recipe can fuse or a safety cap is reached.

The safety cap prevents simulator hangs if route behavior ever regresses. A cap around 20 fusions per pass is enough for current recipes and Fusion Core economics.

If the fusion state fetch fails, or a selected fusion start fails, the simulator should stop the auto-fusion pass for that run and continue the simulation. The simulator should not throw unless the failure indicates a broader simulation infrastructure problem.

## Data And Reporting

Add a first-class daily simulator stat named `fusions_performed`.

New databases should include `fusions_performed INTEGER DEFAULT 0` in `simulator/db/schema.sql` on `daily_snapshots`.

Existing simulator databases should be migrated additively at store startup:

- Inspect `daily_snapshots` columns.
- If `fusions_performed` is missing, run `ALTER TABLE daily_snapshots ADD COLUMN fusions_performed INTEGER DEFAULT 0`.

`simulator/db/store.js` should save and return the stat alongside existing daily snapshot fields.

The simulator dashboard should display:

- Total fusions performed in the Collection summary.
- Per-day fusions performed in the daily detail view.

Recipe-level event logging is out of scope for this change. The requested counter is enough.

## Architecture

Prefer a small simulator helper, for example `simulator/engine/auto-fusion.js`, rather than embedding all logic directly in `runner.js`.

The helper should be API-driven:

- Input: `simCall`, optional logging context, and an optional max fusion cap.
- Output: `{ fusionsPerformed }`.
- Dependencies: existing simulator API caller and existing game fusion routes.

This keeps simulator behavior aligned with real server fusion rules without duplicating recipe logic or mutating game state directly.

`runner.js` should own daily aggregation:

- Initialize `let fusionsPerformedToday = 0` near other daily counters.
- After each hub speed-review block, call the helper.
- Add the helper result to `fusionsPerformedToday`.
- Save `fusions_performed: fusionsPerformedToday` in the daily snapshot.

## Testing

Add focused simulator tests:

- Auto-fusion picks an unowned-result recipe before an already-owned-result recipe.
- Auto-fusion repeats until no recipe can fuse.
- Auto-fusion increments the returned counter only after successful `fusion/start` calls.
- Auto-fusion stops cleanly when `GET /fusion` or `POST /fusion/start` fails.

Update store tests to verify `fusions_performed` is saved and returned from daily snapshots.

Update dashboard rendering tests only if existing simulator frontend tests cover results rendering. If not, keep frontend changes small and manually inspect the generated HTML structure during implementation.

## Out Of Scope

- Any live game auto-fusion behavior.
- Any Fusion Lab UI change.
- Any hub UI change.
- Any new player-facing route.
- Any recipe cost or priority changes outside the simulator's choice order.
- Recipe-level simulator analytics beyond the requested daily counter.
