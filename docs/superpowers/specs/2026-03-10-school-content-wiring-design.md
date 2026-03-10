# School Content Wiring MVP

**Date:** 2026-03-10
**Status:** Approved, executing

## Goal
Wire all forged school content into the game and lock to school-only area for MVP testing.

## Content Inventory
- 3 creatures (kokubanrei, isurori, tsukueon) → merge into creatures.json
- 6 items (scissors, pen, pencil, school-uniform, textbook, dictionary) → merge into items.json, drop `stage` field
- 17 NPC skills → merge into npc-skills.json (5 already exist, add 12 new)
- 16 school NPCs → flesh out with dialogue/skills/speakerId, merge into npcs.json
- 1 area (mahouno-gakkou) with 10 sub-areas → already in areas.json
- Sub-area backgrounds → already on disk (29 images)

## Changes
1. **Data merges**: creatures, items, NPC skills appended to production files
2. **NPC completion**: 16 NPCs get speakerId, attack, skills[], greeting, defeatLine, postCombat (3 rounds × 3 options)
3. **Area lock**: `getAreaSelectionOptions()` in rooms.js always returns mahouno-gakkou
4. **No stage filtering removal needed** — items don't filter by stage in code

## Decisions
- Non-school content stays in data files but unreachable (area locked)
- Only 16 school NPCs merged; 5 non-school NPCs stay in staging
- NPC dialogue is fallback/seed — narration engine regenerates at runtime against player vocab
- Items lose `stage` field entirely
