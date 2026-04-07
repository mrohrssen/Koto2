# School Area — Remaining Work

**Date:** 2026-04-07
**Status:** Approved

## Context

The school area (学校) data has been merged into all game data files (areas, creatures, moves, items, NPCs, NPC skills) and linear area progression is wired up. Four items remain before the area is fully playable.

## Task 1: Candy xpGrant:killEquivalent

**Problem:** The Candy item (飴) has `effect: { xpGrant: "killEquivalent" }` — a new effect type not yet supported by `item-service.js`.

**Design:** When a player uses Candy from the friendly NPC shop, it grants XP to all party creatures equal to one enemy kill at the current encounter level.

**Changes:**
- `src/game/services/item-service.js` — Add optional `context` param to `applyItem(item, creatureParty, _itemBuffs, targetIndex, context)`. New branch: when `item.effect.xpGrant === 'killEquivalent'`, import and call `awardKillXp(creatureParty, context.enemyLevel)` to distribute XP using the standard kill formula.
- `src/game/loop.js` — Shop handler passes `{ enemyLevel }` derived from the run's current encounter count via `getEnemyLevel()`.

**Scope:** ~20 lines across 2 files.

## Task 2: NPC Buff Random Target (Memorize Skill)

**Problem:** `executeNpcSkill` in `creature-combat-service.js` hardcodes `targetIndex=0` when calling `executeMove`. The Senpai NPC's Memorize skill (`single_ally`, +2 atk) always buffs the first creature instead of a random one.

**Design:** When skill target is `single_ally`, pick a random alive index from `npcAllies` instead of 0.

**Changes:**
- `src/game/services/creature-combat-service.js` — In `executeNpcSkill`, compute `targetIdx` as a random alive index from `npcAllies` when `skill.target === 'single_ally'`, otherwise 0.

**Scope:** ~5 lines in 1 file.

## Task 3: Creature Sprites

**Problem:** 6 new creatures have no sprites.

**Design:** Generate pixel art sprites using the existing Gemini pipeline (Gemini → BiRefNet → trim → webp).

**Output files:**
- `public/assets/sprites/creatures/tsukue.webp` (Desk)
- `public/assets/sprites/creatures/isu.webp` (Chair)
- `public/assets/sprites/creatures/fukurou.webp` (Owl)
- `public/assets/sprites/creatures/chou.webp` (Butterfly)
- `public/assets/sprites/creatures/hachi.webp` (Bee)
- `public/assets/sprites/creatures/ari.webp` (Ant)

**Style:** Match existing creature sprites — pixel art, transparent background, centered, ~128px character size.

## Task 4: Area Background

**Problem:** The school area references `areas/school/school_01.webp` which doesn't exist yet.

**Design:** Generate a school-themed parallax background via ComfyUI. Bright, indoor Japanese school hallway/classroom aesthetic matching the area description.

**Output file:**
- `public/assets/backgrounds/areas/school/school_01.webp`

## Dependencies

All 4 tasks are independent and can be executed in parallel. Tasks 1-2 are code changes. Tasks 3-4 are art generation via existing pipelines.

## Code work needed flag

These items were flagged with `_note` fields in `tmp/school-area-draft.json` during the design session. The `_note` fields should be removed from the production data files after implementation (they don't exist in the production files — only in the draft).
