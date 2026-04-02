# Visual Feedback System Design

**Date:** 2026-03-30
**Status:** Approved
**Problem:** Playtesting revealed that players cannot tell what happened after most actions — stat changes, skill procs, item effects, and exploration events are invisible or too subtle.

## Motivation

A real user playtested the game and had no idea what was going on. Damage numbers during combat read fine (the 5-tier system works), but everything surrounding the damage — buffs, debuffs, skill procs, type effectiveness, item acquisition, credits, level-ups at shrines, skill selection — was invisible. The player felt like things "just happened" without understanding what or why.

## Design Principles

1. **Feedback appears where it happened** — floating text rises from the creature that got buffed, not in a distant log.
2. **Non-blocking** — no modal popups or pauses for routine events. The game flow continues.
3. **Consistent visual language** — the player learns one pattern: green up = good for you, red/purple down = bad, gold = gained something, amber = notable event.
4. **Two layers** — transient popups for events as they happen, persistent icons for ongoing state.

## System 1: Unified Event Popup Module

**New file:** `public/js/ui/event-popup.js`

A single reusable function that handles ALL contextual floating feedback in the game. Everything funnels through one animation pattern with different parameters.

### Core API

```js
showEventPopup(targetEl, text, {
  color,           // text color (string)
  particles,       // particle burst count, 0 = none (number)
  particleColor,   // defaults to color (string)
  direction,       // 'up' (default) or 'down' for debuffs (string)
  icon,            // optional small icon/sprite path before text (string|null)
  size,            // 'small' | 'normal' | 'large' (string)
  duration         // ms before auto-remove, default 1200 (number)
})
```

### Animation

- Text element created, positioned relative to `targetEl` center.
- Floats 40-50px in `direction` over `duration`.
- Opacity fades from 1 to 0 over the last 30% of duration.
- Scale pops in: 0 → 1.1 → 1.0 over first 150ms.
- Optional particle burst from `targetEl` using existing `spawnParticles` from `combat-effects.js`.
- Element auto-removed from DOM after animation completes.

### Presets

Convenience functions that call `showEventPopup` with baked-in parameters:

| Preset | Text Example | Color | Particles | Size | Direction |
|--------|-------------|-------|-----------|------|-----------|
| `buff(el, text)` | `ATK ↑` | Amber `#FF8F00` | 6, amber | normal | up |
| `debuff(el, text)` | `ATK ↓` | Purple `#7B1FA2` | 4, purple | normal | down |
| `heal(el, text)` | `+32 HP` | Green `#4CAF50` | 6, green | normal | up |
| `itemGained(el, text)` | `+Onigiri` | White `#FFFFFF` | 4, white | normal | up |
| `credits(el, amount)` | `+50¤` or `-50¤` | Gold `#FFD700` if positive, Red `#F44336` if negative (auto-detected from sign) | 0 | normal | up |
| `effectiveness(el, text)` | `Super Effective!` | Amber `#FFB300` | 0 | large | up |
| `resistedEffectiveness(el, text)` | `Resisted...` | Gray `#9E9E9E` | 0 | small | up |
| `skillProc(el, text)` | `Quick Strike! +12` | Gold `#FFD700` | 6, gold | large | up |

### Visual Language (Consistent Across Entire Game)

- **Green floating up** = something good happened to this creature (heal, buff applied)
- **Red/purple floating down** = something bad happened (debuff, poison)
- **Gold floating up** = you gained something (XP, credits, items)
- **Amber large text** = notable combat event (super effective, skill proc)
- **Gray small text** = reduced/null effect (resisted, immune)

## System 2: Persistent Status Icons

Status icon badges rendered beneath each creature's HP/MP bars showing active effects at a glance.

### Placement

Inside each `.formation-slot`, after the `.formation-info` div, a new `.status-icons` container. Small, unobtrusive, always visible during combat.

### Icon Design

Tiny colored pill badges, ~14px tall, with short text abbreviation:

| Effect | Label | Background | Text Color |
|--------|-------|-----------|------------|
| Poison | `PSN` | `#9C27B0` purple | White |
| ATK Up | `ATK↑` | `#FF8F00` amber | White |
| ATK Down | `ATK↓` | `#7B1FA2` purple | White |
| DEF Up | `DEF↑` | `#1976D2` blue | White |
| Shield | `SHD` | `#00ACC1` cyan | White |
| Haste | `SPD↑` | `#29B6F6` light blue | White |
| Stun | `STUN` | `#F9A825` yellow | Black |
| Sleep | `SLP` | `#78909C` gray | White |
| Confuse | `CONF` | `#FDD835` yellow | Black |

### CSS

```css
.status-icons {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  min-height: 16px;
}

.status-icon {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 6px;
  color: white;
  line-height: 1.2;
  white-space: nowrap;
}
```

### Behavior

- Icons **pop in** when applied (scale 0 → 1.1 → 1, 200ms).
- Icons **fade out** when the effect expires (opacity 1 → 0, 200ms).
- Multiple icons stack horizontally, wrapping if needed.
- Applied to BOTH player AND enemy creatures.
- Synced via `updateStatusIcons(slotEl, activeEffects[])` after each combat round.

### API

```js
// Called after each combat round resolves
updateStatusIcons(slotEl, [
  { type: 'poison', remainingTurns: 2 },
  { type: 'attack_buff', remainingTurns: 3 }
])
```

### Client-Side State

A simple map tracking active effects per creature: `Map<creatureId, [{type, remainingTurns}]>`. Updated from `effectEvents` and creature status in server combat results. Cleared on combat end.

## System 3: Type Effectiveness Labels

After damage numbers display, show a secondary effectiveness label with slight delay.

### Behavior

- **Super effective:** `effectiveness(targetEl, 'Super Effective!')` — amber, large text, 400ms delay after damage number. Screen shake bumps up one tier.
- **Not very effective:** `resistedEffectiveness(targetEl, 'Resisted...')` — gray, small text, 400ms delay. Screen shake drops one tier.
- **Immune/null:** `resistedEffectiveness(targetEl, 'No Effect')` — dark gray, small text.

### Data

The server combat result already includes `typeMultiplier` or element matchup data. The client checks this after displaying damage and triggers the appropriate effectiveness popup.

## System 4: Skill Proc Banner Relocation

Party skill procs currently show text in the action area (below the scene), which players don't notice.

### Changes

- Move proc announcement from action area to **scene area** — show as a floating banner between formations.
- Use `skillProc` preset: gold, large size, with particles.
- Flash the source creature (the one whose skill triggered) using existing `flashElement`.
- Keep existing particle effects for the specific proc types (bonus damage → particles on enemy, healAll → green particles on allies, etc.).
- Remove the `.party-skill-proc` DOM element creation in action area.

## System 5: Exploration Event Feedback

All exploration events use the unified event popup system. No new UI paradigms.

### Shrine Level-Up

When a creature is leveled up at a shrine:
1. Creature sprite flashes (brightness pulse).
2. `buff(creatureEl, 'Level Up!')` — large gold popup.
3. Stat gain pills float up staggered: `buff(creatureEl, '+5 HP')`, then `buff(creatureEl, '+2 ATK')` 300ms later.

### Skill Acquired (Skill Master Room)

When player selects a party skill:
1. Selected card does `pop` animation (scale overshoot).
2. Colored particles matching skill type burst from card.
3. `itemGained(cardEl, 'Skill Acquired!')` toast.

### Item Received (Friendly NPC, Quiz Reward, Post-Combat Shop)

When player receives an item:
1. Item card pops (scale overshoot via existing `pop` utility).
2. `itemGained(cardEl, '+Item Name')` floats up.
3. SFX: `creature-equip` (existing sound, appropriate for acquisition).

### Dealer Buy

When player buys a creature:
1. `credits(counterEl, '-80¤')` in red floats up from credits display.
2. Credits counter animates down (number ticks from old → new value).
3. Purchased creature card does brief glow.

### Dealer Sell

When player sells a creature:
1. Creature card fades out (opacity 1 → 0, 300ms).
2. `credits(counterEl, '+40¤')` in gold floats up from credits display.
3. Credits counter animates up.

### Creature Befriend (Post-Combat)

When a creature joins the party:
1. `buff(creatureEl, 'New Ally!')` — large, gold.
2. Creature sprite slides into party formation.
3. Particle burst from the new creature slot.

## System 6: Currency Counter Animation

An animated credits display during dealer/shop interactions.

### Behavior

- When credits change, the displayed number **ticks** from old value to new value over 400ms (like an arcade score counter).
- Spending: number ticks down, brief red flash on the counter.
- Earning: number ticks up, brief gold flash on the counter.
- Uses `requestAnimationFrame` for smooth interpolation.
- Only active during screens where credits are displayed (dealer, post-combat shop).

### Implementation

A small utility function:

```js
animateCounter(element, fromValue, toValue, duration, { flashColor })
```

## Files Affected

### New Files
- `public/js/ui/event-popup.js` — unified popup system + status icons + currency animation

### Modified Files
- `public/js/ui/scene.js` — add `.status-icons` container to `showFormation()` slot rendering
- `public/js/ui/combat-loop.js` — integrate event popups for type effectiveness, relocate skill proc banners, call `updateStatusIcons` after each round
- `public/js/ui/exploration.js` — add event popups to shrine, skill master, friendly NPC, dealer interactions
- `public/js/ui/economy.js` — add credits animation and event popups to dealer buy/sell
- `public/js/ui/post-combat-shop.js` — add item acquisition popup on selection
- `public/game.css` — styles for `.status-icons`, `.status-icon`, event popup animations

### Unchanged Files
- `public/js/ui/combat-effects.js` — reused as-is (spawnParticles, flashElement, pop, etc.)
- XP popup and level-up glow systems — left untouched

## Out of Scope

- Sound effects for new popups (can be added later as a follow-up)
- Combat damage tier system (already works well)
- XP popups and level-up glow (already handled, not touching)
- Move execution feedback (handled by split attack cards)
- Vocab card interactions (not a combat mechanic)
- Button press juiciness / general responsiveness (separate concern from legibility)
