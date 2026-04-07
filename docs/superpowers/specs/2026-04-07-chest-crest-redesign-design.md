# Chest & Crest Screen Redesign

**Date:** 2026-04-07
**Branch:** dev
**Origin:** Bug report #5 — "Make chests look like the rest of the game"

## Problem

The chest and crest equip screens are full-screen modal overlays (z-index 100) that cover the entire game UI. Every other screen in Koto uses the standard three-tier layout: scene area (40vh top) + action area (flex:1 bottom) + mini toolbar. The modals feel disconnected from the game and don't match the visual language.

## Approved Design

Two screens, both adopting the standard scene area + action area pattern with gacha-inspired visual upgrades.

### Chest Opening Screen (E+B Hybrid)

**Scene area (top 40%):**
- Dramatic chest-on-pedestal visual (from variant B)
- Element-colored gradient background that changes per selected element:
  - Fire: warm red-orange gradient
  - Water: cool blue gradient
  - Wood: fresh green gradient
  - Earth: amber-gold gradient
  - Metal: lavender-silver gradient
- Large chest icon/emoji centered on a glowing pedestal
- Light rays radiating outward from the chest (CSS conic-gradient, slow rotation)
- Element-colored sparkle particles drifting
- Background transitions smoothly when switching elements

**Action area (bottom 60%):**
- Pentagon radial element selector (from variant E)
- 5 circular buttons (64px) arranged in a pentagon/circle pattern:
  - Top center: Fire
  - Upper right: Water
  - Lower right: Earth
  - Lower left: Metal
  - Upper left: Wood
- Each circle: element color background, white element emoji centered
- Selected/active element: enlarged (80px), bright glow, white ring border
- Inactive elements: 0.7 opacity
- Below the selector:
  - Selected element info: "[Element] Chest" (bold), drop counter "X / 3 drops"
  - Large pill button: "Open Chest" (accent blue, white text, full width)
  - Button disabled (0.4 opacity) when drops < 3
- "Back" link at bottom

**Interaction flow:**
1. Player enters from hub -> sees Fire chest by default (or last selected)
2. Taps element circle -> scene transitions to that element's chest, info updates
3. Taps "Open Chest" -> existing PixiJS chest animation plays
4. After reveal -> returns to selector (crest added to inventory)

### Crest Equip Screen (Pentagon Loadout)

**Scene area (top 40%):**
- Deep indigo-purple gradient background (consistent with game's mystical feel)
- 5 equip slots in pentagon formation (NO connecting star/pentagram lines)
- Each slot is a 56px circle:
  - Equipped: element-colored border (2px), element-colored glow, element emoji inside, rarity-colored dot in corner, stat label below ("ATK +8%")
  - Empty: dashed border at 40% opacity, "+" placeholder, dim
- Equipped slots have a slow breathing glow animation (3s infinite)
- Subtle floating particle dots in background

**Action area (bottom 60%):**
- Title: "Crests" with "Inventory" subtitle
- Element filter tabs: horizontal row of 6 pill buttons ("All" active + 5 element emojis)
- Inventory grid: 4-column CSS grid, 8px gap
  - Each tile: 72px square, white background, rarity-colored border (2px)
  - Content: element emoji centered, small rarity label below
  - Equipped tiles: 40% opacity with "Equipped" badge overlay
  - Tapping a tile opens the existing equip preview modal
- "Back" link at bottom

**Interaction flow:**
1. Player enters from hub -> sees equipped crests in pentagon, inventory below
2. Taps empty slot or inventory tile -> equip preview modal (already exists)
3. Confirms equip -> slot fills in, pentagon updates
4. Taps equipped slot -> option to unequip

## Layout Pattern (shared)

Both screens use the standard game layout:
```
.game-app (flex column, fixed, 430px max-width)
  .status-bar
  .scene-area (flex-shrink: 0, height: 40vh, min-height: 220px)
  .action-area (flex: 1, overflow-y: auto, centered content)
  .mini-toolbar
```

This replaces the current full-screen fixed overlay approach (#chests-panel, z-index 100).

## What Changes

| Component | Current | New |
|-----------|---------|-----|
| Chest panel | Full-screen modal overlay | Scene area + action area |
| Chest layout | 5-column grid of cards | Pentagon radial selector + single button |
| Chest scene | None (modal covers everything) | Element-themed chest pedestal |
| Crest panel | Full-screen modal overlay | Scene area + action area |
| Crest equip layout | Header + slots row + filter tabs + grid | Pentagon scene + filtered grid |
| Crest scene | None | Pentagon formation of equipped crests |
| Navigation | Close button (X) on modals | Back link in action area |
| Hub buttons | "Chests" and "Crests" as modal triggers | Same buttons, but transition to scene-based screens |

## What Stays The Same

- Chest opening animation (PixiJS) — plays on top as before
- Crest equip preview modal — the comparison/confirm dialog stays
- API endpoints — no backend changes needed
- Crest service logic — drop costs, rarity generation, equip/unequip all unchanged
- Element colors and rarity system
- Tutorial integration hooks (steps 3-6)

## Element Reference

| Element | Color | Stat | Emoji |
|---------|-------|------|-------|
| Fire | #ef5350 | Attack | fire |
| Water | #42a5f5 | MP | water |
| Wood | #66bb6a | HP | herb |
| Earth | #ffb74d | Defense | rock |
| Metal | #b39ddb | XP | gear |

## Design Artifacts

- Chest variants: `~/.gstack/projects/mrohrssen-Koto2/designs/chest-crest-redesign-20260407/`
- Crest variants: `~/.gstack/projects/mrohrssen-Koto2/designs/crest-equip-redesign-20260407/`
- Approved chest: E+B hybrid (variant-E layout + variant-B scene)
- Approved crest: A Pentagon Loadout (no star lines)

## Files to Modify

- `public/js/ui/chests.js` — rewrite from modal overlay to scene+action rendering
- `public/js/ui/crests-equip.js` — rewrite from modal overlay to scene+action rendering
- `public/game.css` — replace chest/crest modal styles with scene-area based styles
- `public/js/ui/exploration.js` — update hub buttons to trigger phase transitions instead of modal opens
- `public/js/game.js` — update chest/crest initialization for new rendering approach
