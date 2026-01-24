# Feature: Chip info modal should show base ability AND skill separately

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Priority:** Medium (important for player understanding of chip system)

## Current Behavior

- Clicking a chip circle doesn't clearly show the chip's base (passive) ability and its active skill as separate sections

## Expected Behavior

Tapping an equipped chip should open a modal with two clear sections:

### 1. Base Ability (always active)
- Name and description of the passive pipeline effect
- e.g., "Battery Bot: +5 damage to every attack"

### 2. Skill (charged ability)
- Skill name and description
- Charge progress (e.g., "3/5 charges")
- What the skill does when activated
- e.g., "Full Charge: Next attack deals +8 damage (requires 5 charges)"

## Data Available

`data/chips.json` already has both fields per chip:
- `effects.pipeline` — the base passive effect
- `skill` — the active skill (id, name, description, chargesRequired, effect)

## Files to Investigate/Modify

- `public/js/ui/chip-row.js` — chip click handler, modal content rendering
- `public/game.css` — modal section styling (separate visual blocks for base vs skill)
- `data/chips.json` — data source (already has both fields)
