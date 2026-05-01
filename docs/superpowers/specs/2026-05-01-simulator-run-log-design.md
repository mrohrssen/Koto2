# Simulator Run Log Design

## Goal

Make simulator results easier to evaluate area pacing and per-run rewards by:

- Always selecting the latest area returned by the game server's area options.
- Recording the selected area on each simulator run.
- Adding a `Run Log` tab to the simulator results view.
- Showing average and maximum combat rounds for non-boss combat encounters in each run.
- Showing boss combat rounds separately so boss toughness can be tuned independently.

The critical pacing signal is per-fight length, not total run length. Regular encounter pacing and boss toughness should be visible separately so area tuning issues are easy to spot.

## Current Context

The simulator is a standalone Express app in `simulator/`. It drives the real game server over HTTP, stores analytics in SQLite, and renders results with vanilla JS in `simulator/public/js/results.js`.

Current run flow in `simulator/engine/runner.js`:

1. Start a run.
2. Pick the first Skill Master offer.
3. Fetch `/api/game/area-options`.
4. Randomly select one returned area.
5. Walk rooms until completion, wipe, or a room-loop break.
6. Forfeit to close the run and log one `run_summary` event.

Combat rounds already exist in simulator events:

- `simulator/engine/combat.js` increments `rounds` once per combat cycle.
- Encounter, boss, and NPC battle handlers log final `room_entered` events with `data.rounds`.
- The runner can also collect combat results returned by room handlers while it is executing the run.
- Boss rooms are identifiable from `roomType === 'boss'`, so boss rounds can be excluded from regular encounter averages.

The simulator already logs one `run_summary` event per run, so the new run log can use that event as the compact reporting record instead of adding a new database table.

## Area Selection

Replace random area selection with deterministic "latest returned option" selection.

The runner will:

1. Call `GET /api/game/area-options`.
2. Read `data.areas` or the raw response array, preserving current response compatibility.
3. Select the last area in that returned list.
4. Call `POST /api/game/select-area` with that area's id.
5. Keep the selected area object in local run context for the later `run_summary`.

This respects the game server's unlock rules. If a simulated profile only has Starting Meadow unlocked, it will still play Starting Meadow. When Wild Plains or later areas become available through normal progression, the simulator will automatically choose the latest option returned by the server.

## Run Summary Fields

At run end, the existing `run_summary` event will include the selected area and combat pacing metrics:

```json
{
  "areaId": "wild-plains",
  "areaName": "Wild Plains",
  "areaNameJa": "野原",
  "wiped": false,
  "completed": true,
  "wordsImmersed": 12,
  "wordsMastered": [],
  "creaturesDefeated": 8,
  "creaturesBefriended": 1,
  "itemsCollected": 2,
  "combatCount": 5,
  "avgCombatRounds": 3.2,
  "maxCombatRounds": 6,
  "bossCombatRounds": 9
}
```

`avgCombatRounds` and `maxCombatRounds` are computed across individual non-boss combat encounters in the run. Non-combat rooms and boss rooms do not count toward these fields. Runs with no non-boss combat encounters should report `combatCount: 0`, `avgCombatRounds: 0`, and `maxCombatRounds: 0`.

`bossCombatRounds` records the final boss fight's combat rounds when the run reaches a boss. Runs that wipe or stop before the boss should store `bossCombatRounds: null`; the UI should display this as `N/A`.

The runner can compute these fields by collecting `result.combat.rounds` from room handlers and splitting them by the current `roomType`. This avoids querying the event store during the active run and keeps the source close to the room execution flow. Existing `room_entered.data.rounds` remains the audit trail and can be used by the results route as a fallback for older or partial simulations.

## Results API

Add `GET /api/results/:simId/run-log`.

The route will return normalized rows sorted by simulation event order:

```json
[
  {
    "day": 1,
    "run": 1,
    "areaId": "wild-plains",
    "areaName": "Wild Plains",
    "wiped": false,
    "completed": true,
    "creaturesBefriended": 1,
    "itemsCollected": 2,
    "wordsMastered": [],
    "wordsMasteredCount": 0,
    "combatCount": 5,
    "avgCombatRounds": 3.2,
    "maxCombatRounds": 6,
    "bossCombatRounds": 9
  }
]
```

New runs should get these fields directly from `run_summary.data`. For compatibility, the route should derive missing combat metrics from `room_entered` events with numeric `data.rounds` for the same day/run, excluding `roomType: 'boss'` from regular combat metrics and using it for `bossCombatRounds`. Missing collection and vocabulary fields default to existing safe values.

The API should not add new SQLite tables. `events` remains the storage model.

## Results UI

Add a `Run Log` tab to `simulator/public/js/results.js`.

The tab will show summary cards and a table:

- Summary cards: total runs, overall max regular combat rounds, overall max boss combat rounds, average of per-run average combat rounds, total creatures befriended, total items collected, total mastered words.
- Table columns: day/run, area, outcome, creatures befriended, items collected, mastered words, regular combat fights, average regular combat rounds, maximum regular combat rounds, boss combat rounds.

Mastered words should show a count in the main row and readable detail when available. A compact inline list or native `<details>` element is enough; the goal is scannable run diagnostics, not a full vocabulary browser.

Rows with unusually high regular `maxCombatRounds` or high `bossCombatRounds` should be easy to notice. The initial implementation can rely on the numeric columns and summary cards rather than adding threshold styling.

## Testing

Add focused simulator tests for:

- Latest-area selection chooses the final returned area option and posts that area id to `/api/game/select-area`.
- The runner logs `run_summary` with area fields, non-boss per-fight combat metrics, and separate boss combat rounds.
- The run-log results route returns one normalized row per `run_summary`.
- The route derives combat metrics from `room_entered.data.rounds` when a `run_summary` does not already include them, excluding boss rooms from regular metrics.
- Runs that do not reach a boss return `bossCombatRounds: null`, and the UI renders it as `N/A`.
- The UI API client exposes `results.runLog(simId)`.

Add UI-level coverage where practical for the `Run Log` tab renderer:

- Empty state when no run summaries exist.
- Table renders area, collection counts, mastered word count, average regular combat rounds, maximum regular combat rounds, and boss combat rounds.

## Out Of Scope

- Adding profile-level area selection settings.
- Forcing simulator users to unlock all areas.
- Changing game server area unlock rules.
- Adding a dedicated `run_logs` table.
- Changing combat balance or room generation based on the new metrics.
