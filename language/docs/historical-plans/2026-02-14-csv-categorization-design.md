# CSV Categorization Design: Tsukumogami Entity Types

**Date**: 2026-02-14
**Input**: `JAPANESE NAMES/Translation Only Words.csv` (707 rows)
**Output**: Same CSV with new `Category` column

## Goal

Categorize every row in the translation CSV as one of five game entity types: **NPC, Item, Creature, Place, Concept**. Use Opus 4.6 to reason about each entry, applying the Tsukumogami lore for object categorization.

## Categories

| Category | Rule | Examples |
|----------|------|----------|
| NPC | Humans, human roles, relationships — anyone a player could talk to | teacher, chef, doctor, mother, cashier |
| Creature | Animals AND enduring objects that could "wake up" — things cherished long enough to develop a spirit | dog, elephant, desk, clock, umbrella, train, book, piano |
| Item | Consumable/expendable objects — things that are spent, used up, or exist to fuel others | rice, bread, soap, medicine, stamp, bandage, paper |
| Place | Locations, buildings, rooms | classroom, library, gym, restaurant, airport |
| Concept | Abstract ideas, colors, shapes, seasons, academic subjects | spring, history, red, circle, health |

## Tsukumogami Lore (AI System Context)

> Tsukumogami (付喪神) — the belief that objects used and cherished long enough develop a spirit. A well-loved pair of scissors wakes up. An old school desk comes alive. But a rice ball? A bandage? A stamp? Those exist to be consumed — they never stick around long enough to develop a soul.
>
> Rule: "Things that endure gain a spirit. Things that are spent fuel those spirits."
>
> You can justify: teacup creature, train creature, cloud creature, book creature, umbrella creature. The question is not "Is this alive?" but "Did this object wake up?"

## Implementation

### Script: `scripts/categorize-csv.mjs`

1. Read CSV, parse all 707 rows
2. Send to Opus 4.6 in batches of ~50 items
3. Each batch includes: item name (English), existing Type, Location context
4. AI returns JSON array of categories with brief reasoning
5. Write back CSV with new `Category` column appended

### Batch Prompt Structure

- **System**: Tsukumogami lore + category definitions
- **User**: JSON array of `{ item, type, location }` objects
- **Expected response**: JSON array of `{ item, category }` objects

### Error Handling

- Retry failed batches once
- Log any items that couldn't be categorized
- Validate that every category is one of the five valid values
