# Target Select Redesign — Full Info Card with Kanji Element Badge

**Date:** 2026-02-27
**Branch:** `feature/pokemon-move-system`

## Problem

The target selection UI shows only English names with a colored dot and HP bar — a jarring downgrade from the upgraded move cards that show icons, furigana, Japanese names, element bars, and status pills. No vocab reinforcement happens during targeting.

## Design: 3E + Kanji Badge

Each target enemy is rendered as a **full info card** with two panels:

### Left: Sprite Panel
- Creature sprite (48x48 webp, emoji fallback)
- Element-tinted background (rgba of element color)
- **Kanji element badge** in bottom-right corner (火/水/木/土/金) — bonus vocab reinforcement

### Right: Info Panel
- Japanese name (large, bold) — e.g. ツキモチ
- English name (smaller, gray) — e.g. Tsukimochi
- Stats row: Level + HP bar + HP percentage

### Card Frame
- Element-colored border (2px solid, matches move cards)
- Rounded corners (12px)
- Press feedback: `scale(0.98)` on `:active`

### Element Kanji Map
| Element | Kanji | Color |
|---------|-------|-------|
| fire | 火 | #F44336 |
| water | 水 | #2196F3 |
| wood | 木 | #4CAF50 |
| earth | 土 | #8D6E63 |
| metal | 金 | #9E9E9E |
| neutral | — | #888 |

## Data Available

Enemy robot objects from `instantiateRobot()` provide: `name` (JP katakana), `nameEn`, `element`, `hp`, `maxHp`, `level`, `id`. No furigana needed since creature names are katakana (self-reading).

## Files to Change

1. **`public/js/ui/target-select.js`** — Rewrite `showTargets()` to render full info cards
2. **`public/game.css`** — Add target card styles
3. **`public/js/ui/sprite-utils.js`** — Import sprite URL helper (already exists)

## Mockup

See `public/mockup-targeting-v3.html` for the approved visual mockup.
