# Content Browser Design

**Date:** 2026-03-09
**Status:** Approved

## Overview

A new dev hub tab at `/dev/content` for browsing and inline-editing all 6 game content types: creatures, moves, items, NPCs, NPC skills, and areas. Auth-protected, consistent with existing dev hub pages.

## Approach

Single page with tab navigation (Approach A). One HTML file, API routes in dev router.

## Page Layout

- **Top bar:** Title "Content Browser" + global text search input
- **Tab bar:** Creatures | Moves | Items | NPCs | NPC Skills | Areas (each with entry count badge)
- **Table:** Sortable columns specific to each content type. Click column headers to sort asc/desc.
- **Footer:** Total count + modified indicator

## Table Columns

| Tab | Columns |
|-----|---------|
| Creatures | id, name, nameEn, element, rarity, archetype, stage, baseHp, baseAttack, baseMp, learnset (count) |
| Moves | id, name, nameEn, reading, meaning, element, category, power, mpCost, tier, stage |
| Items | id, word, reading, meaning, type, rarity, effect, stage |
| NPCs | id, name, nameEn, area, tier, skills (count), personality.traits |
| NPC Skills | id, name, nameEn, reading, meaning, element, category, power, mpCost |
| Areas | id, name, nameEn, reading, theme, creatures (count), subAreas (count) |

`id` and computed counts are display-only. Everything else is click-to-edit.

## Inline Editing

- Click cell → becomes text input (or dropdown for enum fields)
- Enum fields: element, category, rarity, type get dropdowns with known values
- Modified cells highlighted yellow
- Escape cancels edit, Tab moves to next cell
- Array fields (learnset, creatures, skills) → click count to expand sub-editor

## Save Flow

1. "Save Changes" button appears when cells are modified
2. Modal shows diff: field name, old → new for each change
3. Confirm writes to disk, Cancel returns to editing
4. Success toast + highlights clear after save

## API Endpoints

- `GET /dev/api/content/:type` — returns full array for content type
- `PATCH /dev/api/content/:type` — accepts `{changes: [{id, field, value}, ...]}`, validates IDs and fields, applies changes, writes file

Type mapping:
- creatures → data/creatures.json
- moves → data/moves.json
- items → data/items.json
- npcs → data/npcs.json
- npc-skills → data/npc-skills.json
- areas → data/areas.json

## Auth

Same dev hub auth (session cookie, password-protected if DEV_DASHBOARD_PASSWORD set).

## Search

Instant text filter across all visible columns in the active tab.
