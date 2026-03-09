# Forge Workbench Design

> Turn curated theme pools into game content via a phone-friendly web dashboard backed by Claude Code Opus subagents.

## Problem

Three theme pools exist (school, airport, shopping-mall) with ~128 curated words, but converting them to game content requires manually invoking 5+ forge skills in the right order, one word at a time, from Claude Code. The pipeline feels disconnected and slow.

## Solution: Split Architecture

A web dashboard (`forge.html`) where the user selects words, assigns roles, adds guidance notes, and submits batches. A Claude Code skill (`/forge-queue`) reads the batch, spawns Opus subagents to do the creative AI work, and writes results back. The dashboard polls for results, lets the user edit/approve/re-forge.

**Zero API cost** — all AI work runs through Claude Code subagents (included in subscription).

```
┌──────────────────────┐         ┌──────────────────────┐
│   forge.html         │         │   Claude Code         │
│   (phone/browser)    │         │   (terminal)          │
│                      │         │                       │
│  Select words        │         │  /forge-queue         │
│  Assign roles+notes  │         │                       │
│  Submit ─────────────┼─ writes ──▶ forge-queue.json   │
│                      │         │                       │
│                      │         │  Reads queue          │
│                      │         │  Spawns Opus agents   │
│                      │         │  (parallel by group)  │
│                      │         │  Writes ─────────────┼──▶ forge-results.json
│                      │         │                       │
│  Results appear ◀────┼─ polls ─┤                      │
│  Edit inline fields  │         │                       │
│  Approve ────────────┼─ writes ──▶ staging files      │
│  Re-forge ───────────┼─ writes ──▶ forge-queue.json   │
└──────────────────────┘         └──────────────────────┘
```

## Dashboard UI (forge.html)

Phone-friendly single page served by the Koto dev server.

### Layout

1. **Theme selector** — dropdown of available themes, shows word count and progress
2. **Word list** — all words from the theme pool, color-coded by role, grayed if already forged
3. **Selection panel** — selected words with role dropdown + notes field per word
4. **Submit button** — writes batch to forge-queue.json
5. **Results panel** — forge results stream in as they complete

### Result Cards (Editable)

Each completed forge shows an editable card with fields appropriate to the role:

**Creature card fields:**
- Name (katakana), Name EN, Element (dropdown), Archetype (dropdown)
- Stage, Base MP, Description (textarea)
- Learnset (list with remove/add)

**Move card fields:**
- Name, Name EN, Element, Category, Power, MP Cost
- Status effect, Target, Tier, Description

**Item card fields:**
- Name, Name EN, Type, Rarity, Stage
- Components, Effect, Description, Description JA

**NPC card fields:**
- Name, Occupation, Personality, Area
- Bond hints, Knowledge, Example dialogue

All cards also have an expandable **Raw JSON** editor for power-user edits.

### Card Actions

Each result card has three actions:

- **Approve & Save** — writes edited data to staging file, marks word `assigned` in theme pool
- **Re-forge** — expands a notes field; submits new job with previous result as context so the AI iterates rather than starting blind. Role dropdown stays editable (can switch creature → item).
- **Discard** — removes result, word stays unassigned

## API Endpoints

All under `/api/forge/` namespace. No auth required (dev tool).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/forge/themes` | List available themes with progress stats |
| GET | `/api/forge/theme/:id` | Full theme pool JSON with assignment status |
| GET | `/api/forge/queue` | Read current forge queue |
| POST | `/api/forge/queue` | Append jobs to queue |
| GET | `/api/forge/results` | Read all forge results |
| POST | `/api/forge/approve` | Write edited result to staging, mark assigned |
| POST | `/api/forge/discard` | Remove result, keep word unassigned |

## Data Files

### `data/forge-queue.json`

```json
{
  "jobs": [
    {
      "id": "forge_<timestamp>_<random>",
      "themeId": "school",
      "word": "教える",
      "reading": "おしえる",
      "meaning": "teach",
      "rank": 1203,
      "role": "creature",
      "notes": "owl-like teacher creature",
      "status": "pending",
      "previousResult": null,
      "reforgeHistory": [],
      "submittedAt": "2026-03-09T..."
    }
  ]
}
```

**Job statuses:** `pending` → `processing` → `complete` | `error`

### `data/forge-results.json`

```json
{
  "results": [
    {
      "jobId": "forge_<timestamp>_<random>",
      "status": "complete",
      "forgedAt": "2026-03-09T...",
      "role": "creature",
      "word": "教える",
      "themeId": "school",
      "data": { },
      "agentNotes": "Used Psychic element to match teaching theme..."
    }
  ]
}
```

`agentNotes` explains the AI's reasoning so the user understands choices during review.

## `/forge-queue` Skill

Claude Code skill that reads the queue and processes pending jobs.

### Dependency-Aware Ordering

The skill processes jobs in this order to satisfy data dependencies:

1. **Moves first** — creatures need them for learnsets
2. **Creatures next** — areas need them for rosters
3. **Areas next** — NPCs need area context
4. **NPCs and items last** — no downstream deps

Within each group, jobs run in parallel via Opus subagents (up to 3-4 concurrent).

### Subagent Prompts

Each subagent receives:
- The word, its JPDB data (rank, reading, meaning)
- The theme context (area, stage, what's already been forged)
- Existing game data for dedup (creatures.json, moves.json, etc.)
- User's guidance notes
- Previous result (if re-forging) with history of notes
- Role-specific forging instructions derived from the existing SKILL.md files

Subagents output structured JSON matching the staging file schemas.

### Execution Flow

```
1. Read data/forge-queue.json
2. Filter for status: "pending"
3. Sort by dependency order (moves → creatures → areas → NPCs/items)
4. For each dependency group:
   a. Spawn Opus subagents (parallel within group)
   b. Each agent reads context, generates result, returns JSON
   c. Write results to data/forge-results.json
   d. Update job status in queue: pending → complete
5. Report summary
```

## Staging File Writes (on Approve)

When the user approves a result from the dashboard:

| Role | Staging file | Production file |
|------|-------------|----------------|
| Creature | `data/new-creatures-staging.json` | `data/creatures.json` |
| Move | `data/new-moves-staging.json` | `data/moves.json` |
| Item | `data/new-items-staging.json` | `data/items.json` |
| NPC | `data/new-npcs-staging.json` + `data/character-cards/` | `data/npcs.json` |
| Area | `data/new-areas-staging.json` | `data/areas.json` |

Staging → production promotion remains a separate step (not part of this design).

## Out of Scope

- Sprite/image generation (separate pipeline, runs after staging data exists)
- Staging → production promotion automation
- Area background generation
- Move/item icon generation
