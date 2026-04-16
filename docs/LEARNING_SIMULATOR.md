# Learning Simulator

A standalone dashboard for simulating player learning journeys through Koto. Drives the real game server APIs to stress-test language learning systems end-to-end.

## Quick Start

```bash
# Terminal 1: Start game server
ADMIN_SECRET=your-secret npm run dev

# Terminal 2: Start simulator
cd simulator
ADMIN_SECRET=your-secret GAME_SERVER_URL=http://localhost:3000 npm run dev

# Open http://localhost:3100
```

Both services need the same `ADMIN_SECRET` value.

## What It Does

The simulator creates test users on the game server and plays through the game automatically — room by room, move by move. It logs every word exposure, dialogue line, combat round, and API error, then visualizes the results on a web dashboard.

### Simulation Flow

For each simulated day:
1. Start a run (creates party, picks initial skill, selects area)
2. Walk through all 30 rooms — handle encounters (move-by-move combat), word discovery, speed reviews, NPC dialogue, whack-a-mole
3. In hub after each run, process crest meta progression (open all affordable chests, auto-equip highest-value crest per element)
4. After all runs for the day, advance FSRS timestamps by 1 day (so spaced repetition scheduling works)
5. Snapshot: total known words, new words, dialogue lines, rooms explored, errors

### What Gets Logged

| Event | Data |
|---|---|
| `word_exposure` | Word, source (bark/npc/cid/discovery/speed_review), location |
| `word_learned` | Word, source, when FSRS card reaches Review state |
| `dialogue_seen` | Full Japanese text, source (CID/NPC/combat), NPC id |
| `combat_round` | Move used, damage, creatures involved |
| `room_entered` | Room type, outcome (cleared/wiped/skipped) |
| `api_error` | Endpoint, status code, error body, day/run/room context |
| `crest_cycle_*` | Crest automation lifecycle (`started`, `chest_opened`, `equipped`, `summary`, `error`) |

## Dashboard

### Profiles Screen

Create simulation profiles with different player behaviors:

| Setting | Description | Default |
|---|---|---|
| Duration (days) | How many days to simulate | 30 |
| Runs per day | Dungeon runs attempted per day | 2 |
| Speed review accuracy | % of review words graded "good" | 70% |
| Word discovery accuracy | % of discovery words learned | 90% |
| Combat skill | Move selection quality (0=random, 1=optimal) | 50% |
| Daily play minutes | Soft cap on play time | 60 |
| AI dialogue mode | skip / cached / real (LLM calls) | skip |

### Results Screen

Four tabs per simulation:

- **Progression** — Line chart of known words over time + new words per day
- **Daily Detail** — Per-day breakdown of runs, rooms, reviews
- **Dialogue** — Scrollable transcript of all Japanese text encountered, grouped by day
- **Errors** — API failures with endpoint, status code, and context

### Compare Screen

Select multiple profiles and overlay their progression curves on the same chart. Summary table shows words known, avg words/day at any given day.

## Architecture

```
simulator/           # Standalone Express app (port 3100)
  server.js          # Express server + route mounting
  db/
    schema.sql       # SQLite tables (profiles, simulations, snapshots, events)
    store.js         # Database access layer
  engine/
    runner.js        # Main loop: days → runs → rooms
    crest-cycle.js   # Crest automation: open chests + best equip
    combat.js        # Move-by-move combat simulation
    decisions.js     # Move selection based on combatSkill
    sim-call.js      # Resilient HTTP wrapper (never throws)
    auth.js          # Test user create/cleanup/time-advance
    rooms/
      index.js       # Room type registry + dispatch
      encounter.js   # Wild encounter (combat)
      boss.js        # Boss fight
      npc-battle.js  # NPC battle + dialogue logging
      friendly-npc.js
      word-discovery.js
      speed-review.js
      whack-a-mole.js
      skip-room.js   # Known types without handlers (shrine, dealer, etc.)
      unknown.js     # Fallback for new room types
  routes/
    profiles.js      # CRUD API
    simulations.js   # Start/pause/resume
    results.js       # Snapshots, events, comparison queries
  public/            # Dashboard SPA (vanilla JS + Chart.js)
```

### Game Server Additions

Three admin endpoints added to the game server (`src/routes/admin.js`), gated behind `ADMIN_SECRET`:

| Endpoint | Purpose |
|---|---|
| `POST /api/admin/advance-time` | Shift FSRS timestamps backward (time compression) |
| `POST /api/admin/seed-vocab` | Bulk seed words into a user's FSRS deck |
| `POST /api/admin/cleanup-sim-user` | Delete all data files for a test user |

All return 404 if `ADMIN_SECRET` is not set (invisible in production).

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_SECRET` | Yes | — | Shared secret between simulator and game server |
| `GAME_SERVER_URL` | No | `http://localhost:3000` | Game server base URL |
| `SIM_PORT` | No | `3100` | Simulator dashboard port |
| `SIM_DB_PATH` | No | `simulator/data/simulator.db` | SQLite database path |

## Error Resilience

Most API calls are wrapped in try/catch. Failures are logged as events (with full context: day, run, room) and the simulator continues. Unknown room types are logged and skipped.

**Exception:** crest automation is fail-hard by design. If the simulator cannot read crest state, open chests, or equip best crests, the simulation is marked `errored` to avoid publishing untrustworthy win-rate data.

When new room types are added to the game, the simulator logs "unknown room type: X" until a handler is added to `engine/rooms/index.js`.

## Running Against Production

Point the simulator at the production game server:

```bash
cd simulator
ADMIN_SECRET=prod-secret GAME_SERVER_URL=https://jrpg-production.up.railway.app npm run dev
```

Note: `ADMIN_SECRET` must be set on the production server for time advancement to work.

## Tests

```bash
cd simulator
npm test                    # All unit tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests (requires game server)

# Run integration test against live server
RUN_SIM_INTEGRATION=1 ADMIN_SECRET=your-secret npm run test:integration
```

## Design Docs

- **Spec:** `docs/superpowers/specs/2026-04-06-learning-simulator-design.md`
- **Plan:** `docs/superpowers/plans/2026-04-06-learning-simulator.md`
