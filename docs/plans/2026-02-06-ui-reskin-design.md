# UI Reskin Design: Premium Solar Punk Aesthetic

**Date:** 2026-02-06
**Status:** Draft
**Goal:** Complete visual and layout overhaul to match the quality of polished gacha games (reference: Goddess of Victory: Nikke-style Korean gacha UI). Bright, airy, premium feel. Vertical mobile-only (iPhone optimized).

---

## Design Principles

1. **Art carries color, UI stays neutral.** The scene backgrounds and character sprites provide visual richness. UI elements are clean, pale, and minimal.
2. **Minimize scrolling.** Most screens fit the viewport. Level select and chip inventory may scroll when content exceeds the viewport, but core gameplay screens (hub, combat, branch selection) never scroll.
3. **Match the reference images.** Pale blue-grey backgrounds, white panels, soft shadows, frosted glass only on overlays above scene art.
4. **Fast and responsive.** All transitions 150-300ms. No sluggish animations.

---

## Layout Architecture

Four fixed zones that fill 100dvh on all iPhones (SE through 15 Pro Max):

```
┌─────────────────────────┐
│                         │
│     SCENE AREA          │  38-50vh (test to find sweet spot)
│     (background + sprite│
│      + narration bubble)│
│                         │
├─────────────────────────┤
│ [chip][chip][chip][chip][chip] │  ~8% - Status Strip
│ ████████████████░░░ 129/145   │  (chips + HP bar)
├─────────────────────────┤
│                         │
│     ACTION AREA         │  ~34% of viewport
│     (buttons, cards,    │
│      ward choices)      │
│                         │
├─────────────────────────┤
│  🔍    🤖    ☰          │  ~8% - Mini Toolbar
└─────────────────────────┘
```

---

## Color System (Matched from Reference Images)

### Base Palette
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#e8edf3` | Page background, empty space |
| `--bg-panel` | `#f5f7fa` | Card/panel surface |
| `--bg-elevated` | `#ffffff` | Cards that need to pop |
| `--text-primary` | `#2a2e35` | Headings, body text |
| `--text-secondary` | `#8b92a0` | Labels, hints, muted text |
| `--accent-cyan` | `#4fc3f7` | Primary accent, links, speaker names |
| `--accent-lavender` | `#b39ddb` | Secondary highlights |
| `--accent-amber` | `#ffb74d` | Gold/credits, warnings |
| `--border-subtle` | `rgba(0,0,0,0.06)` | Panel edges |
| `--shadow-soft` | `0 1px 4px rgba(0,0,0,0.06)` | Standard card shadow |
| `--shadow-elevated` | `0 4px 16px rgba(0,0,0,0.10)` | Popups, overlays |

### HP Bar Colors
| State | Value |
|-------|-------|
| Healthy | `#66bb6a` |
| Warning | `#ffd54f` |
| Danger | `#ef5350` |
| Enemy HP | `#ef5350` (gradient fill) |

### Rarity Colors (chip borders and glows)
| Rarity | Border Color | Glow |
|--------|-------------|------|
| Common | `#b0bec5` | none |
| Uncommon | `#66bb6a` | none |
| Rare | `#42a5f5` | subtle |
| Epic | `#ab47bc` | subtle |
| Legendary | `#ffd54f` | animated pulse |

### Frosted Glass Treatment
Used ONLY for elements overlaying scene art:
```css
backdrop-filter: blur(12px);
background: rgba(255, 255, 255, 0.8);
```
Applied to: narration box, status strip, chip popup when over scene.

---

## Typography

System fonts with proper weight hierarchy:

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

| Role | Weight | Size | Color |
|------|--------|------|-------|
| Screen title | 700 (bold) | 18px | `--text-primary` |
| Card heading | 600 (semi) | 16px | `--text-primary` |
| Body text | 400 (regular) | 14px | `--text-primary` |
| Labels/hints | 400 | 12px | `--text-secondary` |
| Japanese flashcard word | 700 | 32-36px | `--text-primary` |
| Damage numbers | 700 | 28px | red/green |
| Button text | 600 | 15px | varies |

---

## Component Specifications

### 1. Scene Area (~50% viewport)

**Scene sizing TBD — prototype and test.** Currently 38vh. The design targets ~50% but this may leave too little room for the action area on smaller phones (iPhone SE: 667px total = ~334px scene, leaving ~220px for action + status + toolbar). Start at 38vh and increase incrementally during implementation, testing on iPhone SE (375x667) to confirm the action area remains usable. The background images and character sprites are already good.

**Narration Box (redesign):**
- White frosted rounded-rectangle bubble overlaying bottom of scene
- `border-radius: 16px`, `backdrop-filter: blur(12px)`, `background: rgba(255,255,255,0.85)`
- Speaker name: small colored tag (cyan accent) at top-left inside the bubble
- Body text: `--text-primary`, 14-15px
- Dismiss indicator: subtle animated chevron (replaces blinking orange ▼ arrow)
- Soft shadow: `--shadow-elevated`

**Enemy Info:**
- Name in a frosted pill badge at top-center of scene
- HP bar: thin rounded bar below name, gradient fill, HP text inside
- Enemy skill/intent bar remains as-is but styled to match

### 2. Status Strip (~8% viewport)

Frosted glass strip sitting between scene and action area.

**Chip Tiles (5 slots):**
- ~52x52px rounded rectangles (`border-radius: 8px`)
- Bot sprite icon centered
- Thin border in rarity color (2px)
- Charge progress: 5 small dots below tile (filled = charged segments)
- Fully charged: rarity-colored glow pulse (anime.js)
- Empty slot: outlined rectangle with faint "+" icon, `--border-subtle` color
- Horizontal row with ~8px gaps

**Player HP Bar:**
- Full-width below chip tiles
- Thin rounded bar (~14px height, `border-radius: 7px`)
- Gradient fill (green > amber > red based on %)
- HP text small, centered inside bar
- Translucent background track

### 3. Action Area (~34% viewport)

Solid `--bg-base` background. All interactive content.

**Hub Buttons:**
- 2 buttons: 速習 (Speed Review), 潜入 (Infiltrate)
- White rounded-rect with soft shadow (`--shadow-soft`)
- `border-radius: 12px`, padding `14px 0`
- Text: 600 weight, 15px, `--text-primary`
- Touch feedback: scale(0.96) on press, spring back via anime.js
- Vertically centered in the action area with ~12px gap

**Combat Flashcards (ATTACK / DEFEND):**
- Two stacked cards, both always visible (no scroll)
- Each card: ~90-100px tall, white, `border-radius: 12px`, `--shadow-soft`
- Action label: small colored tag in top-left corner
  - ATTACK: soft red tag (`#ef5350` background, white text, 11px, pill shape)
  - DEFEND: soft blue tag (`#42a5f5` background, white text, 11px, pill shape)
- Japanese word: centered, 30-32px, bold
- After flip: English meaning appears below (14px, `--text-secondary`)
- "didn't know / knew it" as small text at bottom of card
- ~8px gap between the two cards
- Total height: ~200px for both cards, fitting comfortably

**Level Select Cards:**
- Compact card per level showing: level number, Japanese name, English name
- Status badge on right: ✓ (completed), NEW (unlocked), 🔒 (locked)
- Locked cards greyed out and non-interactive
- Scrollable if levels exceed viewport (acceptable exception to minimal-scroll rule)
- "戻る" (Back) button at bottom

**Branch Selection (door choice):**
- Two compact cards for left/right door
- Chippy's hint appears in the narration box above (scene area)
- Cards show room type hint text

**Shop / Chip-Select Cards:**
- Bot card showing sprite, rarity border, stats (PWR, BW, HP)
- Passive and skill descriptions below stats
- Swipe left/right to cycle through 3 chip offerings (loops infinitely)
- Dot indicators show current position (1/3, 2/3, 3/3)
- "リフレッシュ (Refresh)" (25cr, first free) and "購入 (Purchase)" / "スキップ (Skip)" as compact pill buttons at bottom
- Credit display as small amber badge
- Bot sprite appears in scene area with greeting narration

**Damage Feedback:**
- *Player-to-enemy damage:* Already floats in scene area near enemy sprite. Tiered visual system (5 tiers based on % of enemy max HP) with color/size escalation and anime.js effects (shake, flash, particles). Keep existing behavior, restyle numbers to match new palette.
- *Enemy-to-player damage:* Currently renders as large red number in action area. Relocate to float UP from the HP bar area instead.
- Red color, bold, ~28px for standard hits. Gold + glow for massive hits.
- Fades out over 600-1500ms depending on tier.

### 4. Mini Toolbar (~8% viewport)

Slim white bar with thin top border.

**Visible icons (3):**
1. **Lookup** (magnifying glass) - activates word lookup mode
2. **Bots** (grid/chip icon) - opens chip inventory slide-up panel
3. **Menu** (hamburger ☰) - opens settings slide-up panel

**Icon style:**
- Clean SVG line icons, 22px, `--text-secondary` color
- Active state: `--accent-cyan` fill
- Tap target: 44x44px minimum for accessibility

**Menu Panel (slide-up sheet):**
- Slides up from bottom, dimmed backdrop behind
- Contains: Settings, Leaderboard, Reset Run, Bug Report, Logout
- Clean list items with icons
- Tap backdrop to dismiss
- Absorbs all 6 current utility-row icons (Settings, Leaderboard, Reset Run, Lookup, Logout, Bug Report) minus Lookup (stays visible) and Bots (stays visible)

**Bots Panel (slide-up sheet):**
- Shows 5 equipped chip slots as larger tiles (~72x72px)
- Shows inventory grid below
- Replaces current full-screen takeover (`#chip-equip-view`, slides in from right)

**Safe area:** `padding-bottom: env(safe-area-inset-bottom)` for iPhone home indicator.

---

## Animations (anime.js)

All UI transitions use anime.js, extending the existing combat effects.

| Transition | Effect | Duration |
|------------|--------|----------|
| Phase change (hub→explore, etc.) | Action area content fades out, new content slides up + fades in | 200ms |
| Button press | `scale(0.96)` on touch, spring back on release | 150ms |
| Narration box appear | Slides up from bottom of scene + fades in | 250ms |
| Narration box dismiss | Fades down + out | 200ms |
| Chip charge complete | Rarity-colored glow pulse on tile | 300ms, repeating |
| Player damage number | Float up from HP bar, fade out | 600ms |
| Panel slide-up (menu, bots) | Slides up from bottom edge, backdrop fades in | 250ms |
| Panel dismiss | Slides down, backdrop fades out | 200ms |
| Card flip (combat) | Y-axis rotation reveal | 250ms |

---

## Screens Summary

### Hub
- Scene: Home background, no enemy, no narration
- Status strip: Chip tiles + full HP bar
- Action area: 2 buttons (速習, 潜入)
- Toolbar: Lookup, Bots, Menu

### Level Select
- Currently renders as scrollable vertical list of level cards in the action area
- Level cards show: number, Japanese name, English name, status badge (✓ / NEW / 🔒)
- Clean overlay card on top of hub scene
- "戻る" (Back) button returns to hub

### Exploration (room encounters, shrines, quiz, word discovery)
- Scene: Room-appropriate background + NPC sprite + narration
- Action area: Context-specific interactions (quiz answers, shrine options, etc.)

### Branch Selection (doors)
- Scene: Background + Chippy narration (door hints)
- Action area: Left door / Right door compact cards + 進む

### Combat
- Scene: Enemy sprite + name badge + HP bar + dialogue
- Status strip: Chips with charging indicators
- Action area: ATTACK card + DEFEND card, stacked, always visible
- Player damage: Floats near HP bar

### Combat - Pipeline Breakdown
- Renders inline in the action area (not an overlay)
- Progressive chip-by-chip animation: each chip fires energy particles from chip row to stat boxes
- Stat boxes show PWR, × BW, = DMG with values updating live as chips contribute
- Pipeline log lists individual chip contributions (activations, buffs, heals, sacrifices)
- Color-coded entries (heal = green, sacrifice = red, buff = cyan)
- Sequence takes 1-3s depending on number of active chips
- Restyle stat boxes and log entries to match new palette; keep the progressive reveal mechanic

### Post-Combat Shop
- Scene: NPC + bot sprite + narration
- Action area: Bot card with stats, swipe between offerings
- Refresh/Purchase buttons at bottom

### Chip Inventory (slide-up panel)
- 5 equipped slots as larger tiles
- Inventory grid below
- Tap chip for detail popup (PWR, HP, passive, skill)

### Chip Popup (in-combat)
- Slides up from tapped chip tile
- Shows: Bot name, level, PWR stat, HP stat
- Passive description
- Skill name + description + charge status
- "Swap" and "Use Skill" pill buttons

---

## What Changes vs. What Stays

### Changes
- Entire color palette (mint/cream → pale blue-grey/white)
- Narration box (dark semi-transparent bar with orange accent → white frosted bubble)
- Chip row (56px circles with 3px rarity borders → 52px rounded-rect tiles with 2px borders)
- Charge indicator (5 horizontal orange bar segments → 5 small dots below tile)
- Action area buttons (green/blue rounded buttons → compact white cards with soft shadows)
- Combat dual flashcards (expand-on-select with aspect-ratio 4/3 → fixed-height stacked cards, always both visible)
- Toolbar (6 always-visible icon buttons → 3 icons + hamburger menu absorbing the rest)
- Hub buttons (3 → 2, ボット装備/Equip Bots moved to toolbar Bots icon)
- Scene area (38vh → TBD, prototype between 38-50vh on real devices)
- Enemy-to-player damage feedback (large red number in action area → floats near HP bar)
- Chip inventory (full-screen takeover sliding from right → slide-up panel from bottom)
- All surface shadows, borders, and spacing

### Stays the Same
- Background images and character/enemy sprites
- Game flow and phase logic (all phases preserved)
- Combat mechanics and flashcard tap-to-flip + swipe-to-grade behavior
- anime.js combat effects (shake, flash, particles, speed lines) and speed-review card animations
- Tiered damage visual system (5 tiers based on % of enemy max HP)
- TTS playback
- Lookup mode functionality
- All backend/API logic (purely frontend changes)
- Phaser exploration canvas (hidden, display: none)

---

## Implementation Notes

- This is a CSS + HTML restructure. No backend changes.
- **Primary files to modify:**
  - `public/game.css` — Color variables, component styles, layout sizing
  - `public/game.html` — Utility row restructure (6 icons → 3 + menu), container classes
  - `public/js/ui/narration-box.js` — Restyle from dark bar to frosted bubble
  - `public/js/ui/chip-row.js` — Circle → rounded-rect tiles, charge dots
  - `public/js/ui/hp-bar.js` — Restyle HP bar to match new palette
  - `public/js/ui/exploration.js` — Hub button count (3→2), ward selection cleanup, level select restyling
  - `public/js/ui/actions.js` — Flashcard restyling, hub button generation
  - `public/js/ui/combat-loop.js` — Pipeline breakdown stat box restyling
  - `public/js/ui/combat-effects.js` — Damage number palette adjustment
  - `public/js/ui/scene.js` — Enemy info badge, damage number relocation
  - `public/js/ui/chip-select.js` — Shop card restyling
  - `public/js/ui/takeover.js` — Convert chip-equip from right-slide takeover to bottom slide-up panel
  - `public/js/ui/modals.js` — Menu panel (new slide-up sheet)
- **UI module barrel file:** `public/js/ui/index.js` re-exports 11 modules — new exports auto-available
- The anime.js library (`public/js/lib/anime.esm.min.js`) is used in `combat-effects.js` and `speed-review.js` — extend to UI transitions
- System fonts only (no font loading) — already using `-apple-system` stack
- Test on iPhone SE (375x667) through iPhone 15 Pro Max (430x932) to verify minimal-scroll constraint
- Frosted glass (`backdrop-filter`) is well-supported on iOS Safari
- Current rarity colors (common: #95a5a6, uncommon: #27ae60, rare: #3498db, epic: #8e44ad, legendary: #f39c12) will shift to the new rarity palette defined above
