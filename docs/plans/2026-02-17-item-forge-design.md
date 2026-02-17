# Item Forge: Food Item Generation Skill

**Date:** 2026-02-17
**Status:** Approved

## Overview

A Claude Code skill (`/item-forge`) that generates food-themed consumable items in batches of 10. Each item is a Japanese food word (often compound) with JPDB frequency data driving its rarity tier and combat effect. The skill iterates autonomously — brainstorming candidates, looking up frequencies, filtering duds — and only presents the user with a polished table of 10 viable items for approval.

## Goals

1. Replace all existing abstract/nature items with thematic food items
2. Teach players real Japanese food vocabulary through gameplay
3. Tier item power by word rarity (common words = basic heals, rare words = powerful effects)
4. Support compound words like 鮭寿司 (salmon sushi) with per-component frequency tracking

## Workflow

```
1. BRAINSTORM (~20-30 food item candidates)
   - Smart combinations: "salmon sushi", "cheeseburger", "melon bread"
   - Mix of Japanese-origin and loanword foods
   - Spread across difficulty tiers

2. JPDB LOOKUP (for each candidate)
   - Parse each component word via JPDB API
   - Get: spelling, reading, rank, raw meanings array
   - Also check compound if it might exist in JPDB

3. FILTER
   - Drop: words not found in JPDB (no rank data)
   - Drop: duplicates of items already in new-items-staging.json
   - Drop: items where ALL components are rank < 100 (too trivially common)
   - Drop: items where ANY component is rank > 30000 (too obscure)

4. IF < 10 viable items survive → brainstorm more, repeat from step 1

5. SELECT best 10 with good tier spread
   - Not all common, not all legendary
   - Diverse food types (sushi, bread, drinks, desserts, etc.)

6. ASSIGN effects based on rarity tier

7. PRESENT final 10 to user
   - Full frequency table with raw JPDB meanings
   - Proposed effect for each
   - User approves, rejects, or tweaks individual items

8. SAVE approved items → append to data/new-items-staging.json
```

## Tier System

Based on the **rarest component** (highest JPDB rank number). Uses the same tier boundaries as `scripts/lib/jpdb-helpers.mjs`:

| Tier | JPDB Rank | Rarity | Example Effect |
|------|-----------|--------|----------------|
| 1–3000 | common | Heal single creature 15-20% HP |
| 3001–6000 | uncommon | Heal all creatures 10-15% HP, or small stat buff (+2% attack) |
| 6001–12000 | rare | Heal one creature to full, charge boost +2-3, larger stat buff |
| 12001–20000 | epic | Revive at 50% HP, compound effects (heal + stat), temp boost* |
| 20001–30000 | legendary | Revive at full HP, temp boost (+3 attack/5 turns), multi-effect |

*Temp boost is schema-only for now — implementation deferred.

## Item Data Schema

```json
{
  "id": "salmon-sushi",
  "word": "鮭寿司",
  "reading": "さけずし",
  "meaning": "salmon sushi",
  "components": [
    { "word": "鮭", "reading": "さけ", "meanings": ["salmon"], "rank": 8521 },
    { "word": "寿司", "reading": "すし", "meanings": ["sushi"], "rank": 5890 }
  ],
  "compoundRank": null,
  "rank": 8521,
  "rarity": "rare",
  "type": "heal",
  "effect": { "healMostDamaged": true },
  "description": "Heal the most damaged creature to full HP",
  "descriptionJa": "最もダメージを受けたクリーチャーを全回復"
}
```

### Schema Differences from Old Items

| Field | Old | New |
|-------|-----|-----|
| `components` | (none) | Array of per-word JPDB data with raw `meanings` arrays |
| `compoundRank` | (none) | Compound's JPDB rank if it exists, null otherwise |
| `rank` | Single word rank | Derived from rarest component (max rank number) |
| `area` | Area string | Removed — food items are area-agnostic |
| `effect.tempBoost` | (none) | New type for deferred implementation |

### Temp Boost Effect Schema (Deferred)

```json
{
  "type": "stat",
  "effect": {
    "tempBoost": {
      "field": "attack",
      "value": 3,
      "turns": 5,
      "target": "single"
    }
  }
}
```

`target` can be `"single"` (one creature) or `"all"` (whole party). Combat code to process this is not yet implemented.

## Skill Architecture

Single-agent skill — no subagent relay needed. Food items are simple enough that one agent can brainstorm, look up frequencies, and present results without context bloat.

### JPDB Integration

Uses `scripts/lib/jpdb-helpers.mjs`:
- `parseBatch()` to parse Japanese food words and get vid/sid
- `lookupVocab()` to get frequency_rank and meanings for each component
- `tierFromRank()` to determine rarity tier

The skill writes a temp script to `/tmp/item-forge-lookup.mjs` that imports the helpers, runs lookups for all candidate words, and outputs JSON results.

### API Key

Reuses the creature-forge JPDB key at `data/.creature-forge-jpdb-key` (shared across vocabulary skills).

## Skill File Location

```
~/.claude/skills/item-forge/
  SKILL.md    ← Single skill file (no subagents needed)
```

## Effect Palette

Available effects (from existing `item-service.js`):

| Type | Effect | Description |
|------|--------|-------------|
| heal | `healPercent: N` | Heal lowest HP creature by N% of max HP |
| heal | `healAllPercent: N` | Heal all creatures by N% of max HP |
| heal | `healMostDamaged: true` | Heal most damaged creature to full |
| heal | `revivePercent: N` | Revive one KO'd creature at N% HP |
| stat | `field: "attackMult", value: N` | All creatures +N% attack |
| stat | `field: "hpMult", value: N` | All creatures +N% max HP (heals that amount) |
| stat | `field: "autoPowerMult", value: N` | All creatures +N% auto-skill power |
| stat | `field: "ultimatePowerMult", value: N` | All creatures +N% ultimate power |
| stat | `field: "elementEdge", value: N` | Super-effective damage +N |
| stat | `field: "flatDamageReduction", value: N` | All incoming damage reduced by N |
| utility | `chargeBoost: N` | All creatures gain +N ultimate charges |
| stat | `tempBoost: {...}` | Temporary per-creature buff (DEFERRED) |

## Presentation Format

When presenting 10 items to the user:

```
| # | Item | Japanese | Components | Tier Rank | Rarity | Effect |
|---|------|----------|------------|-----------|--------|--------|
| 1 | Salmon Sushi | 鮭寿司 (さけずし) | 鮭 ["salmon"] rank 8521 + 寿司 ["sushi"] rank 5890 | 8521 | rare | Heal most damaged to full |
| 2 | Rice Ball | おにぎり (おにぎり) | おにぎり ["rice ball"] rank 4200 | 4200 | uncommon | Heal all 10% |
...
```

Raw JPDB `meanings` arrays shown so user can verify translations.

## What This Replaces

All 40 items in the current `data/items.json` will eventually be replaced by food items from `data/new-items-staging.json`. The staging file accumulates items across multiple `/item-forge` runs. When ready, the user copies staging → items.json and the old items are gone.
