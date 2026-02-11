# Robot Combat V1 Design: Multi-Enemy, Swapping, Post-Combat Shop

> Builds on the MVP (single-enemy, attack/defend/befriend/ultimate). Adds three features to deepen combat and progression.

---

## 1. Multi-Enemy Encounters

Encounters now spawn 1-3 enemy robots using weighted random:

| Enemy Count | Weight |
|-------------|--------|
| 1           | 60%    |
| 2           | 30%    |
| 3           | 10%    |

Each enemy is generated independently via `generateEnemyRobot()` — random element, random rarity, level scaled to player's highest robot.

### Frontend Layout

Enemy robots display in a horizontal row across the top of the combat screen, mirroring the ally slots at the bottom. Each enemy slot shows element icon, HP bar, and name — scaled down to fit 3 across. A single enemy centers itself.

### Targeting

The existing `selectTarget()` already works with arrays. Allies auto-target using element advantage priority; enemies do the same against your team. No algorithm changes needed.

### Ultimates

Still hit all enemies (AoE). With multiple enemies, a well-timed ultimate damages all of them — more valuable than in MVP.

### Befriend

Still targets the lowest-HP enemy at ≤50%. Befriending removes that enemy from the fight and adds it to your party. Combat continues with remaining enemies.

### Victory/Defeat

- **Victory**: All enemies at 0 HP or befriended.
- **Defeat**: All active allies at 0 HP with no reserves.

---

## 2. In-Combat Robot Swapping

Swap active robots with reserves using the existing robot popup.

### UI

Tap an active robot slot during combat to open the existing popup (name, element, HP, ATK, ultimate button). A "Swap" button appears below the ultimate button. Tapping it shows your reserve robots as selectable options within the same popup — element icon, name, HP, level. Tap a reserve to confirm the swap.

KO'd active slots show the popup with only the Swap button (no ultimate available).

### Free Window

Before you pick an action card (attack/defend/befriend), swapping via the popup is free and unlimited. Rearrange your whole team if you want. Once you commit to an action card and the turn resolves, the free window closes.

### Paid Swap

After committing to an action, swapping on your next turn costs your entire action. No vocab card, no attack. The enemy still attacks you. This makes mid-combat repositioning a real cost.

### State Tracking

A `swapPhase` flag on the combat state:
- `true` at the start of each player turn (free swaps allowed)
- Set to `false` after an action card is played
- When `false`, swapping triggers an enemy-only turn

### Auto-Swap on KO

The MVP auto-swap (reserve fills KO'd slot) still works as a fallback. Manual swapping gives the player control over which reserve comes in.

### API

`POST /api/game/swap-robot` with `{ activeIndex, reserveIndex }`. Server validates both indices, performs the swap on `robotParty`, and returns updated party state. If `swapPhase` is false, also triggers enemy attacks.

---

## 3. Post-Combat Item Shop

After every combat victory, before returning to exploration, a shop screen appears. Three items are drawn at random from a pool of 10. The player picks exactly one — no skip option.

### Item Pool (10 items)

**Stat boosts** (permanent for the run, apply to whole team, stack):

| # | Name | Effect |
|---|------|--------|
| 1 | ATK Boost | All robots +2% attack |
| 2 | HP Boost | All robots +2% max HP (and heal that amount) |
| 3 | Auto Power | All robots +3% auto-skill power |
| 4 | Ultimate Power | All robots +5% ultimate power |
| 5 | Element Edge | Super-effective multiplier +0.05 |
| 6 | Thick Armor | All incoming damage reduced by 1 flat |

**Heal/utility** (one-time, immediate):

| # | Name | Effect |
|---|------|--------|
| 7 | Team Heal | Heal all robots for 25% of max HP |
| 8 | Patch Up | Heal the most damaged robot to full |
| 9 | Revive | Revive one random KO'd robot at 30% HP |
| 10 | Quick Charge | All robots gain +2 ultimate charges |

### Storage

Stat boost items are tracked on `run.itemBuffs` as stacking multipliers/values. Heal/utility items apply immediately and are not stored.

```javascript
run.itemBuffs = {
  attackMult: 1.0,        // +0.02 per ATK Boost
  hpMult: 1.0,            // +0.02 per HP Boost
  autoPowerMult: 1.0,     // +0.03 per Auto Power
  ultimatePowerMult: 1.0, // +0.05 per Ultimate Power
  elementEdge: 0,         // +0.05 per Element Edge (added to 1.5 base)
  flatDamageReduction: 0  // +1 per Thick Armor
}
```

### Damage Formula Update

The existing formula `max(1, floor((attack/10) × power × elementMult × variance))` becomes:

```
attack   = baseAttack × attackMult
power    = abilityPower × autoPowerMult (or ultimatePowerMult for ultimates)
elemMult = baseElementMult + elementEdge
damage   = max(1, floor((attack/10) × power × elemMult × variance))
```

Incoming damage: `max(1, damage - flatDamageReduction)`

### Frontend

Simple three-card layout after the victory screen. Each card shows item name and one-line description. Tap to pick. The screen dismisses and returns to exploration.

---

## Implementation Scope

### New Files
- `data/items.json` — 10 item definitions
- `src/game/services/item-service.js` — item application logic
- `public/js/ui/post-combat-shop.js` — shop UI

### Modified Files
- `src/game/robots.js` — `generateEnemyRobot` updated for multi-spawn
- `src/game/services/robot-combat-service.js` — multi-enemy combat, swap handling, item buff integration
- `src/game/services/combat-service.js` — wire multi-enemy and shop into combat flow
- `src/game/state.js` — add `itemBuffs` to run state, `swapPhase` to combat state
- `src/game/loop.js` — swap and shop endpoints
- `src/routes/game/combat.js` — swap-robot and shop endpoints
- `public/js/ui/robot-row.js` — swap button in popup, reserve picker
- `public/js/ui/scene.js` — multi-enemy display (horizontal row)
- `public/js/ui/combat-loop.js` — swap flow, shop trigger after victory
- `public/js/api.js` — new API functions
- `public/game.css` — multi-enemy slots, shop card styles

### Test Coverage
- Unit: multi-enemy generation, swap validation, item buff stacking, damage formula with buffs
- Integration: full combat cycle with 3 enemies, swap + attack sequence, shop selection
- E2E: multi-enemy display, swap via popup, shop appears after victory
