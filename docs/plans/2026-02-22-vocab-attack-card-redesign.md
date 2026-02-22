# Vocab Attack Card Redesign — Split Card with Click-to-Continue

**Date:** 2026-02-22
**Status:** Approved

## Problem

The current vocab attack card (`buildVocabAttackCard` in `combat-loop.js`) shows three rows of text simultaneously with minimal visual hierarchy. Players don't have time to absorb the vocabulary. The card auto-dismisses after a fixed 400ms delay, which is too fast for learners and too slow for speed players — nobody is happy.

## Design

A horizontal split card with the attacker's sprite on the left and vocab rows on the right. Uses the game's existing creature-card design language (element-tinted borders, dark panels, `data-element` color system). The card stays on screen until the player taps to continue — fast readers tap instantly, learners read at their own pace.

### Layout

```
┌──────────┬──────────────────────────────┐
│          │    かめ                        │
│ [sprite] │   亀              turtle BASE │  ← base word row
│ カメドル  │──────────────────────────────│
│          │    か                          │
│          │   噛む             Bite  ATK  │  ← skill row
│          │──────────────────────────────│
│          │ → [sprite] チョウリ      -22  │  ← impact row
└──────────┴──────────────────────────────┘
                                        ▼   ← tap to continue
```

**Left panel (72px wide):**
- Attacker sprite (52x52, pixelated, centered)
- Attacker Japanese name below (9px, element-light color)
- Background: creature-card `cc-hero` gradient pattern — `linear-gradient(135deg, element-bg-color, rgba(0,0,0,0.3))`

**Right panel (flex: 1):**
- Two vocab rows + one impact row
- Background: `rgba(0,0,0,0.3)` (matches `cc-chip` backgrounds)
- Each vocab row:
  - Japanese text with furigana (18px bold white, ruby text over kanji)
  - English meaning + tag pill (10px grey) — right-aligned
  - Tag pills: `BASE` (muted) and `ATK` (red tint, matching `cc-sk-tag.atk`)

**Furigana (ruby text):**
- Use HTML `<ruby>` tags: `<ruby>亀<rt>かめ</rt></ruby>`
- Only shown when word contains kanji (reading differs from word text)
- `rt` font size: ~8px, positioned above the kanji
- Helper function `wrapWithRuby(word, reading)` detects kanji and wraps accordingly

**Impact row:**
- Arrow `→` (element-light color) + target sprite (20px, round) + target Japanese name (12px) + damage `-XX` (16px red, right-aligned)
- Subtle red tint background: `rgba(239,83,80,0.06)`
- Red top border: `1px solid rgba(239,83,80,0.1)`

**Card border:** 1px solid element color at 40% opacity — reuses existing `.creature-card[data-element]` border colors.

**Card radius:** 12px (matches `--card-radius`).

**Max width:** 320px centered in the action-area.

### Element Colors

Reuse the same element tint system as creature cards (no new colors):

| Element | Border | Gradient bg | Light text |
|---------|--------|-------------|------------|
| water | `rgba(33,150,243,0.4)` | `rgba(33,150,243,0.15)` | `#64B5F6` |
| fire | `rgba(244,67,54,0.4)` | `rgba(244,67,54,0.15)` | `#EF9A9A` |
| earth | `rgba(141,110,99,0.4)` | `rgba(141,110,99,0.15)` | `#BCAAA4` |
| metal | `rgba(158,158,158,0.4)` | `rgba(158,158,158,0.15)` | `#BDBDBD` |
| wood | `rgba(76,175,80,0.4)` | `rgba(76,175,80,0.15)` | `#A5D6A7` |

### Fast Reveal + Click-to-Continue

The reveal is fast (~200ms total), then the card waits for the player's tap:

1. **0ms** — Card fades in. All three rows animate in rapidly (50ms stagger, 100ms each).
2. **~200ms** — All rows visible. Damage effects fire immediately (shake, hurt, SFX). `▼` indicator appears.
3. **Card waits for tap.** Player controls the pace.
4. **On tap:** 100ms fade-out, next combat step proceeds.

For a speed player: ~200ms reveal + instant tap + 100ms fade = **~300ms per attack** (faster than current 400ms).

Timing constants extracted for easy tuning:
```js
const ATTACK_CARD_TIMING = {
  ROW_STAGGER: 50,        // ms between row reveals
  ROW_ANIM_DURATION: 100,  // each row's slide-in
  FADE_OUT_DURATION: 100    // card dismissal
};
```

Each row starts at `opacity: 0; transform: translateX(-8px)` and transitions to `opacity: 1; transform: translateX(0)`.

### Click-to-Continue Indicator

After rows are revealed:
- A small `▼` indicator appears at the bottom-right of the card
- Same style as narration-box indicator: cyan, pulsing glow animation
- Player taps the card (or anywhere in `action-area`) to dismiss
- Card fades out (100ms), then the next combat step proceeds

### Implementation: Promise-Based Tap Gate

A single async function `showAttackCardAndWait(atk, isEnemy)`:
1. Builds card HTML, inserts into `action-area`
2. Runs fast staggered reveal via CSS animation delays
3. Fires damage effects at ~200ms (SFX, shake, hurt animation)
4. Shows `▼` indicator
5. Returns a `Promise` that resolves when user clicks action-area
6. On click: fades out card, resolves promise

This replaces both `buildVocabAttackCard()` and the `await delay(400)` calls throughout the combat loop. The combat loop's async/await structure stays the same — we just swap the delay for a richer await.

### Multi-Robot Combat

Every individual attack gets its own card + tap:
- In `executeRobotPlayerAttack`: each allied robot's attack shows a card, waits for tap
- In `showEnemyAttacksAnimated`: each enemy's attack shows a card, waits for tap
- The `for` loops replace `await delay(400)` with `await showAttackCardAndWait(atk, isEnemy)`

### Enemy Attack Variant

Same card layout, but:
- Left panel shows the **enemy** creature's sprite
- Impact row shows `→ [player robot sprite] PlayerRobotNameJp -XX`
- Card border uses the enemy's element color
- Damage number stays red (`--accent-red`)

### Data Requirements

Three new fields needed in attack objects from `robot-combat-service.js`:

| Field | Source | Purpose |
|-------|--------|---------|
| `attackerBaseReading` | `robot.baseReading` / `enemy.baseReading` | Ruby text for base word |
| `attackerSkillReading` | `robot.autoSkill.reading` / `enemy.autoSkill.reading` | Ruby text for skill name |
| `targetNameJp` | `target.name` | Impact row Japanese name |

All three are already available on the robot/creature objects — just not included in the attack result. Two lines added per attack builder.

`robots.js` `instantiateRobot()` needs `baseReading` added (same pattern as `baseMeaning`).

### Files to Modify

1. **`public/game.css`** — Replace `.vocab-attack-card` styles with `.split-attack-card` styles (horizontal layout, ruby sizing, element borders, fade/slide animations)
2. **`public/js/ui/combat-loop.js`** — New `showAttackCardAndWait()` async function + `wrapWithRuby()` helper; replace `buildVocabAttackCard` + `delay(400)` calls with it
3. **`src/game/services/robot-combat-service.js`** — Add `attackerBaseReading`, `attackerSkillReading`, `targetNameJp` to both player and enemy attack object builders
4. **`src/game/robots.js`** — Add `baseReading` to `instantiateRobot()`

### What This Does NOT Change

- Flash card / dual flash card system (attack/defend selection) — untouched
- Damage number floating animation (`showDamageNumber`) — still fires alongside the card
- Screen effects (shake, flash, particles, enemy recoil) — fire at impact reveal
- Combat loop structure — same async/await flow, just the attack display step changes
- Ultimate attack display — out of scope, keep current behavior
