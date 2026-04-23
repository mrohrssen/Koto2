# Attack-Select Card Redesign

## Summary

Redesign the in-combat move-select grid cards to match a richer, element-theme-driven style. The 2×2 grid and all callers stay the same; only the per-card layout and CSS change.

```
┌────────────────────────┐
│ ┌──┐  tataku       ┌─┐ │
│ │🗡│  たたく       │?│ │
│ └──┘  Strike       └─┘ │
│ ┌────────────────────┐ │
│ │💧 5 MP │ 🗡 10    │ │
│ └────────────────────┘ │
└────────────────────────┘
```

Each card has an element-tinted gradient background, a rounded-square 46px badge on the left holding the existing per-move action sprite, a left-aligned three-row text block (romaji / hiragana reading / English), a semi-white stats pill along the bottom (MP cost · divider · power or effect), and a circular `?` help button floating in the top-right corner.

## Motivation

- Element at a glance: card color communicates damage type before the player parses text.
- Better information density: each card surfaces romaji reading + hiragana + English without cramping, so new players get all three language layers in one glance.
- Visual upgrade: tighter corner radius, cleaner icons, and the pill divider bring the move cards in line with the polish elsewhere in combat UI.
- Preserves per-move art: the action sprite (e.g. `flame.webp`, `cry.webp`) remains the visual anchor — associating a specific word with a specific image is the game's pedagogy.

## Scope

**In scope:**
- `buildMoveCell()` HTML in `public/js/ui/move-select.js`
- The `.move-*` CSS block in `public/game.css` (starts at line 4265)

**Out of scope:**
- The 2×2 grid container, stagger animations, disabled logic, help popup, TTS prefetch, and the `showMoves()` / `setActiveLabel()` / `clear()` callback contracts — all preserved.
- Combat header, creature-row, befriend cell, items cell, split cell — untouched.
- Moves data (`data/moves.json`) and the `element` / `category` / `reading` fields — used as-is.
- Kanji-vs-hiragana selection — continues to go through `renderJpSentence`'s existing `useKanji` flag; the card simply renders whatever primary display the caller provides.

## Card Structure

```html
<button class="move-cell move-cell--<element>" [class="... disabled"]>
  <div class="move-help-btn" data-move-id="<id>">?</div>
  <div class="move-hero">
    <div class="move-badge">
      <img src="/assets/sprites/actions/<slug>.webp?v=<SPRITE_VERSION>" alt="">
    </div>
    <div class="move-text">
      <div class="move-romaji"><!-- toRomaji(reading) --></div>
      <div class="move-name-jp"><!-- renderJpSentence output for the move entity --></div>
      <div class="move-name-en"><!-- move.nameEn --></div>
    </div>
  </div>
  <div class="move-pill">
    <span class="move-pill-stat">
      <svg class="move-pill-ico move-pill-ico--mp">…drop…</svg>
      <span><!-- move.mpCost --> MP</span>
    </span>
    <span class="move-pill-divider"></span>
    <span class="move-pill-stat">
      <svg class="move-pill-ico move-pill-ico--<power|buff|debuff|heal|status>">…</svg>
      <span><!-- effect label: power | "Atk +1" | "Def +1" | "Heal 50%" | "Poison 3T" --></span>
    </span>
  </div>
</button>
```

The `move-cell` button element, `move-hero`, help-button click wiring, and disabled-state toggle all continue to work as they do today. Classes that are reused from the existing rule block: `.move-cell`, `.move-cell.disabled`, `.move-hero`, `.move-name-jp`, `.move-help-btn`. Classes that are renamed: `.move-icon` → `.move-badge`. Classes that are new: `.move-romaji`, `.move-text`, `.move-name-en`, `.move-pill`, `.move-pill-stat`, `.move-pill-divider`, `.move-pill-ico`, plus the element modifier `.move-cell--<element>`. Classes that are removed: `.move-name-block`, `.move-furigana`, `.move-stats`, `.move-power`, `.move-cost`, `.move-status-pill` (replaced by the pill and its new children).

## Element Palette

Reuse the gradients already defined in `game.css` for `.ar-element-icon` and `.creature-card[data-element=…]`. The card uses these for both the card background and the badge fill.

| Element  | Card bg (top → bottom)       | Badge fill (radial)            | Text color   |
|----------|------------------------------|--------------------------------|--------------|
| fire     | `#ffc9b3 → #ff9b7a`          | `#ffeacb → #ff6b3a`            | `#3a1a10`    |
| water    | `#cfe9f7 → #98c7de`          | `#d6f0ff → #4b9ed6`            | `#0f2a3d`    |
| wood     | `#d8e8bf → #a9c98a`          | `#eef6d8 → #7aae47`            | `#1e2e14`    |
| earth    | `#f1d9b2 → #e2bc84`          | `#fae5c2 → #c99356`            | `#3a2612`    |
| metal    | `#e5ebef → #b7c4cd`          | `#f4f7fa → #8fa3b3`            | `#1d2730`    |
| neutral  | `#eee5d6 → #cbbfa5`          | `#f4ecd9 → #c7b892`            | `#3d3223`    |

Card border stays `2px solid rgba(255,255,255,0.55)` (current rule, unchanged). Text color is the per-element dark variant above — high contrast over the tinted pastel background without needing shadows.

## Typography

Inside `.move-text`, three rows stack left-aligned, each `white-space: nowrap` with `overflow: hidden; text-overflow: ellipsis`:

| Row            | Content                                                                  | Style                                     |
|----------------|--------------------------------------------------------------------------|-------------------------------------------|
| `.move-romaji` | `toRomaji(move.reading)` (lowercase, no spaces)                          | 10px, opacity .62, letter-spacing .4px    |
| `.move-name-jp`| Output of `renderJpSentence([entityToToken(move)], getKnownWords(), new Map())` — same call the current code makes. `useKanji` defaults to `false` today, so this renders hiragana for all players. Any future area-aware opt-in lives in the caller (`buildMoveCell`) and the card inherits it automatically. | 20px, weight 800, letter-spacing -.5px    |
| `.move-name-en`| `move.nameEn`                                                            | 11.5px, weight 700, opacity .75           |

The `.move-hero` flex row gets `padding-right: 22px` so the help button in the corner never overlaps the text.

## Badge

`.move-badge` is a 46×46 rounded square:

```css
.move-badge {
  width: 46px; height: 46px;
  border-radius: 10px;
  border: 2px solid rgba(255,255,255,0.85);
  box-shadow: inset 0 -3px 5px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.15);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.move-badge img { width: 38px; height: 38px; object-fit: contain;
                  filter: drop-shadow(0 1px 1px rgba(0,0,0,0.2)); }
```

Per-element radial-gradient fills are applied via `.move-cell--<element> .move-badge { background: … }` using the palette table above. The existing `onerror` fallback (swap to the category emoji) is preserved.

## Stats Pill

`.move-pill` sits below `.move-hero` with `margin-top: 7px`. Content lays out as `display: flex; justify-content: space-between` so MP pins left and effect pins right, with `.move-pill-divider` between.

```css
.move-pill {
  background: rgba(255,255,255,0.78);
  border-radius: 8px;
  padding: 4px 8px;
  backdrop-filter: blur(4px);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.4);
  font-size: 11px; font-weight: 800;
  white-space: nowrap;
}
.move-pill-divider { width: 1px; height: 12px; background: rgba(0,0,0,0.18); }
```

Icons are inline SVG (not emoji) so fill/stroke can be themed per element:

- **MP drop** — solid-fill teardrop. Color darkens to a near-black element tint for contrast (`#1976d2` on fire, `#0277bd` on water, etc.).
- **Power sword** — 2.2px stroke single sword, leaning top-right to bottom-left. Used for `category: damage`.
- **Buff chevron up** — 2.4px stroke up-arrow. Used for `category: buff`.
- **Debuff chevron down** — 2.4px stroke down-arrow. Used for `category: debuff`.
- **Heart** — solid-fill heart. Used for `category: heal`.
- **Status burst** — 4-pointed star. Used when `statusEffect` is set and category is not one of the above.

### Effect-label rules

The right-hand stat content is chosen in priority order, against the four categories in `data/moves.json` (`damage`, `buff`, `debuff`, `heal`):

1. `category === 'buff'` and non-empty `statChanges` → icon: chevron up. Label: `"<Stat> +<n>"` (e.g. `"Atk +1"`). If multiple changes are present, pick the entry with the largest magnitude; tie-break by key order `atk, def, spd`.
2. `category === 'debuff'` and non-empty `statChanges` → icon: chevron down. Label: `"<Stat> <n>"` with negative sign.
3. `category === 'heal'` → icon: heart. Label: `"Heal <move.power>"` (heal moves in current data use the `power` field for magnitude; no `healPercent` field exists).
4. `statusEffect` set and category is damage → still show `move.power` as the primary (see rule 6); status is rendered as a small chip OR absorbed into the power label as `"<power> · <Status> <duration>T"` — keep the chip, no wrap.
5. `statusEffect` set and category is none of the above → icon: 4-point star. Label: `"<Effect> <statusDuration>T"` (e.g. `"Poison 3T"`).
6. Default (damage) → icon: sword. Label: raw `move.power` number.

`statChanges` keys in current moves are `atk`, `def`, `spd`. Display labels map 1:1 (`atk` → `Atk`).

## Help Button

```css
.move-help-btn {
  position: absolute;
  top: 6px; right: 6px;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: rgba(255,255,255,0.85);
  color: rgba(0,0,0,0.55);
  font-size: 11px; font-weight: 800;
  box-shadow: 0 1px 2px rgba(0,0,0,0.12);
  z-index: 2;
}
```

Click handler and popup wiring stay identical; only positioning and visual style change. The existing `data-move-id` attribute and `onMoveHelp` callback contract are preserved.

## Disabled State

When `creature.mp < move.mpCost`:
- `.move-cell.disabled` keeps current rule (`opacity: 0.4; pointer-events: none`).
- The MP value in the pill gets color `#c62828` (red 800) via `.move-cell.disabled .move-pill-stat:first-child` so the "can't afford" signal is clearer than a generic fade.

## Motion

Existing `@keyframes moveCardIn` + stagger delays (`:nth-child(1..3)`) unchanged. `:active` still triggers `transform: scale(0.97)`. No new animations.

## Files Changed

- `public/js/ui/move-select.js` — rewrite the template in `buildMoveCell()`. Add a small helper `effectLabel(move)` that returns `{ iconType, text }` per the rules above. Keep all exports and the `showMoves()` signature.
- `public/game.css` — replace the block starting at line 4265 (`/* === Move Selection Grid … === */`) through `.move-active-label` with the new rules. Keep the split-cell / items / befriend / help-popup rules unchanged.

No changes to `data/moves.json`, `combat-loop.js`, `befriend.js`, `pvp-battle.js`, `bootstrap-client.js`, `romaji.js`, or any other callsite.

## Testing

- **Unit:** add a test for `effectLabel(move)` covering all six rules with representative moves from `data/moves.json` (tataku, honoo, mamoru, naku, plus a status-effect move and a heal move if present).
- **Integration / visual:** playwright-driven screenshot of `showMoves(Hi, 0)` with the four starter-learnset moves, verifying element tint per move, all three text rows populated, stats-pill layout, and top-right help button placement on a fire and neutral card. Run both `useKanji: false` and `useKanji: true` paths to confirm the JP row switches.
- **Non-regression:** existing combat playtest (from `docs/playtest-guide.md`) should still progress through move select, items, befriend, and help popup without behavioral change.

## Risks & Non-Goals

- **PvE / PvP parity:** both modes go through the same `showMoves()` / `buildMoveCell()` — changing the cell applies to both automatically. No separate PvP path to update.
- **Romaji for katakana:** `public/js/ui/romaji.js:112` passes katakana through unchanged. All `reading` fields in `data/moves.json` are pure hiragana today, so the top row renders cleanly. If a future move ships with katakana in `reading`, the romaji row will show mixed output — acceptable for a fallback, a proper katakana→romaji map can be added later without reopening this spec.
- **Out of scope:** any changes to the creature header/MP bar, the items/befriend cells, or the dark combat background. Those stayed off the scope list in the brainstorm.
