# Forge Skills Overhaul Design

**Date:** 2026-03-03
**Status:** Design

## Problem

The Koto Forge skills (creature-forge, item-forge, area-forge, npc-forge) were written before several major game systems were added:

- **Pokemon-style moves** — Creatures no longer have attack/ultimate verbs. They have learnsets of 4-6 moves referencing `data/moves.json`. There is no forge for creating moves.
- **Stage system** — All content is tagged with stages 1-10 (mapped to WK levels + JPDB frequency bands). Forges don't know about stages.
- **Vocab category files** — 17 semantic category files in `language/categories/` with ~20K pre-categorized words, plus WK vocab with POS tags. Forges don't use these for discovery.
- **Sub-area system** — Areas now have 6 named sub-areas with specific backgrounds. Area forge doesn't generate these.
- **Expanded item types** — Items are no longer just food consumables. Equipment (persistent, stat bonuses) and crafting resources are planned.
- **MP resource** — Creatures have `baseMp` stats. Creature forge doesn't output this.

## Cross-Cutting: Stage-Aware Discovery

Every forge has a "discovery mode" that currently brainstorms ideas from scratch. This is replaced by **data-driven discovery** using our existing word databases.

### Data Sources

| Source | Path | Contents |
|---|---|---|
| WK Vocab | `language/dictionaries/wanikani-vocab.json` | 6,759 words with POS tags, levels 1-60 |
| 17 Category Files | `language/categories/*.json` | ~20K words sorted by JPDB rank |
| Stage Definitions | `data/stage-definitions.json` | 10 stages with WK level ranges + JPDB caps |
| Stage Utils | `language/stage-utils.js` | `getWordStrictStage()`, `suggestStage()`, `getContentWords()` |

### Category-to-Forge Mapping

| Forge | Category Files | WK POS Filter |
|---|---|---|
| Creature (base words) | `animals.json`, `objects.json`, `nature.json` | nouns |
| Creature (modifiers) | `descriptors.json`, `emotions.json`, `colors.json` | adjectives (i-adj, na-adj, no-adj) |
| Move | `actions.json`, `movement.json`, `combat.json` | verbs (godan, ichidan, suru) |
| Item (consumable) | `foods.json` | nouns |
| Item (equipment) | `objects.json` (filtered: weapons, armor, accessories) | nouns |
| Item (crafting) | `nature.json`, `objects.json` (filtered: raw materials) | nouns |
| Area | `locations.json`, `nature.json` | nouns |
| NPC | `occupations.json`, `social.json` | nouns (person-types) |

### New Discovery Flow (all forges)

1. User invokes forge with optional `--stage N` flag (or no args for auto-pick)
2. If no stage specified, forge scans existing content to find the stage with the least coverage for that content type
3. Forge reads relevant category files + WK vocab
4. Filters words to target stage: WK level within `wkLevels` range OR JPDB rank within `jpdbKanaCap`
5. Cross-references existing data files to exclude already-used words
6. Presents top candidates sorted by frequency rank, showing WK level and JPDB rank
7. User picks from candidates (or provides their own word)

---

## 1. Creature Forge — Major Overhaul

### What's Broken
- `combat-vocab.md` subskill generates attack verb + ultimate verb — system no longer exists
- Phase 2 user picks table includes attack/ultimate verb selection — obsolete
- Output schema missing `baseMp`, `stage`, `learnset`

### What Still Works
- `name-vocab.md` — stylized name generation from base reading
- `identity-modifier.md` — archetype, element, modifier selection (needs stage filter for modifier)
- `visual-designer.md` — 3 visual concepts with art briefs
- Mouse Rule (concept-visual alignment)
- Frequency-rarity tier system (verify alignment with stage jpdbKanaCap values)

### Changes

#### Delete `combat-vocab.md`, replace with `learnset-builder.md`

The new subskill searches existing `moves.json` rather than generating new verbs:

1. Filter moves by creature's element (prioritize same-element for STAB)
2. Filter by archetype fit:
   - Fighter → damage-heavy (3-4 damage, 1 buff/shield)
   - Mage → variety (2 damage, 1-2 buff/debuff, 1 heal/shield)
   - Trickster → status-focused (2 damage, 2-3 debuff, 0-1 buff)
   - Tank/Healer → defensive (1-2 damage, 2-3 heal/shield, 0-1 buff)
3. Filter by stage: move stage <= creature's stage
4. Pick 4-6 moves with tier spread: 2-3 tier 1 (levels 1, 5), 1-2 tier 2 (levels 9, 12), 0-1 tier 3 (levels 16, 20)
5. Ensure at least 1 STAB move (same element as creature)
6. Check for roster diversity — avoid assigning the same 4 moves to every Fighter

#### Update Discovery Mode

- Pull base word candidates from `animals.json` + `objects.json` + `nature.json`, filtered by target stage
- Pull modifier candidates from `descriptors.json` + `emotions.json` + `colors.json`, filtered by stage
- Show WK level + JPDB rank per candidate
- Cross-ref `data/creatures.json` to exclude existing base words

#### Update Phase 2 User Picks

Remove attack/ultimate verb columns. Add learnset review:

```
Move          | Element | Category | Tier | Learn Lv
─────────────────────────────────────────────────────
噛む (bite)   | neutral | damage   | 1    | 1
飲む (drink)  | water   | heal     | 1    | 5
眠る (sleep)  | neutral | debuff   | 2    | 9
固める (harden)| earth  | shield   | 2    | 12
渡す (hand over)| neutral| heal    | 2    | 16
浮かぶ (float) | water  | buff     | 3    | 20
```

#### Update Output Schema

```json
{
  "id": "kamedor",
  "name": "カメドル",
  "nameEn": "Kamedor",
  "element": "water",
  "rarity": "common",
  "baseHp": 160,
  "baseAttack": 8,
  "baseMp": 80,
  "baseWord": "亀",
  "baseReading": "かめ",
  "baseMeaning": "turtle",
  "baseRank": 9300,
  "archetype": "Tank/Healer",
  "description": "...",
  "modifier": { "word": "古代", "reading": "こだい", "meaning": "Ancient", "rank": 5500 },
  "learnset": [
    { "moveId": "kamu", "level": 1 },
    { "moveId": "nomu", "level": 5 },
    { "moveId": "nemuru", "level": 9 },
    { "moveId": "katameru", "level": 12 },
    { "moveId": "watasu", "level": 16 },
    { "moveId": "ukabu", "level": 20 }
  ],
  "stage": 6,
  "createdAt": "2026-03-03"
}
```

#### baseMp by Archetype

| Archetype | baseHp | baseAttack | baseMp |
|---|---|---|---|
| Fighter | 100 | 10 | 60 |
| Mage | 75 | 8 | 120 |
| Trickster | 85 | 9 | 90 |
| Tank/Healer | 160 | 8 | 80 |

---

## 2. Move Forge — NEW Skill

No forge exists for creating moves. With 150 moves and a target of 600-1,000, this is a critical gap.

### Input Modes

- **Direct:** `/move-forge 走る` — design a move from a specific verb
- **Discovery:** `/move-forge --stage 3` — suggest verbs from category files for Stage 3
- **Batch:** `/move-forge --stage 3 --count 10` — generate 10 moves for Stage 3

### Discovery

Pull from `actions.json` (2,977) + `movement.json` (1,280) + `combat.json` (1,130). Also check WK vocab filtered to verbs (godan, ichidan, suru). Exclude verbs already in `data/moves.json`. Filter to target stage.

### Design Per Move

For each verb, determine:

1. **Element** — based on verb meaning/imagery. Physical force → earth. Speed/cutting → metal. Growth/life → wood. Heat/energy → fire. Flow/cold → water. Generic → neutral.
2. **Category** — based on verb semantics:
   - Physical action verbs (切る, 打つ, 投げる) → `damage`
   - Protective verbs (守る, 隠れる, 防ぐ) → `shield`
   - Mental/emotional verbs (惑わす, 眠る, 混乱) → `debuff`
   - Enhancement verbs (走る, 強める, 急ぐ) → `buff`
   - Caring/restoring verbs (治す, 助ける, 癒す) → `heal`
   - Consuming verbs (吸う, 奪う, 食べる) → `drain`
3. **Target** — `single_enemy`, `all_enemies`, `single_ally`, `all_allies`, `self`
4. **Power + mpCost** — by tier:
   - Tier 1: power 15-30, mpCost 8-18
   - Tier 2: power 28-50, mpCost 18-26
   - Tier 3: power 50-65, mpCost 30-42
5. **Status effect** — if applicable (poison, sleep, stun, confuse, attack_buff, haste, shield, team_shield, taunt)
6. **Stage** — via `suggestStage()` on the verb

### Balance Constraints

- Element distribution should stay roughly even across the full move pool
- Category distribution target: ~40% damage, ~15% buff, ~15% debuff, ~12% shield, ~10% heal, ~8% drain
- Each stage should have moves across all categories (no stage with zero heals)
- AoE moves should be higher tier (tier 2-3) and higher mpCost

### Output Schema

```json
{
  "id": "hashiru",
  "name": "走る",
  "nameEn": "Dash",
  "reading": "はしる",
  "meaning": "to run / to rush, to dash",
  "rank": 400,
  "element": "neutral",
  "category": "buff",
  "target": "self",
  "power": 0,
  "mpCost": 10,
  "statusEffect": "haste",
  "statusChance": 100,
  "statusDuration": 1,
  "tier": 1,
  "description": "Rushes forward at full speed, gaining an extra action.",
  "stage": 1
}
```

### Phases

1. **Word selection** — discovery from category files or direct input, JPDB lookup
2. **Move design** — element, category, target, power, mpCost, status, tier
3. **Balance check** — compare against existing moves.json distribution
4. **User review** — present table for approval
5. **Save** — append to `data/new-moves-staging.json`

---

## 3. Item Forge — Major Update (Unified)

Currently generates only food-themed consumables. Expanding to cover all three item types.

### Input Modes

- `/item-forge` — default: 10 consumables (current behavior + updates)
- `/item-forge --type equipment` — generate equipment items
- `/item-forge --type crafting` — generate crafting resources
- `/item-forge --stage 3` — target specific stage
- `/item-forge --type equipment --stage 5 --count 5` — full control

### Type-Specific Design

#### Consumables (existing, updated)
- **Source words:** `foods.json` (602 words), filtered by stage
- **Effects:** heal, healAll, boost (attack%), charge (MP/ultimate), revive, xpCharm, xpBalance
- **Schema additions:** `components` array (compound word parts), `compoundRank`, `stage`, `descriptionJa`
- **Rarity-to-effect mapping:** common → basic heal, uncommon → heal-all/small boost, rare → targeted heal/charge, epic → revive, legendary → multi-effect

#### Equipment (new)
- **Source words:** `objects.json` filtered to weapons/armor/accessories + WK nouns
- **Fields:** `slot` (weapon/armor/accessory), `statBonus` ({attack%, hp%, mp%, elementEdge}), `creatureTypeRestriction` (optional archetype or element filter)
- **Persistence:** Equipment persists in creature collection (not run-scoped)
- **One slot per creature** — equip replaces previous
- **Compound word structure** — e.g. 鉄の剣 (iron sword) teaches both 鉄 and 剣

#### Crafting Resources (new)
- **Source words:** `nature.json` + `objects.json` filtered to raw materials
- **Fields:** `yieldsItemId` (what it crafts into), `quantity` (how many needed)
- **Compound word teaching** — resources combine to teach compound vocabulary
- **Run-scoped** — gathered during runs, not persistent

### Updated Output Schema

```json
{
  "id": "curry-bread",
  "word": "カレーパン",
  "reading": "かれーぱん",
  "meaning": "curry bread",
  "itemType": "consumable",
  "components": [
    { "word": "カレー", "reading": "カレー", "meanings": ["curry"], "rank": 4600 },
    { "word": "パン", "reading": "パン", "meanings": ["bread"], "rank": 2000 }
  ],
  "compoundRank": 39900,
  "rank": 4600,
  "rarity": "uncommon",
  "type": "heal",
  "effect": { "healAllPercent": 0.1 },
  "description": "Heal all creatures for 10% of max HP",
  "descriptionJa": "全クリーチャーのHPを10%回復",
  "stage": 6
}
```

Equipment adds:
```json
{
  "itemType": "equipment",
  "slot": "weapon",
  "statBonus": { "attackPercent": 10 },
  "creatureTypeRestriction": null
}
```

### Phases

1. **Type selection** — consumable, equipment, or crafting
2. **Word discovery** — from category files, filtered by stage, exclude existing items
3. **JPDB lookup** — verify ranks, get components for compounds
4. **Effect/stat design** — type-specific effect or stat bonus assignment
5. **Balance check** — verify rarity distribution and effect scaling
6. **User review** — present table for approval
7. **Save** — append to `data/new-items-staging.json`

---

## 4. Area Forge — Moderate Update

### Changes

#### Stage-Aware Discovery
- Pull from `locations.json` (1,278 words), filtered by target stage
- Cross-ref existing areas to avoid duplicates
- Show WK level + JPDB rank per candidate

#### Stage Field
- Areas get a `stage` number (auto-computed or explicit)
- Creature matching must factor stage: area's creature pool should contain creatures at or near the area's stage

#### Sub-Area Generation (New Phase)
After creature matching, generate 6 sub-areas:

1. Each sub-area is a modifier + location noun (e.g. 静かな公園 "Quiet Park")
2. Modifier comes from `descriptors.json`, filtered by stage
3. Location noun reuses the area's base word or related locations from `locations.json`
4. Each sub-area gets a background description (200 words, for image generation)
5. Background style matches area's visual theme

#### Updated Output Schema

```json
{
  "id": "okunomori",
  "name": "奥の森",
  "nameEn": "Deep Forest",
  "reading": "おくのもり",
  "baseMeaning": "deep forest",
  "rank": 1400,
  "stage": 8,
  "creatures": ["hebiveil", "ookamiru", "..."],
  "description": "A vast primordial forest...",
  "subAreas": [
    {
      "id": "shizukana-izumi",
      "name": "静かな泉",
      "nameEn": "Quiet Spring",
      "reading": "しずかないずみ",
      "backgroundDescription": "A glassy pool fed by..."
    }
  ]
}
```

### Phases (updated)

1. **Word selection** — discovery from category files or direct input, JPDB lookup
2. **Stage assignment** — via `suggestStage()` or explicit
3. **Creature matching** — filter creatures by stage + habitat affinity + element
4. **Sub-area generation** — 6 named sub-areas with backgrounds (NEW)
5. **Visual description** — 200-400 words for the area overall
6. **User review** — present area + sub-areas for approval
7. **Save** — append to `data/new-areas-staging.json`

---

## 5. NPC Forge — Moderate Update

### Changes

#### Stage-Aware Discovery
- Pull from `occupations.json` (526 words) + `social.json` filtered to person-nouns
- Filter by target stage (inherited from assigned area)
- Cross-ref existing NPCs to avoid duplicate occupations

#### Replace Tier System with Stages
- Old: T1-T4 (residential/commercial/urban/corporate area types)
- New: NPC inherits stage from their area. Word difficulty of NPC's base word + name should match the area's stage.

#### Character Card Review
- Verify possessed/glitching/liberated state model against current game code
- If the game now uses a simpler bond-based interaction model (3-round dialogue, bond score +1/-1/0), update character cards to match
- Add bond progression hints: what changes at bond levels 3, 5, 10

#### Updated Character Card Fields

```json
{
  "personality": {
    "traits": ["curious", "anxious"],
    "speechStyle": "formal but hesitant",
    "quirk": "trails off mid-sentence"
  },
  "card": {
    "description": "...",
    "personality": "...",
    "goals": {
      "default": "...",
      "highBond": "..."
    },
    "bondHints": {
      "3": "Shares personal story",
      "5": "Offers a unique item",
      "10": "Teaches a rare word"
    },
    "knowledge": [{ "keys": ["..."], "content": "..." }],
    "exampleDialogue": ["...", "...", "..."]
  }
}
```

### Phases (updated)

1. **Area selection** — pick area, inherit stage
2. **Concept & naming** — discovery from `occupations.json`, JPDB verify, filtered by stage
3. **Character cards** — personality, goals (updated: bond-based not state-based), example dialogue
4. **User review** — present 5 NPCs for approval
5. **Save** — append to staging files

---

## 6. Sprite Quality Pipeline — Minimal Changes

### No Structural Changes
The three-gate system (technical validation, AI vision judge, human selection dashboard) is current and working.

### Verify Move Icons
If moves get unique action icons in the future, ensure the pipeline supports a `move` sprite type at 128x128 (currently uses the existing `action` type which is the same size).

### No Other Changes Needed

---

## Summary of Work

| Forge | Severity | Key Changes |
|---|---|---|
| **Creature** | Major | Delete combat-vocab, add learnset-builder. Stage-aware discovery. Add baseMp/stage/learnset to output. |
| **Move** | New skill | Entirely new. Verb-to-move pipeline with element/category/tier assignment. |
| **Item** | Major | Unify consumable + equipment + crafting. Stage-aware discovery. Type-specific effects/stats. |
| **Area** | Moderate | Stage-aware discovery. Add sub-area generation phase. Stage field. |
| **NPC** | Moderate | Stage-aware discovery. Replace tier with stage. Update character cards for bond system. |
| **Sprite** | Minimal | Verify move icon support. No structural changes. |
| **All** | Cross-cutting | Stage-aware discovery using category files + WK vocab + suggestStage(). |
