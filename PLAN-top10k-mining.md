# Top 10k Content Mining Plan

## Overview
Mine the top 10,000 most common Japanese words to find game-relevant content for the JRPG.

## Goal
Identify words from the frequency list that can become:
- **Items**: weapons, armor, consumables, materials, accessories
- **Enemies/Creatures**: monsters, animals, supernatural beings
- **Places/Locations**: floor themes, room types, world locations
- **NPCs/Roles**: shopkeepers, quest givers, character classes
- **Actions/Skills**: combat abilities, player actions
- **Phrases/Expressions**: NPC dialogue, narration flavor

## Approach

### Data Source
- JPDB deck containing top 10k Japanese words (sorted by frequency rank)
- Deck ID: **[TO BE PROVIDED BY USER]**

### Process
1. **Fetch deck vocabulary** via existing JPDB API integration
2. **Enrich with POS** using `part_of_speech` field from JPDB lookup
3. **Auto-categorize by POS**:
   - 名詞 (Noun) → candidates for items/places/enemies/people
   - 動詞 (Verb) → skill/action candidates
   - 形容詞 (i-adj) / 形容動詞 (na-adj) → modifiers for items/enemies
   - 感動詞 (Interjection) → dialogue/expressions
   - 副詞 (Adverb) → narration flavor
4. **AI sub-classification** for nouns:
   - Weapon, Armor, Consumable, Material
   - Enemy, Creature, Boss
   - Place, Location, Environment
   - Person, Role, NPC type
5. **Output** structured JSON with ranked suggestions

### Technical Details

#### JPDB API Fields Needed
```javascript
vocabulary_fields: ['spelling', 'reading', 'part_of_speech', 'meanings_chunks']
```

#### Output Format
```json
{
  "metadata": {
    "source_deck_id": "XXXXX",
    "total_words": 10000,
    "generated_at": "2024-XX-XX"
  },
  "items": {
    "weapons": [
      {"word": "剣", "reading": "けん", "rank": 1234, "meanings": ["sword"], "suggestion": "Basic sword weapon"}
    ],
    "armor": [],
    "consumables": [],
    "materials": [],
    "accessories": []
  },
  "enemies": {
    "creatures": [],
    "humanoids": [],
    "supernatural": []
  },
  "places": {
    "environments": [],
    "structures": [],
    "rooms": []
  },
  "npcs": {
    "roles": [],
    "occupations": []
  },
  "skills": {
    "combat": [],
    "utility": []
  },
  "dialogue": {
    "greetings": [],
    "expressions": [],
    "exclamations": []
  }
}
```

### Files
- **Script**: `scripts/mine-top10k.js` (to be created)
- **Output**: `data/game-content-suggestions.json`

## Current Game Content (for reference)

### Existing Item Types
- Weapons: WEAPONS in `src/game/items/equipment.js`
- Armor: ARMOR, SHIELDS in `src/game/items/equipment.js`
- Accessories: ACCESSORIES in `src/game/items/equipment.js`
- Consumables: CONSUMABLES in `src/game/items/consumables.js`
- Skills: SKILLS in `src/game/items/skills.js`

### Existing Enemies
- Defined in `src/game/enemies.js`
- Tiers 1-6 with bosses

### Existing Locations
- Floor lore in `src/game/lorebook.js`
- 6 floors: Caves, Ruins, Bone Corridors, Flame Path, Dark Forest, Dragon's Nest

## Next Steps
1. User provides JPDB deck ID for top 10k words
2. Create mining script at `scripts/mine-top10k.js`
3. Run script to generate categorized output
4. Review output and integrate promising content into game

## Configuration
- JPDB API key should be in `.env` as `JPDB_API_KEY` or in `.jrpg-settings.json`
