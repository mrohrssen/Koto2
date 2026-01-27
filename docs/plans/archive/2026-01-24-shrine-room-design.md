# Shrine Room - Chip Upgrade Feature

## Summary

Replace the dead `shrine` room type with a Fox Shrine that lets players upgrade one of their equipped chips. The shrine appears as a non-combat encounter with a fox spirit who offers to enhance the player's equipment.

## Room Generation

- Each encounter slot has a 20% chance to become a `shrine` room instead of combat
- No per-floor limit on shrines
- If the player has 0 equipped chips when entering a shrine, generate a normal encounter instead

## Game Flow

1. Player enters room, type is `shrine`
2. Top section renders shrine background + fox sprite + "Shrine Fox" name label (no HP bar)
3. Action area (flash card zone) shows up to 3 randomly selected equipped chips as smaller shop-style cards
4. Player taps a chip card to upgrade it (+1 level, capped at 7)
5. Room advances immediately after selection

## UI Layout

### Top Section (Scene Area)
- Background: `/assets/backgrounds/shrine_background.png`
- Sprite: `/assets/sprites/shrine_fox.png`
- Name: "Shrine Fox" using existing `.enemy-name` styling
- No HP bar, no skill bar

### Middle Section (Action Area)
- Horizontal flex row of chip cards (gap: 8px, centered)
- Each card styled like `.shop-chip-option` but smaller:
  - 40px circular icon (vs 56px in shop)
  - Chip name with "Lv. X" suffix showing current level
  - Rarity badge
  - Description text
  - Tappable for selection

### Chip Level in Skill Modal (Separate Enhancement)
- In `.chip-popup-name`, always show "Lv. X" after chip name
- Applies to all chips in all contexts, not just shrine

## Backend

- No new API endpoints
- Room generation in `rooms.js` handles shrine spawning
- Chip upgrade uses existing `setChipLevel()` / `getChipLevel()` from `chips.js`
- `_chipLevels[chipId]` incremented by 1, clamped to max 7
- Room marked as `interacted: true` after selection

## Assets

- Copy `tmp/quiz-review/shrine_background.png` → `public/assets/backgrounds/shrine_background.png`
- Copy `tmp/quiz-review/shrine_fox.png` → `public/assets/sprites/shrine_fox.png`

## Files to Modify

1. `src/game/rooms.js` - Replace shrine healing logic with chip upgrade type, 20% spawn rate
2. `public/game.js` - Add shrine room rendering (fox + chip cards), handle chip selection
3. `public/game.css` - Shrine-specific styles for smaller chip cards
4. `src/game/items/chips.js` - Verify/fix chip level scaling (untested path)
5. `public/game.js` - Add "Lv. X" to chip popup modal name display
