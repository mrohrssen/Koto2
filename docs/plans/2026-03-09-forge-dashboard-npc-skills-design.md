# Forge Dashboard: NPC Skills Support

**Date:** 2026-03-09
**Status:** Approved

## Summary

Add `npc-skill` as a new forge role throughout the existing forge pipeline. NPC skills are verb-based moves (same schema as creature moves) that live in a separate pool (`npc-skills.json`). NPCs draw from this pool, with each NPC assigned specific skills they can use.

## Design Decisions

- **Same schema as creature moves** — element, category, target, power, mpCost, statusEffect, etc.
- **Verb-based** — forged from Japanese verbs, identical to creature moves
- **Same dependency priority as moves** — no dependencies, processed first in forge queue
- **Separate pool** — stored in `npc-skills.json`, not `moves.json`

## Changes Required

### 1. Dashboard UI (`public/forge.html`)

**Filter bar:** Add `npc-skill` filter button after NPC button.

**Role badge CSS:** Add `.role-badge.npc-skill` styling (distinct color from both `move` and `npc`).

**Result card CSS:** Add `.result-card.npc-skill` border color.

**`renderResultCard()`:** Add `npc-skill` case that renders the same fields as moves (since same schema): id, name, nameEn, reading, meaning, element, category, target, power, mpCost, statusEffect, statusChance, statusDuration.

**`collectCardData()`:** Add `npc-skill` case that collects the same fields as moves.

**`renderResultCard()` re-forge role list:** Add `npc-skill` to the `allRoles` array.

**Raw JSON toggle:** Add `npc-skill` to the condition that shows the toggle.

### 2. Forge Routes (`src/routes/forge.js`)

**`STAGING_FILES`:** Add `'npc-skill': 'new-npc-skills-staging.json'`.

No other route changes needed — the role lookup in `postApprove` already uses `STAGING_FILES[role]` dynamically.

### 3. Forge Queue Processor (`forge-queue/SKILL.md`)

**Dependency order:** Process `npc-skill` alongside `move` (first group, no dependencies).

**Context loading:** Add existing NPC skills: `data/npc-skills.json` + `data/new-npc-skills-staging.json` for dedup.

**Subagent prompt:** Add NPC-SKILL role section with:
- Same rules as MOVE (element from semantics, category from verb type, tier/power/cost table)
- Same schema as MOVE but without `stage` field (NPC skills don't have stage gating)
- ID prefix convention: use the reading as base, no special prefix needed

### 4. Theme Pool Support

Theme pool words already have a `roles` array. Words with `npc-skill` in their roles array will show the role badge and be selectable for that role in the batch panel. No code changes needed — the dashboard already reads `roles` dynamically from theme data.

## Files Modified

| File | Change |
|------|--------|
| `public/forge.html` | Filter button, role badge CSS, result card CSS, `renderNpcSkillFields()`, `collectCardData()` npc-skill case, allRoles array |
| `src/routes/forge.js` | Add `npc-skill` to `STAGING_FILES` |
| `.claude/plugins/koto-forge/1.1.0/skills/forge-queue/SKILL.md` | Add npc-skill role rules, schema, dependency group |

## Non-Changes

- No changes to runtime combat (`npc-service.js`, `creature-combat-service.js`, `loop.js`)
- No changes to `npc-skills.json` structure
- No new API endpoints
- No new test files needed (existing forge route tests cover the generic role flow)
