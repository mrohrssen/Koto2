# Chip Select Redesign

Redesign the chip selection UI for both game-start and post-combat chip rewards.

## Current State

Chip selection uses a takeover modal with chip cards showing icons, names, and descriptions. The modal slides in from the right and covers the game scene.

## New Design

Replace the modal with an in-scene selection experience that treats chips like characters.

### Layout

**Action Area (bottom, where flash cards show):**
- Three chip cards displayed horizontally
- Each card shows: Japanese name, rarity badge, description
- No icon on the card (icon shows larger in sprite area)
- Selected chip has visual highlight (glow/border)
- Below cards: "Choose Chip" button (「チップを選ぶ」)

**Sprite Area (top, where enemies show):**
- Selected chip's icon displayed large (reuse enemy sprite container)
- Chip's Japanese name shown where enemy name appears
- HP bar hidden during chip selection

**Narration Box (bottom of scene):**
- Shows greeting: 「こんにちは！私を選んでくれる？」
- Speaker: chip's Japanese name
- Persistent display (no click-to-continue indicator)

### Interaction Flow

1. Chip selection appears (game start or post-combat)
   - Three chip cards render in action area
   - First chip auto-selected with highlight
   - First chip's icon displays in sprite area
   - Narration shows greeting with chip name as speaker

2. User clicks different chip card
   - Highlight moves to clicked chip
   - Sprite area updates to new chip's icon
   - Narration speaker updates to new chip's name
   - Greeting text unchanged

3. User clicks "Choose Chip" button
   - Selected chip confirmed (added to inventory)
   - UI transitions to next game state

### Text Parsing

All text is parseable for vocabulary lookup mode:
- Chip Japanese names
- Chip descriptions
- Narration greeting
- Button text

### Greeting Text

Static phrase for all chips (rotating dialogue deferred):

**Japanese:** 「こんにちは！私を選んでくれる？」
**English:** "Hello! Will you choose me?"

Beginner-friendly vocabulary: こんにちは, 私, 選ぶ

## Applies To

- Initial chip offering at game start
- Post-combat chip reward selection
