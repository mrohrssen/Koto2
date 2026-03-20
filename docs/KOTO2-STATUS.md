# Koto2 MVP — Current Status

**Date:** 2026-03-20
**Repo:** https://github.com/mrohrssen/Koto2 (local: `/root/Koto2`)
**Original Koto:** frozen at `/root/Koto`

## What's Been Done

All gameplay systems are wired up and ready. 853 unit tests + 10 integration tests pass.

### Commits (oldest → newest)

1. `07a825b` — Archive all original content to `archive/`
2. `b2d9ec0` — 30-room generation with `npcBattle` and `friendlyNpc` room types
3. `c25eae4` — `friendlyNpc` and `npc_skill_selection` phases in phase machine
4. `6098ef4` — Disable post-combat shop and random NPC overlay
5. `c12ad06` — Auto-select area when only one available
6. `3e54689` — Hiragana-to-romaji converter (`public/js/ui/romaji.js`)
7. `be72db2` — Bootstrap slot swap (hiragana+romaji instead of kanji+hiragana)
8. `eec74a2` — Text sprite placeholders (kanji text tinted by element color)
9. `f03d57b` — Prologue: removed hiragana mode, added fire/water/wood starter pick
10. `5211a20` — Friendly NPC rooms (backend + frontend, food/weapon items)
11. `a3a7ac9` — NPC battle rooms (3 enemies, 1.1x level, skill reward after dialogue)
12. `271d088` — Befriend name quiz (10% on kill → まって!! → Fight/Talk → name quiz)
13. `9b9e2cd` — Disable kana combat mode and old befriend UI
14. `0214ee4` — Fix all tests for new Koto2 behavior

### System Changes Summary

| System | Change |
|--------|--------|
| **Room generation** | Fixed 30 rooms: ~12 encounters, ~13 friendly NPCs, 4 NPC battles (rooms 6/12/18/24), 1 boss (room 30) |
| **Friendly NPC rooms** | Offer 3 items from one category (food or weapon). Player picks 1. Reuses shop UI. |
| **NPC battle rooms** | 3 enemies at 1.1x level, guaranteed NPC interference. Reward = pick 1 of 3 party skills. |
| **Befriend** | Old ≤50% HP mechanic disabled. New: 50% chance on killing blow → "まって!!" → Fight/Talk → English name quiz (3 options). |
| **Display** | Bootstrap: kanji slot → hiragana, hiragana slot → romaji. Sprites → text placeholders (kanji tinted by element). |
| **Prologue** | Hiragana question removed. Starter creature pick added (ひ fire / みず water / き wood) at level 5. |
| **Disabled** | Kana combat, old befriend, post-combat shop, random NPC overlay, shrine/dealer/quiz/whack-a-mole/speed review/word discovery rooms (code intact, just excluded from generation) |
| **Unchanged** | Combat engine, moves, leveling, meta-progression, party skills, item buffs, JPDB, auth, server |

### Key Files Changed

- `src/game/rooms.js` — New `ROOM_TYPES` (npcBattle, friendlyNpc), new `generateAreaRooms()` producing 30 rooms
- `src/game/phase-machine.js` — New phases: `friendlyNpc`, `npc_skill_selection`
- `src/game/loop.js` — Disabled shop/NPC overlay, added npcBattle encounter logic, befriend quiz methods, starter creature handling
- `src/game/services/creature-combat-service.js` — 10% befriend trigger, name quiz generation, old befriend disabled
- `src/game/services/exploration-service.js` — `rollFriendlyNpcOffers()`, updated `enterArea()` for fixed 30 rooms
- `src/routes/game/run.js` — Routes for friendly-npc-offers/choose, npc-battle-skill-offers/choose
- `src/routes/game/combat.js` — Routes for befriend-quiz, befriend-quiz-answer
- `src/routes/game/misc.js` — Route for select-starter
- `public/js/ui/romaji.js` — New: `toRomaji()` hiragana→romaji converter
- `public/js/ui/bootstrap-client.js` — Slot swap (hiragana+romaji)
- `public/js/ui/sprite-utils.js` — `createTextSprite()`, `replaceWithTextSprite()`
- `public/js/ui/exploration.js` — `renderFriendlyNpc()`, `renderNpcBattleSkillSelection()`
- `public/js/ui/combat-loop.js` — `renderBefriendQuiz()`, disabled kana combat + old befriend button
- `public/game.js` — Phase routing for friendlyNpc, npc_skill_selection; prologue starter handling
- `public/game.css` — Text sprite styles, befriend quiz styles
- `data/prologue.json` — Removed hiragana scenes, added starter selection scene

## What's Left: Content Wiring (Task 9.2)

### What You Need to Provide

CSV templates are at `tmp/content-templates/` (also on GitHub). Fill out these 5 files:

1. **`creatures.csv`** — 3 starters (fire/water/wood, mark `isStarter=yes`) + area enemies. Starters need at least 1 move by level 5.
2. **`moves.csv`** — All combat moves referenced in creature learnsets.
3. **`items.csv`** — At least 3 food (heal) + 3 weapon (boost) items for friendly NPC rooms.
4. **`npcs.csv`** — At least 4 NPCs for NPC battle rooms.
5. **`area.csv`** — The single area definition (1 row).

### What the Next Session Needs to Do

1. **Parse your CSVs** into JSON and write to `data/creatures.json`, `data/moves.json`, `data/items.json`, `data/npcs.json`, `data/areas.json`

2. **Update starter creature ID mapping** in `src/routes/game/misc.js`:
   ```js
   const starterMap = {
     'starter-fire': 'YOUR-FIRE-CREATURE-ID',
     'starter-water': 'YOUR-WATER-CREATURE-ID',
     'starter-wood': 'YOUR-WOOD-CREATURE-ID'
   };
   ```

3. **Update area ID** in `src/game/rooms.js` `getAreaSelectionOptions()` (currently hardcoded to `mahouno-gakkou` — change to your area's ID)

4. **Verify end-to-end**: start server, go through prologue, pick starter, explore rooms, fight creatures, test friendly NPC item pick, test NPC battle + skill reward, test befriend quiz

5. **Run tests**: `npm run test:unit` to make sure nothing broke

6. **Push to GitHub**

### Important Notes for Next Session

- Work in `/root/Koto2` (NOT `/root/Koto`)
- The test fixture data in `data/` was restored from archive during test fixing — it contains 8 creatures, 44 moves, etc. from the original game. Your new content should **replace** this, not append to it.
- `data/items.json` already has 8 placeholder items (4 food, 4 weapon) added during friendly NPC implementation. Replace with your real items.
- Spec: `docs/superpowers/specs/2026-03-19-koto2-mvp-rework-design.md`
- Plan: `docs/superpowers/plans/2026-03-19-koto2-mvp-rework.md`
