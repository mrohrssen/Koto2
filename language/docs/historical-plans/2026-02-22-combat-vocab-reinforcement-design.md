# Combat Vocab Reinforcement Cards

## Problem

Combat is a missed learning opportunity. When creatures attack, the action-area shows only English names and damage numbers ("Hikaribon 25ダメージ！"). The creature's Japanese name, base vocabulary word, and attack skill name — all carefully designed to teach Japanese — are invisible during the moment players are most engaged.

## Solution

Replace the plain attack text with a **neon edge card** that displays three vocab rows with icons every time a creature attacks. Both player and enemy attacks show this card, doubling vocab exposure per round.

## Layout

```
┌──────────────────────────────┐
│▌ [creature sprite]  カメドル  │  ← creature's Japanese name
│▌ [creature sprite]  亀       │  ← base word (the vocab root)
│▌ [action icon]      噛む     │  ← attack skill name (Japanese)
└──────────────────────────────┘
         25 ダメージ！
```

### Styling

- **Left border**: 3px solid, element-colored glow
  - Water: `#4fc3f7`, Fire: `#ff5252`, Wood: `#66bb6a`, Earth: `#ffb74d`, Metal: `#b0bec5`
- **Card background**: `rgba(0,0,0,0.6)` with `backdrop-filter: blur(4px)`
- **Enemy variant**: Red-tinted left border (`#ff5252`), red damage text (matches existing `.enemy` style)
- **Icons**: 24px, left-aligned, vertically centered per row
- **Text**: 15px, `font-weight: semi`, left-aligned next to icons
- **Damage**: Centered below card, current pop-in scale animation preserved
- **Animation**: Card fades in (200ms), rows stagger slightly (50ms each)

### Icon Sources

| Row | Content | Icon Source |
|-----|---------|-------------|
| 1 - Creature Name | Japanese name (e.g. カメドル) | Creature sprite: `sprites/{id}-idle.webp` at 24px |
| 2 - Base Word | Root vocab (e.g. 亀) | Same creature sprite (creature IS the word visually) |
| 3 - Attack Name | Skill name (e.g. 噛む) | Action icon: `sprites/actions/{nameEn-lowercase}.webp` |

The 90+ action icons in `public/assets/sprites/actions/` are currently unused — this feature puts them to work.

## Server Changes

The attack response object (`processAttackTurn` in `robot-combat-service.js`) currently sends:

```js
{ attackerId, attackerName, attackerElement, targetId, targetName,
  damage, elementMultiplier, targetDefeated, attackerCharges, attackerChargesRequired }
```

Add four fields to each attack object:

```js
{
  attackerNameJp: robot.name,              // "カメドル"
  attackerBaseWord: robot.baseWord,        // "亀"
  attackerSkillName: robot.autoSkill.name, // "噛む"
  attackerSkillEn: robot.autoSkill.nameEn, // "Bite" (for icon path lookup)
}
```

Same additions for enemy attacks in `processEnemyTurn`.

## Frontend Changes

### combat-loop.js

Replace the current `actionArea.innerHTML` assignments (lines ~597, ~767) with a call to a new rendering function that builds the neon edge card HTML. The function takes the attack object and returns the card markup.

### game.css

Add styles for:
- `.vocab-attack-card` — the card container with element border
- `.vocab-attack-row` — icon + text row (flexbox)
- `.vocab-attack-icon` — 24px icon sizing
- `.vocab-attack-card.enemy` — red-tinted variant
- Stagger animation keyframes

## Timing

Current attack display time is 400ms per attack. Keep this unchanged. The card is designed for at-a-glance scanning. Players absorb vocabulary through repeated exposure across many combat rounds, not deep reading of any single display.

## Language Learning Rationale

Each creature in this game is built from three connected Japanese words:
1. **Creature name** (katakana) — phonetic, easy to read
2. **Base word** (kanji) — the real vocab being taught (e.g. 亀 = turtle)
3. **Attack name** (verb/noun) — reinforces a second vocab word through action context

Showing all three together with visual icons creates a **word cluster** — the player sees how the words relate to each other and to the creature they already recognize visually. This is comprehensible input: the creature sprite is the known anchor, and the kanji words are the learning targets.
