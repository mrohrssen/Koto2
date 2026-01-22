# Combat Changes: Chip Levels & Chip Skills

## Summary

Add two interconnected features to the chip system:
1. **Chip Levels (1-7)** - Per-run leveling with +5% additive scaling per level
2. **Chip Skills** - Fixed active abilities with charge meters

---

## Specifications

### Chip Levels
- Per-run only (reset each new run)
- Additive scaling: L1=base, L2=+5%, L3=+10%... L7=+30%
- Level displayed on chip icon
- Full 7-level data structure defined now (leveling UI comes later)
- Hardcode level effects per chip type

### Chip Skills
- Each chip type has one fixed unique skill
- Popup: skill name + description + "Use Skill" button
- Popup appears near the clicked chip (not center modal)
- Uncharged: popup shows, button disabled
- Skills do NOT change with chip level
- Fixed values (no stat scaling)
- Combat only
- Instant skills (damage/heal) bypass pipeline
- Buff skills modify next pipeline execution
- Multiple buffs stack/combine

### Skill Activation Animation
- Full dramatic animation (~1 second)
- Visual glow + particle burst effect
- No sound effect
- Cyberpunk aesthetic (cyan/neon colors)

### Skill Meter
- Progress bar with division markers (showing 3/4/5 segments)
- All equipped chips gain +1 charge at end of each turn
- Default: 5 charges to activate
- Charges carry over between fights
- Start at 0 at run start
- Unequip resets charge to 0
- Glow effect when fully charged

### Combat Flow
- Skills usable before reviewing card (implicit, no new phase)
- Unlimited skills per turn (each resets that chip's meter to 0)
- Clicking chip shows popup anytime

---

## Proposed Skills for All 18 Chips

| Chip | Skill Name | Type | Effect | Charges |
|------|------------|------|--------|---------|
| **powerCell** | Power Surge | buff | Next attack +20 flat damage | 5 |
| **amplifier** | Overdrive | buff | Next attack x1.8 multiplier | 5 |
| **critBooster** | Precision Strike | buff | Next attack guaranteed crit | 5 |
| **overloader** | System Overload | instant | Deal 40 damage directly | 5 |
| **finisher** | Execute | buff | Next attack +100% vs enemies <30% HP | 5 |
| **recursion** | Infinite Loop | buff | Next pipeline runs twice | 5 |
| **sacrifice** | Emergency Shutdown | instant | Heal 30 HP | 5 |
| **stackOverflow** | Memory Dump | instant | Deal 5x current stack count as damage | 5 |
| **minimalist** | Zen Mode | buff | Next attack +60 if 2+ empty slots | 5 |
| **lifelink** | Life Surge | instant | Heal 25 HP | 5 |
| **bountyHunter** | Collect Bounty | instant | Deal (kills this run x 2) damage | 5 |
| **siphon** | Drain Life | instant | Heal 20 HP, deal 10 damage | 5 |
| **executiveOverride** | Authority | buff | Next attack +30% vs bosses | 5 |
| **phoenix** | Rebirth | buff | Survive next lethal hit with 1 HP | 5 |
| **unstable** | Controlled Chaos | buff | Next attack +80 damage, no destroy risk | 5 |
| **copycat** | Perfect Copy | buff | Next chip in pipeline triggers twice | 5 |
| **lightweight** | Featherweight | buff | Next attack +30 per empty slot | 5 |
| **burstCycle** | Instant Burst | instant | Deal 3x base weapon damage | 5 |

---

## Data Structure Changes

### chips.json - Add to each chip
```json
{
  "powerCell": {
    "id": "powerCell",
    "name": "パワーセル",
    "nameEn": "Power Cell",
    "effects": { /* existing */ },
    "levelScaling": {
      "type": "flatAdd",
      "baseValue": 5,
      "perLevelBonus": 0.05
    },
    "skill": {
      "id": "powerSurge",
      "name": "パワーサージ",
      "nameEn": "Power Surge",
      "description": "次の攻撃に+20ダメージ",
      "descriptionEn": "Next attack deals +20 damage",
      "type": "buff",
      "effect": { "nextAttackFlatBonus": 20 },
      "chargesRequired": 5
    }
  }
}
```

### Player State (state.js) - Add to run
```javascript
run: {
  player: {
    // ... existing ...
    chipCharges: {},    // { [chipId]: number }
    chipLevels: {},     // { [chipId]: 1-7 }
    activeBuffs: []     // Skill buffs for next pipeline
  }
}
```

---

## Implementation Order

### Phase 1: Data & Backend Core
1. **data/chips.json** - Add `levelScaling` and `skill` to all 18 chips
2. **data/chip-config.json** - Add level/skill constants
3. **src/game/state.js** - Add chipCharges, chipLevels, activeBuffs
4. **src/game/items/chips.js** - Level scaling functions, skill execution

### Phase 2: Combat Integration
5. **src/game/services/combat-service.js** - Charge increment at turn end
6. **src/game/combat/player-actions.js** - Apply activeBuffs in pipeline
7. **src/game/services/exploration-service.js** - Reset charges on unequip

### Phase 3: API Endpoints
8. **server.js** - Add `/api/game/use-chip-skill` and `/api/game/chip-details/:chipId`

### Phase 4: Frontend UI
9. **public/js/ui/combat.js** - Render skill meters, level badges, glow
10. **public/js/ui/character.js** - Chip popup with skill button
11. **public/js/ui/realtime-combat.js** - Skill usage flow
12. **public/game.css** - Level badge, meter, glow, popup styles

### Phase 5: Testing
13. Run e2e tests, fix any regressions

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `data/chips.json` | Add levelScaling + skill definitions |
| `data/chip-config.json` | Level scaling constants |
| `src/game/state.js` | chipCharges, chipLevels, activeBuffs |
| `src/game/items/chips.js` | getChipEffectAtLevel(), executeChipSkill() |
| `src/game/services/combat-service.js` | Charge increment, skill execution |
| `src/game/combat/player-actions.js` | Apply buffs before pipeline |
| `public/js/ui/combat.js` | Skill meters, level badges, glow |
| `public/js/ui/character.js` | Chip popup UI |
| `public/js/ui/realtime-combat.js` | useChipSkillInCombat() |
| `public/game.css` | New styles |

---

## Verification

1. Start a new run - all chips should be level 1 with 0 charges
2. Complete a turn - all equipped chips should gain +1 charge
3. After 5 turns - chips should glow when fully charged
4. Click charged chip - popup should show with enabled "Use Skill"
5. Use an instant skill - damage/heal should apply immediately
6. Use a buff skill - next attack should be modified
7. Charges should persist between combats
8. Unequipping a chip should reset its charges
9. Run e2e tests: `./scripts/e2e-test.sh`
