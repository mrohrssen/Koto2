# Internal SRS & Vocabulary Pacing System — Design Document

**Date:** 2026-03-07
**Status:** Designed, not yet implemented. Post-beta enhancement.
**Priority:** High (solves the vocabulary overload problem)

---

## Problem Statement

Players currently encounter 100-300 new Japanese words per themed area. Every creature, move, item, NPC, and sub-area name is vocabulary — and nothing gates how many new words appear per session. The game relies entirely on JPDB (external) for SRS scheduling, with no internal tracking of word exposure, test results, or review intervals.

**Root cause:** The game treats all content as vocabulary delivery with no budget controlling how many NEW words are introduced per session.

---

## Goals

1. **Cap new word introduction to 10-20 per day** (configurable per user)
2. **Build an internal SRS** that tracks exposure, testing, and review scheduling per word
3. **Make content selection vocabulary-aware** — creatures, items, NPCs, areas chosen based on the player's known vocabulary
4. **Run alongside JPDB** (not replace it) — internal SRS drives in-game content selection, JPDB remains an optional external review tool

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Internal SRS Store                  │
│  Per-user JSON: data/srs-{userId}.json              │
│  - Word exposure counts & timestamps                │
│  - Test pass/fail history                           │
│  - SM-2 intervals & scheduling                      │
│  - Daily new-word budget tracking                   │
│  - Per-area creature discovery progress             │
└──────────────┬──────────────────────┬───────────────┘
               │                      │
    ┌──────────▼──────────┐  ┌───────▼────────────┐
    │  Vocabulary Cost    │  │  Review Scheduler   │
    │  Function           │  │                     │
    │  "How many new      │  │  "Which words need  │
    │   words does this   │  │   review today?"    │
    │   content cost?"    │  │                     │
    └──────────┬──────────┘  └───────┬────────────┘
               │                      │
    ┌──────────▼──────────────────────▼───────────────┐
    │           Content Selection Layer                │
    │  - Creature encounter generation                 │
    │  - Area selection scoring                        │
    │  - Item shop filtering                           │
    │  - NPC encounter selection                       │
    │  - Narration word suggestions (existing)         │
    └─────────────────────────────────────────────────┘
```

---

## Data Model

### Per-Word SRS Entry

```javascript
{
  word: "亀",                    // Japanese word
  vid: 1234,                     // JPDB vocabulary ID (for sync)
  rank: 9300,                    // JPDB frequency rank

  // Exposure tracking
  exposureCount: 47,             // Total times shown to player (any context)
  lastExposureAt: 1709800000000, // Timestamp of last exposure
  exposureContexts: {
    combat: 32,                  // Split attack cards, move grid
    narration: 8,                // Narration/dialogue text
    shop: 3,                     // Item shop, dealer rooms
    npc: 2,                      // NPC name/dialogue
    area: 2,                     // Area/sub-area name display
    discovery: 0                 // Word discovery rooms
  },

  // Testing/recall tracking
  testCount: 5,                  // Times actively tested (quiz, whack-a-mole)
  passCount: 4,                  // Times correctly recalled
  failCount: 1,                  // Times failed recall
  lastTestAt: 1709750000000,     // Timestamp of last test

  // SRS scheduling (SM-2 algorithm)
  interval: 72,                  // Current review interval in hours
  easeFactor: 2.5,               // SM-2 ease factor (min 1.3, default 2.5)
  nextReviewAt: 1709900000000,   // When this word needs review

  // Discovery
  firstSeenAt: 1709500000000,    // When player first encountered this word
  status: "learning"             // unseen | introduced | learning | familiar | mastered
}
```

### Per-User Daily Budget

```javascript
{
  date: "2026-03-07",            // Tokyo date (JST)
  budgetTotal: 15,               // Daily cap (from user settings)
  budgetRemaining: 9,            // Words remaining today
  wordsIntroduced: [             // Words introduced today (for dedup)
    "蛇", "隠れる", "冷たい", "赤い", "泳ぐ", "凍る"
  ]
}
```

### Per-Area Creature Discovery Progress

```javascript
{
  areaId: "frozen-lake",
  visitCount: 2,
  discoveredCreatures: ["kamedor", "hebiveil", "sarukkii"],
  nextRevealAt: 6,               // Encounter index for next reveal
  totalEncounters: 8             // Lifetime encounters in this area
}
```

Storage: `data/srs-{userId}.json` (~1-2MB per user for 6,000 words).

---

## System 1: Daily New-Word Budget

### Rules

- Default budget: 15 new words/day (configurable in user settings)
- Budget resets at midnight Tokyo time (JST, consistent with existing word-tracking.js)
- "New word" = a word the player has never been exposed to before (`status === 'unseen'`)
- Words introduced earlier in the same session count as "known" for cost calculations
- Budget can go negative (gameplay > SRS purity — never block player actions)
- If budget is negative, no further new introductions are initiated by the system

### What Counts Against the Budget

| Event | Counts? | Why |
|---|---|---|
| New creature species appears in encounter | Yes | Creature base word + modifier + new moves |
| New item appears in shop | Yes | Item name word(s) |
| New NPC encountered | Yes | NPC name/occupation word(s) |
| New area entered (area name) | Yes | Area + sub-area name words |
| Narration introduces unknown word (i+1) | Yes | Grammar/function words |
| Player's creature levels up → new move | **No** | Already paced by leveling curve |
| Player befriends a creature | **Yes, but never blocked** | Words deducted, budget can go negative |
| Boss/story encounters | **No** | Narrative context provides scaffolding |

### Bootstrap Phase (Day 1)

New players get a higher budget (20-25) since everything is new. Budget decreases to normal (15) after the player knows ~50 words. The tutorial explicitly introduces the starter creature + first moves (~5 words), so the budget isn't consumed entirely by the tutorial.

---

## System 2: Vocabulary Cost Function

The core algorithm for content selection. Calculates how many new words a piece of content introduces.

### Creature Cost

```javascript
function creatureVocabCost(creature, playerKnownWords, spawnLevel) {
  let cost = 0;

  if (!playerKnownWords.has(creature.baseWord)) cost++;
  if (!playerKnownWords.has(creature.modifier.word)) cost++;

  // Moves the creature would know at this level
  const movesAtLevel = creature.learnset
    .filter(m => m.level <= spawnLevel)
    .map(m => getMove(m.moveId));

  for (const move of movesAtLevel) {
    if (!playerKnownWords.has(move.name)) cost++;
  }

  return cost;
}
```

### Why Cost Is Usually Low

The shared move pool means most common verbs (噛む, 走る, 守る, etc.) are learned early and reused across many creatures. A "new" creature typically costs 1-3 words, not 5-10, because its moves overlap with creatures the player already knows.

**Example:**
| Word in new creature 赤い蛇 | Known? | Cost |
|---|---|---|
| 蛇 (snake) — base | No | +1 |
| 赤い (red) — modifier | Yes (from another creature) | 0 |
| 噛む (bite) — move | Yes (starter knows it) | 0 |
| 走る (run) — move | Yes (starter knows it) | 0 |
| 隠れる (hide) — move | No | +1 |
| **Total** | | **2 words** |

---

## System 3: Graduated Creature Reveal

### Problem

Areas have 8 creature species. Exposing all 8 from Room 1 introduces ~40+ new words.

### Solution

Reveal creatures progressively through the area, gated by the daily word budget.

### Algorithm

```
First visit to area:
  1. Score all area creatures by vocabulary cost
  2. Pick 2-3 cheapest as "anchor" creatures (immediate spawn pool)
  3. Set nextRevealAt = encounter 3

Each encounter:
  1. If encounterIndex >= nextRevealAt AND budgetRemaining > 3:
     - Pick cheapest unrevealed creature from area pool
     - Add to discoveredCreatures
     - Set nextRevealAt += 3
  2. Generate enemies ONLY from discoveredCreatures pool

Return visits:
  - All previously discovered creatures available immediately
  - System can reveal 1-2 more undiscovered species
  - Rewards area revisits with discovery
```

### Encounter Flow Example

| Room | Creatures Available | New Words | Budget Effect |
|---|---|---|---|
| 1-3 | Anchor A (cost 1), Anchor B (cost 0) | 1 | 15 → 14 |
| 4 | A, B + **New species C revealed** (cost 2) | 2 | 14 → 12 |
| 5-7 | A, B, C (review/reinforcement) | 0 | 12 |
| 8 | A, B, C + **New species D revealed** (cost 2) | 2 | 12 → 10 |
| 9-12 | A, B, C, D (mix/review) | 0 | 10 |
| **Total** | 4 species seen (of 8 in pool) | **5 words** | Used 5 of 15 |

Remaining 4 species saved for return visits.

### Narrative Framing

- "A familiar creature appears!" → known species
- "Something new emerges from the shadows..." → new species reveal
- "You've gotten to know the creatures here well." → area mastery milestone

Ties into the Translator device: "Your Translator identifies a creature you haven't seen before."

---

## System 4: Graduated Move Reveal (via Enemy Level)

### Problem

Higher-level enemies know more moves → more vocabulary per encounter.

### Solution

Control enemy level for new species introductions.

```javascript
function getEnemyLevelForSpecies(creature, playerLevel, playerSRS) {
  const isNewSpecies = !playerSRS.hasEncountered(creature.id);

  if (isNewSpecies) {
    // First encounter: lower level = fewer moves learned (2-3)
    return Math.max(1, playerLevel - 3);
  }

  // Known species: normal level scaling
  return calculateNormalLevel(playerLevel, ...);
}
```

A level 5 creature knows ~3 moves. A level 15 creature knows ~5-6. By introducing new species at lower levels, move vocabulary exposure is controlled automatically.

Subsequent encounters with the same species use higher levels, gradually revealing more moves — mirroring how the player's own creatures learn moves through leveling.

---

## System 5: SRS-Aware Content Selection

### Area Selection

**Current:** Random 2 areas offered (excluding current).

**SRS-aware:** Score each area by vocabulary overlap:

```javascript
function scoreAreaForPlayer(area, playerKnownWords) {
  const areaWords = getAllAreaVocabulary(area);
  // area name, sub-area names, creature words, NPC words, item words

  const knownCount = areaWords.filter(w => playerKnownWords.has(w)).length;
  const overlapRatio = knownCount / areaWords.length;

  // Ideal: 60-80% overlap (enough review + room for new words)
  // Too high (>90%): boring, no new learning
  // Too low (<40%): overwhelming, too many new words

  return overlapRatio;
}
```

Offer 2 areas in the 60-80% overlap sweet spot. If none qualify, offer the closest matches.

### Creature Encounter Generation

```
Priority order for encounter slots:

1. REVIEW-DUE: Creatures whose words have expired SRS intervals
   → Forces review of overdue vocabulary through gameplay

2. NEW INTRODUCTION: 1 new creature (if budget allows + reveal timer reached)
   → Gated by daily budget and graduated reveal

3. FAMILIAR FILLER: Known creatures for variety
   → Random selection from discovered pool
```

### Item Shop Filtering

```javascript
function filterShopItems(areaItems, playerKnownWords, budgetRemaining) {
  const known = areaItems.filter(item =>
    playerKnownWords.has(item.name) || playerKnownWords.has(item.baseWord)
  );

  const newItems = areaItems.filter(item =>
    !playerKnownWords.has(item.name)
  );

  // Show mostly known items + 1-2 new within budget
  const newToShow = newItems.slice(0, Math.min(2, budgetRemaining));
  return [...known, ...newToShow];
}
```

### NPC Encounter Selection

Areas have a pool of potential NPCs. SRS selects which ones appear based on whether the player knows their name/occupation words, similar to creature selection.

---

## System 6: Review Scheduling

### How Review Happens Through Gameplay

| Game Action | SRS Effect | Interval Change |
|---|---|---|
| See word on split attack card | Passive exposure | interval *= 1.1 |
| Select move from grid | Active engagement | interval *= easeFactor |
| See word in narration | Passive exposure | interval *= 1.1 |
| See word in shop/NPC | Passive exposure | interval *= 1.1 |
| Quiz room — correct answer | Hard test — pass | interval *= easeFactor, easeFactor += 0.1 |
| Quiz room — wrong answer | Hard test — fail | interval = 24h, easeFactor -= 0.2 (min 1.3) |
| Whack-a-mole — hit | Hard test — pass | interval *= easeFactor, easeFactor += 0.1 |
| Whack-a-mole — miss | Hard test — fail | interval = 24h, easeFactor -= 0.2 (min 1.3) |

### Review-Driven Content

When a word's `nextReviewAt` has passed, the SRS actively tries to surface it:

- **Creature words** → increase spawn rate of creatures carrying that word
- **Move words** → spawn creatures that use that move
- **Area words** → offer areas containing that word as an option
- **Narration words** → include in word suggestion list (existing mechanism)
- **Item words** → show in next dealer room

The game never says "time for review!" — the review happens naturally through content selection.

---

## System 7: JPDB Integration

### Relationship

Internal SRS and JPDB run in parallel:

| Concern | Internal SRS | JPDB |
|---|---|---|
| In-game content selection | Primary | — |
| Exposure tracking | Primary | — |
| Review scheduling (in-game) | Primary | — |
| External flashcard review | — | Primary |
| Word state sync | Reads from JPDB | Source of truth for external state |
| New word introduction budget | Primary | — |

### Sync Strategy

- On session start: import JPDB word states into internal SRS (merge, don't overwrite)
- Internal SRS tracks strictly more data than JPDB provides
- If JPDB says a word is "known" but internal SRS has never exposed it, trust JPDB (player learned it externally)
- If internal SRS has high exposure but JPDB says "new", the word is known in-game but not reviewed externally

---

## Implementation Phases

### Phase 1: Foundation (1-2 sessions)
- Build `src/game/internal-srs.js` — data model, persistence, exposure counting
- Add exposure counting hooks at existing touchpoints (combat, narration, shops)
- Add daily new-word budget to word-tracking.js
- **No behavior changes yet** — just collecting data

### Phase 2: Low-Hanging Fruit (1-2 sessions)
- SRS-aware item shop filtering
- Enhanced narration word suggestions (budget-aware)
- Budget-gated word discovery rooms

### Phase 3: Creature & Area Selection (2-3 sessions)
- Vocabulary cost function
- Graduated creature reveal per area
- SRS-aware area selection scoring
- Encounter generation using vocabulary-aware creature selection
- Enemy level control for new species

### Phase 4: Polish & Review Scheduling (2-3 sessions)
- SM-2 interval scheduling
- Review-driven content surfacing
- JPDB two-way sync
- Bootstrap sequence tuning
- Budget calibration based on beta feedback

---

## Edge Cases

### New player (0 known words)
Tutorial introduces starter creature + moves (~5 words). First area anchors share moves with starter. Day-1 budget is higher (20-25). Budget normalizes after ~50 known words.

### Player returns to previously visited area
All discovered creatures available immediately. System reveals 1-2 more undiscovered species. Mostly review encounters — reinforces vocabulary.

### All area creatures are expensive
SRS-aware area selection prevents this from being offered. If it happens anyway, system reveals cheapest creatures first and paces slowly.

### Player befriends an expensive creature
Always allowed. Words deducted from budget (can go negative). Fewer new introductions for the rest of the session. Befriended creature's words immediately count as "known."

### Player's creature levels up → new move
Does NOT count against daily budget. Leveling is already naturally paced (1 new verb every 5-10 battles). Tracked for exposure counting only.

---

## Code Changes Summary

| File | Change | Impact |
|---|---|---|
| **New:** `src/game/internal-srs.js` | SRS data model, persistence, cost function, budget | New file |
| `src/game/creatures.js` → `generateEnemyCreatures()` | Vocabulary-aware selection, graduated reveal | Medium |
| `src/game/rooms.js` → `getAreaSelectionOptions()` | Score areas by vocabulary overlap | Easy |
| `src/game/loop.js` | Record exposures after combat actions | Easy |
| `src/game/services/exploration-service.js` | Pass SRS context to encounter generation | Easy |
| `src/word-tracking.js` | Integrate with daily budget | Easy |

**What doesn't change:** Combat UI, split attack cards, move grid, befriending mechanics, XP, leveling, creature/move/area data structures.
