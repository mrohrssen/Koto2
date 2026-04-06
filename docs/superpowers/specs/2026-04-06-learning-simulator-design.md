# Learning Simulator Design

Standalone web dashboard for simulating player learning journeys through Koto. Drives real game APIs to stress-test language learning systems end-to-end.

## Problem

We have no way to answer "how many words does a player learn in 30 days?" without manually playing for 30 days. The game's learning systems (FSRS, i+1 dialogue, word discovery, speed review, combat barks) interact in complex ways. We need a tool that simulates player experiences at speed, captures every word exposure and dialogue event, and lets us compare different player profiles side by side.

## Architecture

```
┌─────────────────────────────────────────────┐
│           Simulator App (port 3100)         │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Dashboard │  │   Sim    │  │  Results  │ │
│  │    UI     │  │  Engine  │  │   Store   │ │
│  │ (web app) │  │ (runner) │  │  (SQLite) │ │
│  └──────────┘  └──────────┘  └───────────┘ │
└──────────────────────┬──────────────────────┘
                       │ HTTP calls
                       ▼
┌─────────────────────────────────────────────┐
│         Koto Game Server (port 3000)        │
│                                             │
│  Existing APIs:  /api/game/*, /api/auth/*   │
│  New: POST /api/admin/advance-time          │
│  New: POST /api/admin/cleanup-sim-user      │
└─────────────────────────────────────────────┘
```

**Location:** `simulator/` directory in the Koto repo, with its own `package.json` and `node_modules`.

**Key components:**

- **Dashboard UI** — Vanilla HTML/CSS/JS web frontend (matches game conventions). Configure profiles, launch sims, view charts, compare results.
- **Sim Engine** — Node.js process that creates test users and plays through the game via real HTTP calls, room by room, move by move. Logs every word exposure, dialogue line, and API error.
- **Results Store** — SQLite database for simulation configs, daily snapshots, and granular event logs. Query-friendly for time series, aggregations, and cross-profile comparisons.
- **Game Server** — Unchanged except two admin endpoints for time advancement and test user cleanup.

## Simulation Profiles

A profile defines a simulated player's behavior. Profiles are created in the dashboard and stored in SQLite.

### Input Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `name` | string | required | Profile name ("Casual Learner", "Grinder") |
| `durationDays` | number | 30 | How many days to simulate |
| `runsPerDay` | number | 2 | Runs started per day |
| `speedReviewAccuracy` | 0-1 | 0.7 | Fraction of speed review words graded "good" vs "again" |
| `wordDiscoveryAccuracy` | 0-1 | 0.9 | Fraction of word discovery words successfully learned |
| `combatSkill` | 0-1 | 0.5 | Move selection quality — high = type-advantaged picks, low = suboptimal |
| `dailyPlayMinutes` | number | 60 | Soft cap on play time per day (limits effective runs) |
| `startingVocab` | string[] | [] | Pre-seeded known words (simulate returning player) |
| `aiDialogueMode` | enum | "skip" | `"real"` (LLM calls), `"cached"` (reuse prior), `"skip"` (placeholder text) |
| `aiModel` | string | null | OpenRouter model ID (required when mode = "real") |
| `openRouterApiKey` | string | env var | API key for OpenRouter |

Old saved profiles missing new fields get defaults automatically. No migration needed when new variables are added.

### Derived Behaviors

- `combatSkill` = 0.2 → picks suboptimal moves frequently, wipes around room 10-15
- `combatSkill` = 0.9 → picks type-advantaged moves, clears all 30 rooms + boss consistently
- `speedReviewAccuracy` affects FSRS progression — low accuracy keeps cards in "learning" longer
- `dailyPlayMinutes` caps effective runs — if a run takes ~20min, 60min allows ~3 runs max

## Simulation Loop

For each simulated day, the engine replays what a real player would do:

```
For each day (1..durationDays):
  │
  ├─ For each run (1..effective_runs):
  │   │
  │   ├─ POST /api/game/start-run
  │   │   └─ Log CID script dialogue + word exposures
  │   │
  │   ├─ POST /api/game/select-area (pick randomly from options)
  │   │
  │   ├─ For each room (1..30):
  │   │   │
  │   │   ├─ POST /api/game/proceed
  │   │   │
  │   │   ├─ Room handler by type:
  │   │   │   ├─ encounter → full combat loop (move-by-move)
  │   │   │   ├─ boss → full combat loop
  │   │   │   ├─ friendlyNpc → log NPC dialogue, buy/skip items
  │   │   │   ├─ npcBattle → full combat + NPC dialogue
  │   │   │   ├─ wordDiscovery → learn words (per accuracy %)
  │   │   │   ├─ speedReviewRoom → review due cards (per accuracy %)
  │   │   │   ├─ whackAMole → simplified play
  │   │   │   └─ unknown type → log and skip
  │   │   │
  │   │   └─ Log: words exposed, words learned, dialogue seen, errors
  │   │
  │   └─ Run complete → log run summary
  │
  ├─ POST /api/admin/advance-time { userId, days: 1 }
  │   └─ Shifts FSRS timestamps to make cards due for next day
  │
  └─ Save daily snapshot to SQLite
```

### Combat Simulation (Move-by-Move)

```
POST /api/game/start-creature-encounter
│
└─ While combat active:
    ├─ Select move based on combatSkill:
    │   high → type-advantaged move
    │   low → random/suboptimal move
    ├─ POST /api/game/creature-combat-cycle
    │   Body: { actionType: "attack", moveChoices: [{ creatureIndex, moveId, targetIndex }] }
    │   └─ Log: barks, damage, status effects, word exposures
    ├─ If creature KO'd → POST /api/game/swap-creature (if reserves exist)
    └─ If party wiped → run ends early
```

### Error Resilience

Every API call goes through a wrapper that catches errors, logs them with full context (day, run, room, room type), and continues. The simulator never crashes on an API failure.

```javascript
async function simCall(method, path, body, context) {
  try {
    const res = await fetch(gameServerUrl + path, ...);
    if (!res.ok) {
      logEvent('api_error', { path, status: res.status, context });
      return { ok: false, status: res.status };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    logEvent('api_error', { path, error: err.message, context });
    return { ok: false, error: err.message };
  }
}
```

### Room Type Registry

Extensible map of handlers. Unknown room types are logged and skipped:

```javascript
const roomHandlers = {
  encounter:       handleEncounter,
  boss:            handleBoss,
  friendlyNpc:     handleFriendlyNpc,
  npcBattle:       handleNpcBattle,
  wordDiscovery:   handleWordDiscovery,
  speedReviewRoom: handleSpeedReview,
  whackAMole:      handleWhackAMole,
  // Known room types without full handlers (log and skip):
  shrine:          handleSkipRoom,
  quiz:            handleSkipRoom,
  dealer:          handleSkipRoom,
  skillMaster:     handleSkipRoom,
};

// Truly unknown room types get a distinct log entry
const handler = roomHandlers[room.type] || handleUnknownRoom;
```

When new room types are added to the game, the simulator logs "unknown room type: X" until a handler is added.

## Outputs & Results Store

### Event Types

| Event Type | Data Captured |
|---|---|
| `word_exposure` | word, source (bark/npc/cid/discovery/combat), day, run, room |
| `word_learned` | word, day, run, source (discovery/speed-review). Fires when FSRS card state transitions to Review — checked after each gradeCard call, not just at room boundaries |
| `dialogue_seen` | full Japanese text, tokens, known/unknown breakdown, source, NPC id |
| `combat_round` | move used, damage, barks fired, creatures involved |
| `room_entered` | room type, room index, outcome (cleared/skipped/wiped) |
| `run_summary` | rooms cleared, words gained, areas completed, wipe point |
| `api_error` | endpoint, status code, error message, day/run/room context |

### Daily Snapshots

| Metric | Description |
|---|---|
| `totalKnownWords` | Cumulative words in FSRS "Review" state |
| `newWordsToday` | Words that reached "known" today |
| `wordsExposedToday` | Total word exposure events |
| `dialogueLinesEncountered` | Dialogue lines seen |
| `runsCompleted` | Runs finished (vs wiped) |
| `roomsExplored` | Total rooms entered |
| `avgRoomsPerRun` | How far they get on average |
| `speedReviewsCompleted` | Cards reviewed in speed review rooms |
| `unknownWordsInDialogue` | Teaching words (the i+1 words) encountered |

### SQLite Schema

Three main tables:

- **`simulations`** — profile config, status (running/paused/complete/errored), start/end time, test user ID
- **`daily_snapshots`** — one row per simulation per day, all aggregate metrics
- **`events`** — granular event log (word exposures, dialogue, combat rounds, errors)

## Time Advancement

The simulator fast-forwards time between simulated days so FSRS scheduling works realistically.

### Admin Endpoint (game server)

```
POST /api/admin/advance-time
Body: { userId: "sim-casual-1717836000", days: 1 }
Auth: ADMIN_SECRET env var (header: X-Admin-Secret)

Effect:
  - Loads FSRS data for userId (data/srs-{userId}.json)
  - Shifts every card's `due` and `last_review` timestamps backward by N days
  - Cards scheduled for "tomorrow" become due "now"
  - Saves updated FSRS data
  - Clears the in-memory SRS cache for this user (internal-srs.js caches loaded data;
    without clearing, subsequent getKnownWordsFromFsrs() calls use stale unshifted dates)

Response: { shifted: 47 }
```

Timestamps shift backward (into the past) rather than forward. The server still uses `Date.now()` — cards become due relative to the real clock. No clock mocking needed.

Security: gated behind `ADMIN_SECRET` env var. If not set, endpoint returns 404 (invisible in production).

## Test User Lifecycle

### Creation

```
On simulation start:
  1. POST /api/auth/register { username: "sim-{profileName}-{timestamp}", password: auto, inviteCode: "neo-tokyo-friends" }
  2. POST /api/auth/login → JWT token (stored in sim record, sent as Authorization: Bearer header on all subsequent calls)
  3. If startingVocab set → POST /api/admin/seed-vocab { userId, words: [...] }
     (new admin endpoint that calls createCard + gradeCard for each word on the FSRS vocab deck)
  4. Store userId + JWT in simulation record
```

All sim users prefixed with `sim-` for easy identification. The game server treats them as normal users.

### Data Isolation

Each simulation gets its own user, its own FSRS file (`data/srs-sim-casual-1717836000.json`), its own game state. Simulations never interfere with each other or real users.

### Cleanup

```
POST /api/admin/cleanup-sim-user { userId }
  - Deletes FSRS data file (data/srs-{userId}.json)
  - Removes user from .jrpg-users.json
  - Clears text-cache, npc-memory files for that user
```

Dashboard has a "clean up test data" button. Also runs automatically when deleting a simulation.

### Pause & Resume

Sim state (current day, run, room) saved to SQLite. On resume, picks up where it left off — the test user's game state persists on the server.

## Dashboard UI

Vanilla HTML/CSS/JS served by the simulator's Express server. Chart.js for charts.

### Screen 1: Profiles (Home)

- Create, edit, clone, delete profiles
- See status at a glance (running, paused, complete, errored, word count)
- Run, pause, resume simulations

### Screen 2: Results (Single Profile)

Tabbed view:

- **Progression** — Line chart of known words over time
- **Daily Detail** — Bar chart of words by source (discovery, barks, NPC, speed review) for selected day
- **Dialogue** — Scrollable transcript of all Japanese dialogue encountered, day by day, with known/unknown word highlighting
- **Errors** — API failures grouped by endpoint, with full context

Click any day on the chart to drill into detail.

### Screen 3: Compare

- Multi-select profiles to overlay progression lines on same chart
- Summary comparison table (words known, dialogue lines, avg words/day, errors) at configurable day
- Export as CSV

## Game Server Changes

Only two additions, both gated behind `ADMIN_SECRET`:

1. **`POST /api/admin/advance-time`** — Shift FSRS timestamps for a user (time compression)
2. **`POST /api/admin/cleanup-sim-user`** — Delete all data for a sim user
3. **`POST /api/admin/seed-vocab`** — Bulk-seed FSRS vocab deck for a user (for startingVocab)

Both return 404 if `ADMIN_SECRET` is not set. Zero impact on production.

## Scaling With the Game

### Automatic (no sim changes needed)

- New game content (areas, creatures, NPCs, dialogue lines)
- FSRS tuning and scheduling changes
- Balance changes (damage, HP, encounter rates)
- New dialogue content (CID scripts, NPC lines, barks)

### Requires Sim Updates

- New room types → add handler to registry
- New profile variables → add to schema + defaults + UI form
- API contract changes → update response parsers

### Current State Compatibility

As of `c9a36cf` (2026-04-06):
- FSRS is the sole source of truth for word knowledge (word-knowledge files deprecated for tracking)
- `getKnownWordsFromFsrs()` used by all dialogue word gating (CID, NPC, barks)
- Registration seeds FSRS directly via `createCard` + `gradeCard`
- No JPDB dependency for word tracking — FSRS-only
- Hardcoded dialogue covers Areas 1-3 (~160 words); AI dialogue triggers at Area 4+
- Most simulations of early gameplay will use zero LLM calls

## Tech Stack

| Component | Technology |
|---|---|
| Server | Express (Node.js) |
| Frontend | Vanilla HTML/CSS/JS |
| Charts | Chart.js |
| Database | SQLite (better-sqlite3) |
| HTTP client | fetch (Node 18+) |
| Game server comm | Real HTTP calls to localhost:3000 |

## Directory Structure

```
simulator/
  package.json
  server.js              # Express app (port 3100)
  db/
    schema.sql           # SQLite schema
    migrations/          # Future schema changes
  engine/
    runner.js            # Main simulation loop
    sim-call.js          # Resilient API call wrapper
    rooms/
      encounter.js       # Combat handler (move-by-move)
      word-discovery.js  # Word discovery handler
      speed-review.js    # Speed review handler
      friendly-npc.js    # NPC dialogue handler
      npc-battle.js      # NPC battle handler
      boss.js            # Boss fight handler
      whack-a-mole.js    # Minigame handler
      unknown.js         # Fallback for new room types
  public/
    index.html           # Dashboard SPA
    css/
      dashboard.css
    js/
      app.js             # Router, state management
      profiles.js        # Profile CRUD
      results.js         # Charts, tables
      compare.js         # Multi-profile comparison
      dialogue-viewer.js # Dialogue transcript renderer
  routes/
    profiles.js          # Profile CRUD API
    simulations.js       # Start/pause/resume/delete
    results.js           # Query snapshots, events
```
