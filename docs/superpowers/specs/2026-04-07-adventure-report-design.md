# Adventure Report — End-of-Run Screen

Replaces the current minimal defeat/victory screens with a positive, stats-rich "Adventure Report" that celebrates what the player accomplished regardless of outcome.

## Context

The current end-of-run screen shows a skull emoji, "DEFEATED", floor count, and a single button. Victory is similarly bare. Players leave runs feeling punished rather than rewarded. The adventure report reframes every run as progress — areas explored, creatures met, words learned.

## Design

### Header (varies by outcome)

| | Defeat | Victory |
|---|---|---|
| Icon | Scroll (📜) | Trophy (🏆) |
| Title | "Adventure Report" | "Adventure Complete!" |
| Subtitle | Run #{n} · {duration} | Run #{n} · {duration} |
| Flavor | Positive phrase (e.g. "A valiant journey through the unknown!") | Celebratory phrase (e.g. "You conquered every challenge!") |

No skull, no "DEFEATED" text. Defeat is simply framed as an incomplete adventure.

### Section 1: Run Stats

A card containing a 2-column metrics grid:

- **Furthest Area** (featured, full-width): `{areasCompleted} / {areasToWin}` — e.g. "3 / 10"
- **Creatures Befriended**: count of creatures added to collection during this run
- **Creatures Defeated**: `run.stats.kills` (enemies beaten in combat)
- **Items Collected**: consumables + equipment picked up during this run

Below the grid, an **Elements Collected** row showing five colored circle pips (fire, water, earth, wood, metal) with per-element counts gained this run.

### Section 2: Discovery (Lifetime)

Two rows with progress bars:

- **Creatures**: `{collectionSize} / {totalCreaturesInGame}`
- **Items**: `{discoveredItems} / {totalItemsInGame}`

These are lifetime totals against the full catalog. No "NEW" badges.

### Section 3: Word Progress

Two stat boxes side by side:
- **Words Immersed** (blue): count of unique words the player encountered during this run
- **Words Mastered** (green): count of words that crossed the 5-exposure threshold during this run

Below, a list of up to 5 mastered words sorted by exposure count (descending), each showing:
- Green dot indicator
- Japanese word
- English meaning
- Exposure count (e.g. "5x")

### Button

Single "Return to Hub" button at the bottom, matching the existing action-btn-primary style with cyan-blue gradient.

## Data Requirements

### Run-scoped data (must be captured before `forfeitRun()` nulls `this.run`)

| Field | Source | Notes |
|---|---|---|
| areasCompleted | `run.areasCompleted` | Already tracked |
| areasToWin | `run.areasToWin` | Already tracked |
| creaturesDefeated | `run.stats.kills` | Already tracked |
| creaturesBefriended | Diff creature collection before/after run | Need to track per-run |
| itemsCollected | Count of items gained during run | Need to track per-run |
| elementsCollected | Element drops gained during run | Need to track per-run |
| wordsImmersed | Unique words encountered during run | Need to track per-run |
| wordsMastered | Words crossing 5-exposure threshold this run | Need to track per-run |
| masteredWordList | Details (word, meaning, exposures) for mastered words | Need to track per-run |
| duration | `run.stats.endTime - run.stats.startTime` | Already tracked |
| runNumber | `meta.lifetimeStats.totalRuns` | Already tracked |

### Lifetime data (from meta-progression)

| Field | Source | Notes |
|---|---|---|
| creaturesDiscovered | `meta.creatureCollection.length` | Already tracked |
| totalCreatures | `CREATURES` array length from data/creatures.json | Static |
| itemsDiscovered | Items the player has ever obtained | Need lifetime tracking |
| totalItems | Items catalog length from data/items.json | Static |

### New tracking needed

1. **Per-run befriend count**: Snapshot creature collection at run start, diff at run end.
2. **Per-run items collected**: Counter incremented when items are picked up during a run.
3. **Per-run element drops**: Snapshot element drops at run start, diff at run end.
4. **Per-run word immersion**: Track unique words shown to player during run via `exposeWords()`.
5. **Per-run words mastered**: Track words that cross the 5-exposure threshold during this run (were below 5 before, now at or above 5).
6. **Lifetime items discovered**: Set of all item IDs ever obtained (persisted in meta-progression).
7. **Run summary object**: Build a `runSummary` object in `updateLifetimeStats()` and return it from `forfeitRun()` / victory endpoint so the frontend can render it.

## Architecture

### Server-side

- Add `runSummary` field to run state, populated incrementally during the run and finalized in `updateLifetimeStats()`.
- `forfeitRun()` captures the summary object before nulling `this.run`.
- The forfeit and victory endpoints return the summary in the response.
- Add `itemsDiscovered` set to `createMetaProgression()`.

### Frontend

- New `renderAdventureReport(summary, isVictory)` function replaces both `showGameOverModal()` and the victory screen in the existing takeover system.
- Uses the existing `gameover-view` takeover container.
- Summary data comes from the API response, not from `window.__gameState` (since run is cleared server-side).

### Visual

- Matches existing premium gacha aesthetic: `--bg-elevated` cards, `--shadow-soft`, `--card-radius`, cyan/lavender/green accents.
- Mobile-first, single column, scrollable.
- Mockup available at `tmp/adventure-report-mockup.html`.
