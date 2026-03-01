# Ghost Systems Audit

**Date:** 2026-03-01
**Method:** 7 parallel AI agents audited every file in the codebase against the [Game Design Document](GAME_DESIGN_DOCUMENT.md).
**Purpose:** Identify code that implements features no longer described in the GDD — remnants of past iterations that should be cleaned up.

> **No code changes have been made.** This document is a read-only report for human review before any refactoring begins.

---

## Table of Contents

1. [Old Enemy System (Possessed Citizens)](#1-old-enemy-system-possessed-citizens) — CRITICAL
2. [Old Player-vs-Enemy Combat](#2-old-player-vs-enemy-combat) — CRITICAL
3. [Flashcard Swipe Combat UI](#3-flashcard-swipe-combat-ui) — HIGH
4. [Player HP / Player-as-Combatant](#4-player-hp--player-as-combatant) — HIGH
5. [Boss System](#5-boss-system) — HIGH
6. [Ward/Floor Dungeon System](#6-wardfloor-dungeon-system) — HIGH
7. [iRO Stat System](#7-iro-stat-system) — MEDIUM
8. [Essence Currency + Meta Upgrades](#8-essence-currency--meta-upgrades) — MEDIUM
9. [Chippy NPC + Door Hints](#9-chippy-npc--door-hints) — MEDIUM
10. [Chip System Naming](#10-chip-system-naming) — MEDIUM
11. [Blacksmith / Equipment](#11-blacksmith--equipment) — MEDIUM
12. [Old DM Narration Prompts](#12-old-dm-narration-prompts) — MEDIUM
13. [Liberation Tracker](#13-liberation-tracker) — LOW
14. [Cyberpunk / Dark Theme Remnants](#14-cyberpunk--dark-theme-remnants) — LOW
15. [Bunpro Grammar Integration](#15-bunpro-grammar-integration) — LOW
16. [Miscellaneous Ghosts](#16-miscellaneous-ghosts) — LOW
17. [Files That Are Entirely Ghost](#17-files-that-are-entirely-ghost)

---

## 1. Old Enemy System (Possessed Citizens)

**Severity:** CRITICAL
**What the GDD says:** All combat is creature-vs-creature. Rival trainers command creature teams. There are no standalone "enemies."
**What the code has:** A complete parallel enemy system with 20+ enemy templates (Sleepy Student, Noisy Neighbor, Drunk Salaryman, etc.), organized by tier, with a Slay-the-Spire-style intent system, 10 unique abilities, personality-driven dialogue, and floor/ward-based spawning.

### Files involved

| File | What it contains |
|---|---|
| `data/enemies.json` | 20+ enemy template definitions with tier, personality, locations, drops, possessed/glitching/liberated dialogue |
| `data/enemy-mappings.json` | Floor-to-ward mappings and location types |
| `src/game/enemies.js` (1,222 lines) | `INTENT_TYPES` (lines 48-93), `ENEMY_INTENTS` with per-enemy weighted probability tables (lines 95-618), `ENEMY_ABILITIES` — split, summon, barrier, vanish, revive, berserk, counter, resistance, breath (lines 622-728), `generateEnemy()`, `buildEnemy()`, `getEnemiesForFloor()`, `getEnemyDisplayStats()`, `transformEnemy()` |
| `src/game/combat/enemy.js` | Full enemy turn execution with intent-based switch (attack/heavy/defend/special/rage), ability triggers, barrier/vanish mechanics |
| `public/js/tts.js` lines 49-82 | 30+ enemy personality-to-voice mappings (aggressive, cold, robotic, nervous, belligerent, etc.) |
| `public/js/ui/scene.js` | Enemy sprite loading from `/assets/sprites/enemies/`, personality-based emoji map |
| `public/js/ui/combat-loop.js` | Enemy dialogue system (glitching/liberated speech), waits for dialogue dismissal |
| `src/routes/dev.js` lines 162-172 | Enemy sprites in dev dashboard |

### Why it's a ghost

The GDD replaced standalone enemies with wild creatures and rival trainers. The old system modeled "SYSTEM-possessed Tokyo citizens" — a lore concept from the abandoned NEO TOKYO setting. Every piece of enemy infrastructure (templates, intents, abilities, dialogue, ward-based spawning) serves a game that no longer exists.

### Dependencies to check before removing

- The old `CombatService` (Ghost #2) depends entirely on this enemy system
- DM prompts reference enemy encounters (Ghost #12)
- Run stats track `enemiesDefeated`, `bossesDefeated` (Ghost #16)
- Liberation tracker (Ghost #13) indexes by enemy ID

---

## 2. Old Player-vs-Enemy Combat

**Severity:** CRITICAL
**What the GDD says:** Players command creature parties. Creatures select moves from a 2x2 grid, pick targets, and see attack outcome cards. The player never attacks directly.
**What the code has:** A complete parallel combat system where the player directly attacks/defends against a single enemy, with turn order, damage calculations, loot drops, and XP rewards.

### Files involved

| File | What it contains |
|---|---|
| `src/game/services/combat-service.js` (entire file) | `CombatService` class: `startEncounter()` generates enemy + turn order, `executeCombatCycle()` processes player attack/defend turns with dodge/crit/miss result fields, `handleVictory()` awards XP/loot/essence, `handleDefeat()` awards partial essence, `handleGameVictory()` |
| `src/game/combat/player-actions.js` (entire file) | `executePlayerAttack()` — player entity directly attacks enemy, tracks `anyCritical`, `anyDodge`, `anyPerfectDodge` |
| `src/game/combat/enemy.js` | `executeEnemyTurn()` — enemy attacks player, checks `player.statuses` for `defending`, applies damage to `player.hp` |
| `src/game/combat/mechanics.js` | `getPlayerCombatStats()`, `getEnemyCombatStats()` with zeroed iRO stubs, `resolvePhysicalAttack()`, `resolveMagicAttack()` |
| `src/game/combat/rewards.js` | `processBossVictory()` with boss drops |
| `src/game/combat.js` | Barrel re-export of all old combat functions |
| `src/game/loop.js` lines 594-623 | GameManager delegates to old `CombatService` via `startEncounter()`, `combatCycle()` |
| `src/game/services/index.js` line 6 | Old `CombatService` is exported; creature combat service is NOT |
| `src/routes/game/combat.js` lines 31-85 | `combat-cycle`, `start-encounter`, `combat-end-narration` routes |
| `src/routes/game/misc.js` lines 97-145 | `debug-force-combat` route |
| `public/js/api.js` line 335 | `startEncounter()` API call |
| `server.js` lines 324-350 | `enrichRewardDrops()` with equipment type/rarity |

### Why it's a ghost

The creature combat service (`creature-combat-service.js`) is the GDD-correct implementation. The old `CombatService` models a fundamentally different game: player has HP, player attacks, binary attack/defend choices, enemies drop loot. These two combat systems coexist in the codebase — the old one is still wired into the GameManager and exported from the services index.

### Dependencies to check before removing

- `combat-loop.js` in the frontend has branches that dispatch to both old and new combat
- Flash card UI (Ghost #3) feeds into the old combat flow
- Player HP bar (Ghost #4) displays old combat health
- The old combat barrel export (`src/game/combat.js`) may be imported elsewhere

---

## 3. Flashcard Swipe Combat UI

**Severity:** HIGH
**What the GDD says:** Combat uses a 2x2 move grid per creature. Moves are Japanese verbs displayed with furigana and action icons.
**What the code has:** Swipeable flash cards where swiping right = "knew it" (attack) and swiping left = "didn't know" (defend). A full word practice module with typing review, self-grading, and card damage mechanics.

### Files involved

| File | What it contains |
|---|---|
| `public/js/ui/actions.js` lines 136-261 | `showFlashCards()` — renders 1-3 swipeable cards, full touch/mouse gesture detection with 80px threshold, swipe animations, grade callbacks. Dual/triple mode with sword/shield/heart SVG icons |
| `public/js/word-practice.js` (~750 lines, entire file) | `initCombatWords()`, `getTwoCombatWords()`, `renderWordCards()`, `openWordInputModal()`, `openSelfGradeModal()`, `checkWordAnswer()` with Levenshtein distance, `damagePlayerForRefresh()`, `submitSelfGradeReview()`, `prefetchCombatWords()` |
| `public/js/ui/combat-loop.js` | `showNextDualCardsFromQueue()` (line 466), `showNextFlashCardFromQueue()` (line 501), `pauseForNextVocab()` (line 455), `pendingActionType` tracking, legacy branch in `resumeCombatAfterVocab()` (lines 1617-1623) |
| `public/js/ui/i18n.js` line 94 | `"<- didn't know \| knew it ->"` hint text |
| `public/game.css` lines 685-778 | `.flash-card-container`, `.flash-card`, swipe animations |
| `public/game.css` lines 780-931 | `.dual-flash-card-container`, `.dual-flash-card.attack/.defend/.befriend` |
| `public/game.css` lines 922-931 | `.combat-defend-indicator` |

### Why it's a ghost

The flashcard swipe mechanic was the original combat input: see a word, swipe right if you know it (attack), swipe left if you don't (defend). The GDD replaced this with creature moves — the player selects named moves (verbs) from a 2x2 grid, which are displayed with their Japanese readings and action icons. The vocabulary reinforcement now comes from reading move names and attack outcome cards, not from flashcard grading.

### Note

`word-practice.js` is still actively called from `combat-loop.js` at lines 2101-2121 (`stopCombatLoop` calls `hideWordCards()`, `closeWordInputModal()`, `getReviewedWordsThisCombat()`, `prefetchCombatWords()`). These call sites need cleanup.

The word discovery room (`renderWordDiscovery()` in `exploration.js` line 1131) also uses `showFlashCards()` in discovery mode. If the flash card system is removed, word discovery needs a replacement UI.

---

## 4. Player HP / Player-as-Combatant

**Severity:** HIGH
**What the GDD says:** Only creatures have HP and attack stats. The player commands creatures but does not participate in combat directly. Two stats only: attack and maxHp (on creatures).
**What the code has:** The player entity has `hp`, `maxHp`, `attack`, `class: 'hacker'`, and a visible HP bar with animated fills and critical-state pulsing.

### Files involved

| File | What it contains |
|---|---|
| `public/js/ui/hp-bar.js` (entire file) | `updatePlayerHPBar()`, `updateHpCriticalState()` with color transitions |
| `public/js/ui/character.js` | `updatePlayerHPBar()` wrapper |
| `public/js/ui/combat-loop.js` lines 1546-1692 | Player HP updates during old combat flow |
| `public/js/dom.js` | `player-hp-fill` element reference |
| `public/game.css` lines 557-590 | `.player-hp-container`, `.player-hp-bar`, `.player-hp-fill`, `.player-hp-text` |
| `src/routes/game/misc.js` lines 281-293 | `/api/game/heal` endpoint — heals `player.hp` |
| `src/routes/game/player.js` line 12 | `create-player` accepts `stats` and `statPoints` (6-stat allocation) |
| `public/js/api.js` `createPlayer()` | Sends `{str, agi, vit, int, dex, luk}` stat object |
| `server.js` lines 301-311 | `enrichPlayerItems()` computes `derivedStats.atk` |
| `src/game/state.js` line 255 | `class: 'hacker'` in `createNewPlayer()` |

### Why it's a ghost

In the creature combat system, the player is a commander — creatures take hits, not the player. The player HP bar, player heal endpoint, and player attack stat are leftovers from when the player directly fought enemies. The `hacker` class is from the abandoned NEO TOKYO cyberpunk setting.

---

## 5. Boss System

**Severity:** HIGH
**What the GDD says:** No boss system is described. Strong opponents should be rival trainers commanding creature teams, or particularly powerful wild creatures. The antagonist and story structure are explicitly marked TBD.
**What the code has:** 7 floor-specific bosses (fantasy RPG names like `boss_goblin_king`, `boss_dragon_elder`, `boss_shadow_monarch`) reskinned as NEO TOKYO characters (Anime Director, Host Club King, AI Emperor), with multi-phase AI, unique drops, and dedicated BGM.

### Files involved

| File | What it contains |
|---|---|
| `data/bosses.json` | 7 floor bosses + final boss definitions with stats, drops (directorsBadge, hostCrown, systemCore, etc.) |
| `src/game/enemies.js` lines 730-826 | `BOSS_INTENTS` — multi-phase patterns with HP threshold transitions |
| `src/game/enemies.js` | `getBossForFloor()`, `getBossDrop()`, `FLOOR_BOSSES`, `FINAL_BOSS`, `BOSS_DROPS` |
| `src/game/combat/rewards.js` lines 36-45 | `processBossVictory()` with boss-specific equipment drops |
| `src/game/dm.js` lines 607-623 | `bossAppear` / `finalBossAppear` narration prompts |
| `server.js` lines 438-447 | `bossStart` event handling in narration normalization |
| `public/js/audio.js` | `boss` phase BGM mapping |
| `src/routes/dev.js` lines 177-189 | Boss sprites in dev dashboard keyed by floor number |

### Why it's a ghost

The GDD has no boss encounters as a separate system. The floor-keyed bosses serve the old 7-floor dungeon structure. Boss IDs still use fantasy RPG names (`boss_lich`, `boss_demon_lord`) despite the NEO TOKYO reskinning. The boss drops are equipment items, but the GDD says equipment is unimplemented.

---

## 6. Ward/Floor Dungeon System

**Severity:** HIGH
**What the GDD says:** The game uses an area-based exploration model. Areas are `modifier + location noun` (e.g., 深い森 = Deep Forest). Each area has 5-8 sub-areas. Runs consist of 10 areas. Area selection is SRS-driven based on vocabulary needs.
**What the code has:** A 7-floor dungeon where each floor maps to a Tokyo ward (nerima→nakano→shinjuku→ikebukuro→minato→chiyoda→palace), with floor-specific enemy filtering, a full floor-based lorebook, and named levels.

### Files involved

| File | What it contains |
|---|---|
| `data/enemy-mappings.json` | `floorToWard` (floors 1-7 → wards) and `wardLocations` |
| `data/levels.json` | 10 named levels: Awakening, Signal, Underground, Frequency, Disruption, Convergence, Infiltration, Resonance, Override, Liberation |
| `src/game/enemies.js` | `FLOOR_TO_WARD`, `WARD_LOCATIONS`, `getEnemiesForFloor(floor)` with tier escalation |
| `src/game/lorebook.js` (340 lines, entire file) | `FLOOR_LORE` — 7 floors with fantasy dungeon themes (入口の洞窟, 古い遺跡, 骨の廊下, 炎の道, 闇の森, 竜の巣, 影の玉座), `PERSONALITY_VOICES` for 16 enemy types, `ROOM_LORE` for trap/treasure/body/merchant rooms |
| `src/game/dm.js` | Floor references: `階：${floor}/7` (line 315), `第${floor}階に入った` (line 378), `第${floor}階クリア！` (lines 600-604), hardcoded floor 1-7 narrations with fantasy themes (line 889-900) |
| `src/game/services/door-hint-service.js` | References `wardName` and `floor` context |
| `src/game-stats.js` | `floorsCleared` stat and `floor_cleared` event |
| `public/js/dom.js` | `floorIndicator` DOM element |
| `public/js/ui/i18n.js` line 69 | `"Floor {0} . {1} rooms cleared"` |
| `public/js/audio.js` line 61 | `ward_selection` BGM phase |
| `public/game.css` lines 141-155 | `.status-bar`, `.status-floor`, `.status-essence` (hidden) |
| `public/game.css` lines 1453-1499 | `.ward-options`, `.ward-option`, `.ward-option-name`, `.ward-option-desc` |
| `public/game.css` lines 1510-1604 | `.level-select-header`, `.level-select-list`, `.level-card`, lock/complete/new states |
| `server.js` lines 20-28 | Stale endpoint docs: `enter-floor`, `next-floor`, `starting-wards`, `select-starting-ward`, `next-ward-options`, `start-boss`, `shop`, `refine`, `open-treasure` |

### Why it's a ghost

The area/sub-area system has replaced the floor/ward system. The GDD's areas are vocabulary-driven (Japanese location words), not real-world Tokyo geography. The 10-area run structure replaced the 7-floor dungeon. The lorebook's fantasy dungeon themes (bones, lava, dragon's lair) contradict the GDD's "bright, hopeful, adventurous" tone.

### Note

`rooms.js` is mostly aligned with the GDD — it correctly implements areas with sub-areas and the right room types. The function name `generateFloorRooms` still says "floor" but the implementation is area-based. This is a minor rename, not a structural ghost.

---

## 7. iRO Stat System

**Severity:** MEDIUM
**What the GDD says:** Two stats only: attack and maxHp. No defense, no hit chance, no crits, no misses. Damage = `attack × move_power × element_multiplier × variance(0.85-1.15)`.
**What the code has:** Zeroed-out stubs for def, matk, mdef, hit, flee, crit, critShield, perfectDodge, armorPen, plus a separate magic attack function. Critical/dodge/miss tracking propagated end-to-end from mechanics through to UI result objects.

### Files involved

| File | What it contains |
|---|---|
| `src/game/combat/mechanics.js` lines 18-57 | `getPlayerCombatStats()` / `getEnemyCombatStats()` returning zeroed def/matk/mdef/hit/flee/crit/critShield/perfectDodge/sp/maxSp. Comment: "See combat/mechanics.full.js for the original iRO-style system" |
| `src/game/combat/mechanics.js` lines 87-99 | `resolveMagicAttack()` — physical vs. magic damage split |
| `src/game/combat/mechanics.js` line 66 | `armorPen` parameter (unused) |
| `src/game/combat/mechanics.js` lines 71-80 | `resolvePhysicalAttack()` always returns `hit: true, miss: false, dodge: false, perfectDodge: false, critical: false` |
| `src/game/combat/player-actions.js` lines 32-53 | Tracks and propagates `anyCritical`, `anyDodge`, `anyPerfectDodge` |
| `src/game/combat/enemy.js` lines 36-93 | Tracks and propagates `hit`, `miss`, `dodge`, `perfectDodge`, `critical`, `hitChance`, `critChance` |
| `src/game/services/combat-service.js` lines 125-203 | Reads `critical`, `miss`, `dodged`, `perfectDodge` from results, tracks `runStats.dodges` |
| `src/game/enemies.js` `getEnemyDisplayStats()` | Returns full stat block: str/agi/vit/int/dex/luk/def/matk/mdef/hit/flee/crit/sp/maxSp/level |
| `public/game.css` | `.damage-number.crit`, `.math-crit`, `.combat-enemy-crit`, `.combat-enemy-damage.dodge`, `.combat-enemy-damage.miss` |

### Why it's a ghost

The CLAUDE.md explicitly says "Don't reference iRO stats." The GDD specifies only attack and maxHp with no hit/miss/crit mechanics. All these stat stubs always evaluate to zero — they're dead infrastructure that adds complexity without function. The creature combat service (`creature-combat-service.js`) correctly uses only attack/maxHp.

---

## 8. Essence Currency + Meta Upgrades

**Severity:** MEDIUM
**What the GDD says:** Meta-progression consists of creature collection (persistent) and gold/currency for town building. Town building is marked as 📋 planned but not implemented.
**What the code has:** A "Shadow Essence" currency earned from runs, spent on permanent player stat upgrades: vitality (+10% MaxHP), startingCredits (+25), attackPower (+2 ATK), creditFind (+10% credits). These buff the player character, not creatures.

### Files involved

| File | What it contains |
|---|---|
| `src/game/state.js` lines 45, 99-249 | `essence: 0` in meta state, `META_UPGRADES` (4 upgrade paths), `ACHIEVEMENTS` (essence rewards referencing enemies/bosses), `calculateEssenceReward()`, `getMetaUpgradeEffects()` |
| `src/game/loop.js` lines 148-298 | `purchaseUpgrade()` flow, `applyMetaBonuses()` — buffs player HP/ATK |
| `src/routes/game/economy.js` lines 25-42 | `GET /api/game/upgrades`, `POST /api/game/purchase-upgrade` |
| `public/js/api.js` | `getMetaProgression()`, `purchaseUpgrade()` |
| `public/js/dom.js` | `essenceDisplay` element |
| `public/game.css` | `.status-essence` |

### Why it's a ghost

The GDD's meta-progression is creature collection + town building (using gold). There's no second currency, no player stat upgrades, and no upgrade shop. The achievements reference old-system concepts ("Boss Slayer", "Thousand Kills"). Player stat upgrades contradict the GDD's design where only creatures have combat stats.

---

## 9. Chippy NPC + Door Hints

**Severity:** MEDIUM
**What the GDD says:** Branch selection is a simple left/right path choice. The player's companion is the Translator device (Section 3b), and Cid is the first NPC they meet. No other companion characters are described.
**What the code has:** A companion NPC named "Chippy" (チッピー, a "digital spirit companion") who appears at branch selection points and narrates AI-generated atmospheric hints about what lies behind each door, spoken with TTS.

### Files involved

| File | What it contains |
|---|---|
| `src/game/services/door-hint-service.js` (entire file) | `generateDoorHints()`, `pickSeed()`, `buildRemixPrompt()` with Chippy character prompt, references `wardName` and `floor` |
| `data/door-hints.json` | 100+ seed phrases categorized by mood (dread, curiosity, warning) — dark/horror tone |
| `src/routes/game/run.js` lines 237-260 | `door-hints` API route |
| `public/js/ui/scene.js` lines 279-302 | `showChippy()`, `hideChippy()` |
| `public/js/ui/exploration.js` lines 52-73 | `DOOR_INTROS` array (20 transition phrase pairs) |
| `public/js/ui/exploration.js` `renderBranchSelection()` | Calls `apiDoorHints()` and `showChippy()` |
| `public/js/api.js` line 273 | `doorHints()` API call |

### Why it's a ghost

Chippy is not in the GDD. The GDD's companion device is the Translator (Section 3b). The door hint seed phrases use dread/horror moods that contradict the GDD's "bright, hopeful" tone. The service references `wardName` and `floor` from the old dungeon system.

### Note

The branch selection UX itself (choosing between left/right paths) is in the GDD. Only the Chippy NPC and AI-generated door hints are ghosts. If removed, branch selection just becomes a simpler choice without narrative hints.

---

## 10. Chip System Naming

**Severity:** MEDIUM
**What the GDD says:** The game has "creatures" (Section 8). No chip system exists.
**What the code has:** Pervasive "chip" terminology throughout the codebase — DOM element IDs, CSS classes, i18n strings, SFX names, and comments. This is a naming vestige from an earlier iteration where creatures were called "chips."

### Files involved

| File | What it contains |
|---|---|
| `public/js/dom.js` | `chipRow` (line 37), `chipPopup` (line 66) |
| `public/game.css` | `.chip-row` (lines 544-555), `.chip-popup` (lines 1437-1451) |
| `public/js/ui/i18n.js` | `equippedChips`, `noChips`, `charging {0}/{1}`, `passive`, `skillColon`, `noSkill`, `ready` |
| `public/js/audio.js` | `chip-equip`, `chip-skill` SFX |
| `src/game/loop.js` line 367 | `startingChipShop: null` |
| `src/game/services/exploration-service.js` lines 252, 315 | "Track room clears for counter chips" comments |
| `public/js/ui/exploration.js` line 409 | `startingChipShop` guard |

### Why it's a ghost

"Chip" was the old name for creatures. The i18n strings also reference a charge-to-activate skill system (`"Charging {0}/{1}"`) that doesn't exist in the GDD — creatures have named moves with MP costs, not charge counters. This is mostly a rename task but the charge mechanic strings suggest a deeper design change happened.

---

## 11. Blacksmith / Equipment

**Severity:** MEDIUM
**What the GDD says:** Equipment is marked 📋 (designed but NOT implemented). Crafting is marked 📋. Players use creatures and consumable items only.
**What the code has:** A blacksmith room type with equipment refinement, equipment slot system, and creature equip UI.

### Files involved

| File | What it contains |
|---|---|
| `src/game/phase-machine.js` | `BLACKSMITH` phase constant (line 42), valid transitions (lines 54-134) |
| `src/game/dm.js` lines 652-666 | `refineSuccess` / `refineFail` narration prompts |
| `src/game/dm.js` line 684 | Blacksmith room discovery narration |
| `src/routes/game/misc.js` lines 55-95 | `debug-force-blacksmith` route |
| `server.js` lines 324-350 | `enrichRewardDrops()` with `type: 'equipment'`, `rarity: 'epic'`, `slot: null` |
| `public/game.css` lines 3059-3117 | `.creature-equip-list`, `.creature-equip-slot`, etc. (dark theme: `#1a1a2e`) |
| `public/js/dom.js` lines 56-58 | `creatureEquipView`, `creatureEquipClose`, `creatureEquipContent` |
| `public/js/api.js` | `swapCreatureEquip()` |

### Why it's a ghost

Equipment and crafting are explicitly planned-but-not-implemented in the GDD. The existing equipment code uses the old dark theme aesthetic (`#1a1a2e` backgrounds) that doesn't match the current bright gacha style. When equipment is eventually implemented, it should be built fresh following the GDD spec, not resurrected from this code.

---

## 12. Old DM Narration Prompts

**Severity:** MEDIUM
**What the GDD says:** Narration covers room descriptions, NPC dialogue, combat outcomes, and area introductions. Room types are: encounter, shrine, quiz, word discovery, dealer, whack-a-mole.
**What the code has:** DM prompts for many non-GDD features: player magic/spells, player SP/MP, player rank/level, flee mechanic, traps, body looting, treasure traps, blacksmith refinement, and "Dungeon conquered!" victory text.

### Files involved (all in `src/game/dm.js`)

| Lines | What it contains |
|---|---|
| 315 | Player rank/level: `${player?.rank \|\| 'E'}ランク、Lv.${player?.level \|\| 1}` |
| 316 | Player SP/MP: `SP：${player?.sp ?? player?.mp ?? 0}/${player?.maxSp ?? player?.maxMp ?? 50}` |
| 444-458 | `playerMagic` — player-cast spells with damage/healing and critical hits |
| 461-471 | `playerItem` — player HP/SP restoration |
| 592-597 | `fleeSuccess` / `fleeFail` |
| 607-623 | `bossAppear` / `finalBossAppear` |
| 652-666 | `refineSuccess` / `refineFail` |
| 676-687 | Room type hints for: empty, trap, body, treasure, merchant, blacksmith, boss |
| 693-708 | `trapDisarmSuccess`, `trapDisarmFail`, `trapAvoidSuccess`, `trapAvoidFail` |
| 709-733 | `lootBody`, `bodyTrapped`, `skipBody`, `treasureTrapped` |
| 628 | `gameVictory`: "ダンジョン制覇！" (Dungeon conquered!) |
| 889-900 | Hardcoded floor 1-7 narrations (bones, lava, dark forest, dragon's lair, shadow throne room) |

### Why it's a ghost

These prompts serve features that don't exist in the GDD: player magic, flee mechanic, trap rooms, body looting, treasure traps, blacksmith, and dungeon framing. They should be replaced with prompts for GDD room types and creature combat outcomes.

---

## 13. Liberation Tracker

**Severity:** LOW
**What the GDD says:** Meta-progression is creature collection + town building. The word "liberation" appears only in art direction as a color theme.
**What the code has:** A system tracking how many times each enemy has been "liberated" (defeated = freed from SYSTEM possession), stored in `meta.lifetimeStats.liberationTracker`.

### Files involved

| File | What it contains |
|---|---|
| `src/game/state.js` line 65 | `liberationTracker: {}` in meta state |
| `src/game/services/combat-service.js` lines 252-266 | Updates tracker on old combat victory |
| `src/game/enemies.js` lines 1148-1221 | `getLiberationTrackerData()` |
| `server.js` line 112 | Dead import: `import { getLiberationTrackerData }` (never used in any route) |

---

## 14. Cyberpunk / Dark Theme Remnants

**Severity:** LOW
**What the GDD says:** "Bright, hopeful, adventurous. NOT: dark, dystopian, cyberpunk, grimdark."
**What the code has:** Cyberpunk-themed status effects, "possessed citizens" lore, SYSTEM AI narrative, and dark-themed CSS.

### Files involved

| File | What it contains |
|---|---|
| `src/game/state.js` lines 340-350 | Status effect tracking: `defrag`, `lag`, `bufferOverflow`, `corrupted`, `exposed`, `glitched`, `overheated`, `debug` |
| `data/enemies.json` | Possessed/glitching/liberated dialogue states |
| `data/bosses.json` | AI Emperor, SYSTEM narrative |
| `data/door-hints.json` | Dread, horror, and warning mood archetypes |
| `src/narration-engine/npc-memory.js` | "Liberated" / "possessed" NPC terminology |
| `src/narration-engine/prompt-assembler.js` | "Possessed" as NPC state |
| `public/game.css` lines 3059-3117 | Dark equipment UI theme (`#1a1a2e`) |

---

## 15. Bunpro Grammar Integration

**Severity:** LOW
**What the GDD says:** JPDB for vocabulary SRS. Quiz rooms test vocabulary recall. No external grammar system mentioned.
**What the code has:** A complete Bunpro API client with circuit breaker, rate limiting, and grammar quiz question fetching.

### Files involved

| File | What it contains |
|---|---|
| `src/bunpro.js` (278 lines, entire file) | Full Bunpro API client: `getQuizQuestion()`, `submitAnswer()` |
| `src/routes/game/run.js` lines 306-398 | Quiz room routes (`quiz-state`, `quiz-answer`) calling Bunpro, falling back to static questions |
| `src/auth/routes.js` lines 126-139 | `hasBunproToken` in `/me` endpoint |

### Note

Bunpro integration could be a deliberate addition not yet documented in the GDD. Worth asking whether this should be kept and documented, or removed.

---

## 16. Miscellaneous Ghosts

### Chat conversation partner mode
- `src/ai-providers.js` lines 71-100 — `buildSystemPrompt()` and `chat()` function for free-form Japanese conversation. Not in GDD.

### Leaderboard system
- `src/auth/users.js` lines 138-170 — `addReview()` increments review count, `getLeaderboard()` returns users sorted by reviews. Not in GDD.

### Extra item types
- `src/game/services/item-service.js` lines 143-158 — `keepsake`, `xpCharm`, `xpBalance` item types not in GDD.
- `src/game/state.js` lines 304-312 — `flatDamageReduction`, `xpBalanceStacks` in item buff tracking.

### Dealer room economy divergence
- `public/js/ui/economy.js` (entire file) + `src/game/services/exploration-service.js` — Buy/sell creatures for credits, `temporary: true` creatures. GDD has dealer rooms but not this transactional model.

### Ghost run/lifetime stats
- `src/game/state.js` lines 318-352 — `enemiesDefeated`, `bossesDefeated`, `trapsDisarmed`, `treasuresOpened`, `critsLanded`, `dodges`.
- `src/game/state.js` lines 51-66 — `totalEnemiesDefeated`, `totalBossesDefeated`, "Successfully cleared all 7 floors" comment.

### Word discovery XP/credit rewards
- `src/game/services/exploration-service.js` `completeWordDiscovery()` — Awards creature XP and credits for word discovery rooms. GDD says these are "flashcard introduction of new words", not XP sources.

---

## 17. Files That Are Entirely Ghost

These files could likely be deleted in their entirety during cleanup:

| File | Lines | What it is |
|---|---|---|
| `data/enemies.json` | — | Enemy template definitions |
| `data/bosses.json` | — | Boss definitions |
| `data/enemy-mappings.json` | — | Floor-to-ward mappings |
| `data/levels.json` | — | Named level definitions |
| `data/door-hints.json` | — | Door hint seed phrases |
| `src/game/enemies.js` | ~1,222 | Enemy system (intents, abilities, generation, display) |
| `src/game/lorebook.js` | ~340 | Floor-based dungeon lorebook |
| `src/game/combat.js` | ~31 | Old combat barrel re-exports |
| `src/game/combat/player-actions.js` | — | Player-attacks-enemy logic |
| `src/game/combat/enemy.js` | — | Enemy turn execution + abilities |
| `src/game/combat/mechanics.js` | — | iRO stat stubs + magic attack |
| `src/game/combat/rewards.js` | — | Boss drops, equipment rewards |
| `src/game/services/combat-service.js` | — | Old player-vs-enemy combat service |
| `src/game/services/door-hint-service.js` | — | Chippy door hints |
| `src/bunpro.js` | ~278 | Bunpro grammar API client |
| `public/js/word-practice.js` | ~750 | Flash card combat word practice |
| `public/js/ui/hp-bar.js` | — | Player HP bar |
| `public/js/ui/economy.js` | — | Dealer buy/sell UI |

**Estimated total: ~4,500+ lines of pure ghost code in deletable files**, plus hundreds more scattered across active files (state.js, loop.js, dm.js, combat-loop.js, game.css, etc.).

---

## What's NOT a Ghost (Confirmed Clean)

These were audited and match the GDD:

- `data/creatures.json` — Clean, uses only baseHp/baseAttack/baseMp
- `data/items.json` — Clean, all Japanese food/drink vocabulary items
- `data/moves.json` — Clean, uses power/mpCost/statusEffect
- `data/lorebook.json` — Updated to match "disruption" narrative
- `src/game/rooms.js` — Correct room types and area/sub-area model
- `src/game/services/creature-combat-service.js` — GDD-correct creature-vs-creature combat
- `src/game/services/creature-collection-service.js` — Clean creature collection
- `src/game/services/npc-service.js` — Clean NPC dialogue + memory
- `src/game/combat/effects.js` — Correct status effects (poison, sleep, stun, etc.)
- `src/game/vocab-manager.js` — SRS-weighted vocab selection
- `src/game/vocab-repair.js` — i+1 enforcement
- `src/game/bootstrap-*.js` — Bootstrap language system
- `src/jpdb.js` — JPDB vocabulary integration
- `src/voicevox.js` — VOICEVOX TTS
- `src/word-tracking.js` — Daily word exposure tracking
