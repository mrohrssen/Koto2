# NPC Forge Skill Design

**Date:** 2026-02-17
**Status:** Approved

## Overview

A Claude Code skill that generates batches of 5 NPCs for a chosen game area, with JPDB frequency-matched names, rich personalities, and character cards for the AI dialogue system. Mirrors the creature-forge naming pattern (portmanteau name + modifier title) but produces human NPCs instead of collectible creatures.

## Goals

- Generate 5 NPCs per invocation, targeted at a specific area
- Each NPC has two JPDB-verified vocab words (base word + modifier)
- Names use the creature-forge portmanteau convention (base reading embedded in a natural-sounding Japanese name)
- Rich personality data drives the existing AI dialogue generation pipeline
- Output matches both `npcs.json` and `character-cards/npcs.json` formats
- When called with no args, list areas and their NPC counts so user can pick where to fill gaps

## Invocation

- `/npc-forge` — list areas with NPC counts, user picks one
- `/npc-forge <area-id>` — skip to Phase 1 for that area

## Phase Flow

### Phase 0: Area Selection (no-args only)

Read `data/new-areas-staging.json` and `data/new-npcs-staging.json`. Display:

```
| # | Area               | NPCs  | Needs |
|---|--------------------|-------|-------|
| 1 | Suizokukan (水族館)  | 2/10  | 8     |
| 2 | Mori (森)           | 0/10  | 10    |
```

User picks an area.

### Phase 1: JPDB Vocab Discovery

1. Subagent (sonnet) brainstorms 5 NPC concepts fitting the area theme.
2. For each NPC: select a base word and a modifier word. Base words can be occupations, personality traits, or area-themed nouns — whatever fits the character. Modifiers can be personality adjectives, role nouns, or descriptors.
3. JPDB batch lookup for all 10 words via `scripts/lib/jpdb-helpers.mjs`.
4. Generate portmanteau names (base reading as contiguous romaji substring).
5. Present candidate table:

```
| # | Name     | Katakana | Base Word     | Rank  | Modifier      | Rank  | One-liner |
|---|----------|----------|---------------|-------|---------------|-------|-----------|
| 1 | Mizuha   | ミズハ    | 水 (water)     | 580   | 優しい (gentle) | 1,200 | Soft-spoken aquarium caretaker |
```

Always show raw JPDB `meanings` arrays. User approves/adjusts.

### Phase 2: Identity & Character Card Generation

Subagent (opus) generates for each NPC:

**Game data fields:**
- `personality.traits` (array)
- `personality.speechStyle` (string)
- `personality.quirk` (string)

**Character card fields:**
- `description` — 1-2 sentences, mentions area, tier, and visual appearance
- `personality` — comma-separated trait string
- `quirk` — signature behavior
- `goals.possessed` — how the System twisted their nature
- `goals.glitching` — what breaks through during moments of clarity
- `goals.liberated` — what they want after being freed
- `knowledge.personal` — backstory and area connection
- `knowledge.world` — array of lorebook keys (from: `the_system`, `liberation`, `the_liberator`, `corruption`, `neo_tokyo`, `ward_1`–`ward_4`)
- `exampleDialogue` — 3 lines (possessed greeting, freed reaction, post-liberation)

Present all 5 for review. User can reroll individual NPCs.

### Phase 3: Save

1. Append game data to `data/new-npcs-staging.json` (initialize `[]` if missing).
2. Append character cards to `data/character-cards/new-npcs-staging.json` (initialize `{}` if missing).
3. Confirm with area NPC count.

## Output Data Shapes

### Game Data (`data/new-npcs-staging.json`)

```json
{
  "id": "mizuha",
  "name": "ミズハ",
  "nameEn": "Mizuha",
  "baseWord": "水",
  "baseReading": "みず",
  "baseMeaning": "water",
  "baseRank": 580,
  "modifier": {
    "word": "優しい",
    "reading": "やさしい",
    "meaning": "Gentle",
    "rank": 1200
  },
  "area": "suizokukan",
  "tier": 1,
  "personality": {
    "traits": ["gentle", "nurturing"],
    "speechStyle": "Soft-spoken, uses polite forms, speaks slowly",
    "quirk": "Talks to the fish like old friends"
  },
  "createdAt": "2026-02-17"
}
```

### Character Card (`data/character-cards/new-npcs-staging.json`)

```json
{
  "mizuha": {
    "id": "mizuha",
    "name": "ミズハ",
    "nameEn": "Mizuha",
    "description": "A former marine biologist who stayed behind when the aquarium closed under System control. Wears a faded lab coat over a wetsuit. Tier 1 — encountered in the Aquarium area.",
    "personality": "gentle, nurturing, soft-spoken, uses polite forms, speaks slowly",
    "quirk": "Talks to the fish like old friends, names every creature in the tanks",
    "goals": {
      "possessed": "Protect the tanks at all costs. The System turned her caretaking instinct into territorial aggression.",
      "glitching": "Pauses mid-attack to murmur a fish's name, briefly lucid as she remembers feeding schedules.",
      "liberated": "Worried about the fish surviving without her care. Asks the player to help check on the deeper tanks."
    },
    "knowledge": {
      "personal": "Was a marine biologist who studied at the aquarium for years. Knows the behavior of every species in the tanks.",
      "world": ["the_system", "liberation"]
    },
    "exampleDialogue": [
      "この水槽に近づかないで。私の…私たちの魚なの。",
      "あ…私、何を…？魚たちは大丈夫？ごはんの時間は…？",
      "助けてくれてありがとう。でも…奥の水槽、見てくれませんか？"
    ]
  }
}
```

## Naming Convention

Same portmanteau system as creature-forge:
- Base word provides the core reading embedded in the name
- Name = portmanteau that sounds like a natural Japanese name while containing the base reading
- Title = `modifier.meaning` + role context (e.g., "Mizuha the Gentle Keeper")
- Base reading must appear as contiguous romaji substring in the name
- Katakana must correctly render the romaji

## Checklist Before Saving

- [ ] All JPDB ranks from API calls (not guessed)
- [ ] Raw meanings arrays shown to user and verified
- [ ] English translations dictionary-accurate — no embellishment
- [ ] Base reading is contiguous substring of romaji name
- [ ] Katakana correctly renders the romaji
- [ ] No duplicate ids with existing NPCs (check both `npcs.json` and staging)
- [ ] All 5 NPCs assigned to the chosen area
- [ ] Character card goals cover all 3 states (possessed/glitching/liberated)
- [ ] `knowledge.world` includes relevant lorebook keys
- [ ] 3 example dialogue lines per NPC
- [ ] `createdAt` set to today's date

## Differences from Creature Forge

| Aspect | Creature Forge | NPC Forge |
|--------|---------------|-----------|
| Batch size | 1 | 5 |
| Image generation | Gemini Flash | None |
| Combat skills | attack + ultimate | None |
| Character cards | No | Yes (goals, knowledge, example dialogue) |
| Subagents | 4 | 2 (concept/naming, character cards) |
| Output files | 1 (creatures staging) | 2 (NPC staging + character cards staging) |
| Base word source | Animals, objects | Mix: occupations, traits, area nouns |
| Modifier source | Adjectives/descriptors | Mix: personality, role, descriptor |

## Re-roll Handling

- "redo names" — re-run Phase 1 with adjusted concepts
- "redo characters" — re-run Phase 2 for specific NPCs
- "redo all" — re-run from Phase 1
