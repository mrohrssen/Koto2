# Balance Simulator Design

**Date:** 2026-05-05

## Goal

Add a balance simulation tool to the existing simulator dashboard that runs many random 3v3 creature battles and reports aggregate win/loss rates per creature.

The tool is for identifying creatures that are too strong or too weak relative to their intended rarity tier. A high-rarity creature is allowed to outperform lower-rarity creatures; the point is to make that visible with data.

## Core Rules

- Each battle samples 6 unique creature IDs from the full creature roster.
- The first 3 sampled creatures form side A; the next 3 form side B.
- No creature ID may appear twice in the same battle, on either side.
- The operator chooses the level used for all creatures in the run.
- Every creature is instantiated at that level with full HP/MP and no active combat effects.
- Every creature must have the latest 3 moves it would know at that level, based on its learnset.
- A side wins when every creature on the opposing side is dead.
- If both sides are dead after the same resolved round, the battle is a draw.
- All creatures on the winning team receive 1 win, even if an individual winner died.
- All creatures on the losing team receive 1 loss.
- Draws increment appearances and draws for both teams, but not wins/losses.
- If a battle reaches the max-round cap, defaulting to 100 rounds, it is counted as a draw so one broken status/move loop cannot hang a large run.

## Architecture

The game server owns and runs the balance simulation. The simulator dashboard is only the control panel.

```text
Simulator UI -> simulator backend -> game server admin API -> real combat modules
```

This preserves the API boundary without paying the cost of one HTTP request per combat round. The simulator backend starts, cancels, and polls the game-server job through admin endpoints. The actual battle loop runs inside the game server process using production combat code.

Only one balance simulation job runs at a time. Completed runs remain viewable in the simulator dashboard.

## Combat Engine

The simulation uses PvP-style symmetric 3v3 combat, not PvE encounter state.

Each round:

1. Side A chooses moves for all living creatures using the same production combat AI helpers that PvE enemies use.
2. Side B chooses moves the same way.
3. The shared PvP round resolver resolves the round.
4. The runner checks whether either side is fully dead.

There is no LLM involvement and no simulator-specific strategy bot. Any adapter should be thin glue around the existing in-game combat AI: given `myTeam` and `theirTeam`, choose each living creature's move and target using the real production AI logic.

## Level And Move Instantiation

Create or refactor a shared helper for "instantiate creature at level N for combat":

- Uses the creature template and existing stat scaling rules.
- Applies the rarity stat multiplier.
- Sets `level`, `hp/maxHp`, `mp/maxMp`, attack, defense, and other combat stats consistently with the game.
- Clears transient combat state such as active effects.
- Assigns the latest 3 learnset moves whose `level <= N`.

This helper should be used by the balance simulator and by PvE enemy generation. Current PvE enemy generation attempts to include moves up to the enemy level, but the max-3 behavior can preserve early moves instead of the latest learned moves. The implementation should make high-level PvE enemies follow the same "latest 3 eligible moves" rule.

## Admin API

Add admin-only game-server endpoints gated by the existing `ADMIN_SECRET` pattern:

- `POST /api/admin/balance-simulations/start`
  - Body: `{ battleCount, creatureLevel }`
  - Starts a background job if none is active.
  - Returns job metadata and initial progress.
- `GET /api/admin/balance-simulations/current`
  - Returns active job progress or latest completed result.
- `POST /api/admin/balance-simulations/cancel`
  - Cancels the active job.

Inputs:

- `battleCount` must be a positive integer.
- `creatureLevel` must be a positive integer.
- The roster must contain at least 6 creatures.

The job should periodically yield to the event loop so large runs do not freeze the server process.

## Results Model

The balance simulator stores aggregate counters only. It does not store per-battle logs or replay data.

Per creature:

- `creatureId`
- `name`
- `nameEn`
- `rarity`
- `appearances`
- `wins`
- `losses`
- `draws`
- `winRate`
- `lossRate`

Per run:

- `jobId`
- `status`: `running`, `completed`, `cancelled`, or `errored`
- `battleCount`
- `creatureLevel`
- `completedBattles`
- `draws`
- `startedAt`
- `completedAt`
- `errorMessage`
- aggregate creature result rows

The game server may keep the active/latest job in memory. The simulator backend must mirror completed aggregate results into its SQLite database as a JSON blob per balance run so refreshing the dashboard does not lose completed results.

## Dashboard UI

Add a new top-level simulator dashboard tab named `Balance`.

The tab includes:

- Battle count input.
- Creature level input.
- Start button.
- Cancel button while a job is running.
- Progress display with completed battles and status.
- Results table.

Results table columns:

- Creature
- Rarity
- Appearances
- Wins
- Losses
- Win Rate
- Loss Rate

Default sorting should be by win rate descending once results exist. Columns should be clickable for sorting. The display should keep rarity visible but otherwise avoid extra breakdowns for the first version.

## Error Handling

Fail fast with a clear error for:

- Missing or invalid `ADMIN_SECRET`.
- Another balance simulation already running.
- Invalid battle count.
- Invalid creature level.
- Fewer than 6 creature templates.
- Cancel requested with no active job.

Internal battle failures should mark the job errored unless the failure is the explicit max-round cap, which counts as a draw.

## Testing

Unit tests:

- Level-N instantiation gives level-scaled stats, full HP/MP, clean effects, and latest 3 eligible moves.
- PvE enemy generation uses the same latest-3 move rule for high-level enemies.
- Battle sampling always uses 6 unique creature IDs.
- Aggregate accounting applies wins and losses to all team members.
- Draw accounting handles simultaneous wipe and max-round cap.
- Result output is aggregate-only and contains no per-battle logs.

Route tests:

- Admin auth is required.
- Start rejects invalid input.
- Only one active job can run at a time.
- Polling returns progress and completed result shape.
- Cancel updates job status.

Simulator UI tests:

- The `Balance` tab renders.
- Starting a run calls the simulator backend route with battle count and creature level.
- Running progress renders.
- Completed aggregate rows render with creature rarity, appearances, wins, losses, win rate, and loss rate.

## Non-Goals

- No LLM move decisions.
- No per-battle logs, replays, or transcripts.
- No PvE room/run simulation.
- No teammate/opponent matchup breakdowns in the first UI.
- No multiple concurrent balance jobs.
