# PixiJS Status Labels (Buff/Debuff Counters + Active Effects)

**Date:** 2026-04-03
**Status:** Approved

## Problem

The old DOM-based status icon badges (ATK, DEF, SHD, STUN, etc.) on `.formation-slot` elements are completely hidden behind the PixiJS canvas during combat. Players have no persistent visual indicator of stat stages or active effects on creatures.

## Solution

Render status labels as PixiJS pill badges (Graphics background + Text) on a dedicated `layers.labels` container. Labels are positioned above each creature sprite's base position and updated after every attack resolves.

## Design Decisions

- **PixiJS-native rendering** — labels live on the canvas, no DOM/canvas alignment issues
- **Static positioning** — labels use `sprite.baseX/baseY`, not animated position. They don't move during attack lunges, hit recoils, or walking wobble. They only reposition on formation rebuild (creature dies, resize).
- **Combat-only lifecycle** — labels are created during combat and cleared when `hideFormation` runs at combat end.
- **Stat stage labels show counters** — `ATK +1`, `DEF -2`, `ATK +6`, etc. The numeric value is useful information.
- **Active effect labels use abbreviations** — `SHD`, `STUN`, `SLP`, `CONF`, `TAUNT`, `PSN`, `SPD↑` (no numeric counter).
- **Colors from STATUS_ICON_CONFIG** — reuses the existing color mapping in `event-popup.js`.

## Label Appearance

| Source | Example Labels | Background Color | Text Color |
|--------|---------------|-----------------|------------|
| `statStages.atk > 0` | `ATK +1` | #FF8F00 (orange) | white |
| `statStages.atk < 0` | `ATK -2` | #7B1FA2 (purple) | white |
| `statStages.def > 0` | `DEF +3` | #1976D2 (blue) | white |
| `statStages.def < 0` | `DEF -1` | #E65100 (deep orange) | white |
| `shield` / `team_shield` | `SHD` | #00ACC1 (cyan) | white |
| `haste` | `SPD↑` | #29B6F6 (light blue) | white |
| `stun` | `STUN` | #F9A825 (yellow) | black |
| `sleep` | `SLP` | #78909C (grey) | white |
| `confuse` | `CONF` | #FDD835 (yellow) | black |
| `taunt` | `TAUNT` | #D32F2F (red) | white |
| `poison` | `PSN` | #9C27B0 (purple) | white |

Multiple labels on one creature are laid out horizontally, centered above the sprite.

## File Changes

### `battle-stage.js`
- Add `layers.labels` container between `effects` and `overlay`.

### `formation.js`
- Add `syncPixiStatusLabels(side, index, keys, statStages)` — creates/removes pill labels above `sprite.baseX, sprite.baseY`.
  - For stat stage keys (`atk_up`, `def_down`, etc.), generate dynamic label text from `statStages` values (e.g., `ATK +2`).
  - For active effect keys, use the static `label` field from `STATUS_ICON_CONFIG`.
  - Each pill: `Graphics` rounded rect background + `Text` child, grouped in a `Container`.
  - Store label containers on `sprite.statusLabels` array.
  - Multiple labels centered horizontally above sprite with small gap between pills.
- Add label cleanup in `hideFormation`.
- Reposition labels in `resizeFormations`.
- Import `STATUS_ICON_CONFIG` from `event-popup.js` (export it there).

### `combat-loop.js`
- Extend `syncStatusIconsFromResult` to also call `syncPixiStatusLabels` for each creature, passing both the derived keys and the raw `statStages` object.

### `event-popup.js`
- Export `STATUS_ICON_CONFIG` (currently module-private `const`).

## Data Flow

```
Attack resolves (server response)
  → combat-loop.js: syncStatusIconsFromResult(result)
    → getCreatureStatusKeys(creature) → ['atk_up', 'shield', ...]
    → updateStatusIcons(slotEl, keys)           // existing DOM (no-op, hidden)
    → syncPixiStatusLabels(side, i, keys, creature.statStages)  // NEW
      → formation.js: clear old labels, create new pills on layers.labels
```

## Not In Scope

- Animated label entrance/exit (can add later if desired)
- Remaining-turns display on active effects
- Walking wobble tracking (labels are static at base position)
