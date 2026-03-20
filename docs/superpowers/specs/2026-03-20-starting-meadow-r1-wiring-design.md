# Starting Meadow R1 Content Wiring — Design Spec

**Date:** 2026-03-20
**Goal:** Wire R1 CSV content into a playable "Starting Meadow" area, making the Koto2 MVP loop testable end-to-end.

## Overview

Transform 4 R1 CSVs (creatures, moves, items, NPCs) into game-ready JSON, wire them as the sole live content, archive old data, and make two small code changes (equipment category rename + item creature targeting UI).

## Data Transformation

### Creatures (5 total)

Source: `tmp/content-templates/creatures r1.csv`

| CSV | ID | jpName | element | isStarter | Learnset |
|-----|----|--------|---------|-----------|----------|
| 火 | hi | 火 | fire | yes | tataku@1, honoo@7, moeru@12 |
| 水 | mizu | 水 | water | yes | tataku@1 |
| 木 | ki | 木 | wood | yes | tataku@1 |
| 石 | ishi | 石 | earth | no | tataku@1 |
| 鉄 | tetsu | 鉄 | metal | no | tataku@1 |

- All stats: 50 HP / 10 ATK / 50 MP (as provided)
- All archetype: Fighter, rarity: common, stage: 1
- No modifier words (not provided in R1)
- Iron (鉄) doubles as boss at room 30 (existing boss level scaling applies)
- Fill in JPDB baseRank from frequency data
- All 5 creatures appear in Starting Meadow encounters

### Moves (3 total)

Source: `tmp/content-templates/moves r1.csv`

| CSV | ID | jpName | element | category | power | target | mpCost |
|-----|----|--------|---------|----------|-------|--------|--------|
| 叩く | tataku | 叩く | neutral | damage | 10 | single_enemy | 5 |
| 炎 | honoo | 炎 | fire | damage | 15 | single_enemy | 12 |
| 燃える | moeru | 燃える | fire | damage | 25 | single_enemy | 20 |

- Map CSV `type: attack` → schema `category: damage`
- Map CSV `target: single` → schema `target: single_enemy`
- Add `meaning` from dictionary definitions
- All tier 1, stage 1

### Items (9 total — 5 food, 4 equipment)

Source: `tmp/content-templates/items r1.csv`

**Food:**

| ID | kanji | reading | nameEn | type | effect |
|----|-------|---------|--------|------|--------|
| ocha | お茶 | おちゃ | Tea | mpRestore | mpRestorePercent: 0.20 (single) |
| toufu | 豆腐 | とうふ | Tofu | boost | field: attack, value: 2 (all) |
| ringo | りんご | りんご | Apple | heal | healPercent: 0.15 (single) |
| tamago | 卵 | たまご | Egg | boost | field: attack, value: 5 (single) |
| ichigo | いちご | いちご | Strawberry | revive | revivePercent: 1.0 (single) |

**Equipment:**

| ID | kanji | reading | nameEn | type | effect |
|----|-------|---------|--------|------|--------|
| katana | 刀 | かたな | Katana | boost | field: attack, value: 10 (single) |
| hon | 本 | ほん | Book | boost | field: hp, value: 10 (single) |
| kutsu | 靴 | くつ | Shoes | boost | field: mp, value: 10 (single) |
| boushi | 帽子 | ぼうし | Hat | boost | field: hp, value: 5 (single) |

- Category "equipment" replaces old "weapon" throughout
- All items get a `category` field: `"food"` or `"equipment"` (used by `rollFriendlyNpcOffers` to filter)
- Fill in missing kanji where standard kanji exists
- Keep kana-only for words without common kanji (りんご, いちご)
- Map CSV effect values to existing schema patterns:
  - `healPercent: 15` → `{ type: "heal", effect: { healPercent: 0.15 } }`
  - `mpRestore: 20` → `{ type: "mpRestore", effect: { mpRestorePercent: 0.20 } }`
  - `Revive: 1` → `{ type: "revive", effect: { revivePercent: 1.0 } }`
  - `attackMult: N` → `{ type: "boost", effect: { field: "attack", value: N } }` (applied to creature's `itemBuffs`)
  - `hpMult: N` → `{ type: "boost", effect: { field: "hp", value: N } }`
  - `mpMult: N` → `{ type: "boost", effect: { field: "mp", value: N } }`
- Verify these effect shapes match `applyItem()` in `exploration-service.js` during implementation; adjust if needed

### NPCs (4 total — one per NPC battle room)

Source: `tmp/content-templates/npcs r1.csv`

| ID | kanji | reading | nameEn | personality | greeting | defeatLine |
|----|-------|---------|--------|-------------|----------|------------|
| kodomo | 子供 | こども | Child | Fun loving | こんにちわ! | いいね! |
| otona | 大人 | おとな | Adult | Mature | こんにちわ! | いいね! |
| otokonoko | 男の子 | おとこのこ | Boy | Energetic | こんにちわ! | いいね! |
| onnanoko | 女の子 | おんなのこ | Girl | Shy | こんにちわ! | いいね! |

- Greetings and defeat lines used as-is (simple Japanese, no tagged formatting)
- Area set to Starting Meadow ID
- All tier 1
- Wire skills to npc-skills.json entries

### NPC Skills (4 skills)

Formatted into existing `data/npc-skills.json` schema:

| ID | jpName | reading | category | target | power | description |
|----|--------|---------|----------|--------|-------|-------------|
| asobu | 遊ぶ | あそぶ | damage | all_enemies | 10 | Attacks all enemies |
| hataraku | 働く | はたらく | damage | all_enemies | 10 | Attacks all enemies |
| hashiru | 走る | はしる | heal | all_allies | 10 | Heals all NPC's creatures 10% |
| utau | 歌う | うたう | heal | all_allies | 10 | Heals all NPC's creatures 10% |

### Area (1 — Starting Meadow)

- ID: `hajimari-no-hiroba` (始まりの広場 — "Starting Plaza/Meadow")
- Single area, no sub-areas
- Creatures: [hi, mizu, ki, ishi, tetsu]
- `bossCreatureId: "tetsu"` (required by `generateAreaRooms` for boss room assignment)
- One placeholder background (reuse existing floor1 asset)
- Stage 1

## Code Changes

### 1. Category rename: "weapon" → "equipment"

Full rename chain:
- `src/game/rooms.js`: `generateAreaRooms()` rolls `offerCategory` as `'food'` or `'weapon'` — change `'weapon'` to `'equipment'`
- `src/game/services/exploration-service.js`: `rollFriendlyNpcOffers()` maps category to item type filter — update mapping from `'weapon'` to `'equipment'`
- Any other code/test references to "weapon" category

### 1b. Fix `rollFriendlyNpcOffers` item filtering

Current logic filters food items by `type === 'heal'` only, but R1 food items include `mpRestore`, `revive`, and `boost` types. Change `rollFriendlyNpcOffers` to filter by the item's `category` field (`food` or `equipment`) instead of by `type`. This ensures all food items are eligible when the NPC offers food, and all equipment items when offering equipment.

### 2. Item creature targeting UI

- **Current flow:** pick 1 of 3 items → applied automatically
- **New flow:** pick 1 of 3 items → creature selector (reuse move targeting UI) → pick creature → apply
- **Frontend:** `public/js/ui/exploration.js` `renderFriendlyNpc()` — after item selection, show creature selector
- **Backend:** `src/routes/game/run.js` friendly-npc-choose route — accept `targetCreatureIndex` param
- **Backend:** `src/game/services/exploration-service.js` — pass selected creature to `applyItem()`

### 3. Starter mapping

- `src/routes/game/misc.js`: update starterMap to `{ 'starter-fire': 'hi', 'starter-water': 'mizu', 'starter-wood': 'ki' }`
- `data/prologue.json`: update creature references to match

### 4. Area ID

- `src/game/rooms.js`: change MVP area lock from `mahouno-gakkou` to `hajimari-no-hiroba`

### 5. Sub-area handling

- Room generation must handle empty/missing `subAreas` array gracefully (skip sub-area assignment, use area's single background)

### 6. Data file management

- Archive old data to `archive/data/` (creatures.json, moves.json, items.json, npcs.json, npc-skills.json, areas.json)
- Live `data/*.json` files contain R1 content only

## Test Impact

- Update test fixtures to use R1 creature/move/item/NPC IDs
- Update category checks from "weapon" to "equipment"
- Add test coverage for `targetCreatureIndex` in friendly-npc-choose
- Test room generation with no sub-areas
- All 853 unit + 10 integration tests must pass

## End-to-End Flow

1. Prologue → pick starter (火/水/木) → level 5 creature with Strike
2. Area selection → auto-selects Starting Meadow
3. Encounter rooms (~12) → fight wild creatures (all know Strike)
4. Friendly NPC rooms (~13) → pick item → select creature target → applied
5. NPC battle rooms (6/12/18/24) → 3 enemies, NPC skill interference → pick 1 of 3 party skills
6. Boss room (30) → fight Iron at boss-scaled level
7. Befriend → 10% on kill → name quiz → add to party

## Known R1 Limitations (Acceptable)

- Most creatures only know Strike
- Only 2 distinct non-starter enemy types
- Minimal NPC dialogue (single-line greetings/defeats)
- Placeholder background
- No sub-area variety
