# Combat System Guide

NEO TOKYO: System Liberation uses a **dual-pool damage system** where your equipped chips contribute to two separate pools: **Power** and **Bandwidth**. Understanding how these pools interact is the key to building devastating loadouts.

## The Damage Formula

```
DAMAGE = POWER x (1 + BANDWIDTH)
```

- **Power (PWR)**: Your base damage. Higher Power means bigger hits.
- **Bandwidth (BW)**: Your damage multiplier. Bandwidth amplifies your Power.

### Why This Matters

With 20 PWR and 0 BW:
```
DAMAGE = 20 x (1 + 0) = 20
```

With 20 PWR and 1.0 BW:
```
DAMAGE = 20 x (1 + 1.0) = 40
```

With 20 PWR and 2.0 BW:
```
DAMAGE = 20 x (1 + 2.0) = 60
```

Bandwidth scales your damage multiplicatively. A little extra Bandwidth goes a long way when you have high Power.

---

## Chip Types

Every chip has **base stats** (PWR and BW added to your pools) and many have **passive effects** that trigger during combat.

### Pure Power Chips

These chips stack raw damage. Great for reliable, consistent hits.

| Chip | Stats | Effect |
|------|-------|--------|
| **Battery** | +8 PWR | None (pure stat stick) |
| **Scissors** | +3 PWR | +10 PWR if enemy below 30% HP |
| **Onigiri** | +6 PWR | Heal 5 HP per attack |
| **Wallet** | +2 PWR | +0.5 PWR per kill this run |
| **Fireworks** | +15 PWR, +1 BW | 10% chance to destroy a chip |
| **Drum** | +4 PWR | x2 BW every 5th attack |

### Pure Bandwidth Chips

These chips amplify your damage through the multiplier. Devastating when combined with high Power.

| Chip | Stats | Effect |
|------|-------|--------|
| **Speaker** | +2 BW | 80% chance to x1.2 BW |
| **Glasses** | +1 BW | +0.3 BW per consecutive hit |
| **Book** | +1 BW | 25% chance to permanently stack +1 BW |
| **Key** | +2 PWR, +1 BW | x1.5 BW vs bosses |
| **Egg** | +1 BW | +1 BW per destroyed chip this run |
| **Magnifying Glass** | +1 BW | x1.3 to next chip's effect value |

### Balanced Chips

Mix of both pools with interesting effects.

| Chip | Stats | Effect |
|------|-------|--------|
| **Lightbulb** | +2 PWR, +1 BW | 50% chance to x1.5 BW |
| **Charcoal** | +5 PWR, +2 BW | **SACRIFICE**: x3 PWR, x2 BW, then destroyed |
| **Eraser** | +0 PWR, +0 BW | +12 PWR, +2 BW if 2+ slots empty |
| **Feather** | +0 PWR, +0 BW | +3 PWR, +0.5 BW per empty slot |
| **Toolbox** | +2 PWR | +2 PWR, +0.3 BW per equipped chip |

### Utility Chips

Special effects that modify the combat loop.

| Chip | Stats | Effect |
|------|-------|--------|
| **Clock** | +0 PWR, +0 BW | 7% chance to restart the entire pipeline |
| **Mirror** | +0 PWR, +0 BW | Copy the previous chip's effect |
| **Straw** | -3 PWR | +0.2 BW, heal 12 HP |

---

## Build Archetypes

### Power Stack

**Strategy**: Max out raw PWR, ignore BW.

**Core Chips**: Battery, Scissors, Onigiri, Wallet, Drum

**Example**: Battery + Battery + Scissors + Onigiri + Drum
- Base stats: 8+8+3+6+4 = **29 PWR**, **0 BW**
- Damage: 29 x (1+0) = **29 base**
- With Scissors proc (enemy low): 29+10 = **39 damage**
- Every 5th attack: **58 damage** (x2 BW = 1.0 BW)

**Pros**: Consistent, reliable damage every turn.
**Cons**: Lower ceiling; no big spikes.

---

### Bandwidth Amplifier

**Strategy**: Stack BW multipliers, then add just enough PWR to make them count.

**Core Chips**: Speaker, Glasses, Book, Lightbulb, Magnifying Glass

**Example**: Battery + Speaker + Glasses + Lightbulb + Magnifying Glass
- Base stats: 8+0+0+2+0 = **10 PWR**, 0+2+1+1+1 = **5 BW**
- Damage: 10 x (1+5) = **60 base**
- With effects triggering: BW can reach 8-10+, pushing damage to **90-110**

**Pros**: Massive damage ceiling when effects chain.
**Cons**: Inconsistent; bad luck = low damage turns.

---

### Balanced Build

**Strategy**: Mix PWR and BW for steady scaling.

**Core Chips**: Lightbulb, Key, Toolbox, Battery, Speaker

**Example**: Battery + Lightbulb + Key + Toolbox + Speaker
- Base stats: 8+2+2+2+0 = **14 PWR**, 0+1+1+0+2 = **4 BW**
- Toolbox bonus (5 chips): +10 PWR, +1.5 BW
- Total: **24 PWR**, **5.5 BW**
- Damage: 24 x (1+5.5) = **156 base**

**Pros**: Reliable AND scales well. Great for most content.
**Cons**: Not specialized; loses to focused builds in their niche.

---

### Empty Slot Build

**Strategy**: Run fewer chips to trigger Eraser and Feather synergies.

**Core Chips**: Eraser + Feather (with 3 empty slots)

**Example**: Eraser + Feather (3 empty slots)
- Eraser: +12 PWR, +2 BW (condition met: 3 empty >= 2)
- Feather: +9 PWR, +1.5 BW (3 empty x +3 PWR, +0.5 BW)
- Total: **21 PWR**, **3.5 BW**
- Damage: 21 x (1+3.5) = **94.5 damage**

With just 2 chips!

**Example with Mirror**: Eraser + Feather + Mirror
- Mirror copies Feather: another +9 PWR, +1.5 BW
- But now only 2 empty slots, so Feather and Mirror give less
- Eraser: +12 PWR, +2 BW (2 empty still >= 2)
- Feather: +6 PWR, +1 BW (2 empty)
- Mirror copies Feather: +6 PWR, +1 BW
- Total: **24 PWR**, **4 BW**
- Damage: 24 x (1+4) = **120 damage**

**Pros**: Efficient; high damage per chip.
**Cons**: No room for utility; vulnerable to chip destruction.

---

## Effect Order Matters

Chips fire **left to right** in your loadout. Order matters for:

### Magnifying Glass Placement

Magnifying Glass amplifies the **next** chip's effect by x1.3.

**Bad**: Speaker -> Magnifying Glass -> Battery
- Speaker triggers, MG amplifies... Battery (no effect to amplify)

**Good**: Magnifying Glass -> Speaker -> Battery
- MG amplifies Speaker's x1.2 BW effect to x1.26 BW

### Mirror Placement

Mirror copies the **previous** chip's effect.

**Bad**: Mirror -> Speaker -> Battery
- Mirror has nothing to copy (first slot)

**Good**: Speaker -> Mirror -> Battery
- Speaker fires, Mirror copies Speaker's x1.2 BW effect

### Stacking Effects

Put ramping chips early so they build stacks all fight.

**Good**: Glasses -> Speaker -> Battery
- Glasses starts stacking +0.3 BW/hit immediately
- By hit 5: +1.5 BW bonus

**Good**: Book early
- More chances to build permanent +1 BW stacks

---

## Example Build: The Amplifier

A well-optimized mid-game build:

```
Slot 1: Magnifying Glass (+1 BW, x1.3 next effect)
Slot 2: Speaker (+2 BW, 80% x1.2 BW)
Slot 3: Glasses (+1 BW, +0.3 BW/hit)
Slot 4: Lightbulb (+2 PWR, +1 BW, 50% x1.5 BW)
Slot 5: Battery (+8 PWR)
```

### Base Calculation

**Stats**: 10 PWR, 6 BW

**Base Damage**: 10 x (1+6) = **70**

### With Effects (Average Turn)

- Magnifying Glass: x1.3 to Speaker's effect
- Speaker (80% to trigger): x1.2 BW -> amplified to x1.26 BW
- Glasses (turn 3): +0.9 BW accumulated
- Lightbulb (50%): x1.5 BW

**Pools after effects**: ~10 PWR, ~11-13 BW

**Damage**: 10 x (1+12) = **130**

### Big Turn (Everything Procs)

- All multipliers hit
- Glasses at 5 stacks (+1.5 BW)
- Final BW: ~15+

**Damage**: 10 x (1+15) = **160**

---

## Quick Tips

1. **Battery is always good** - +8 PWR with no conditions is reliable.
2. **Speaker early** - The x1.2 BW compounds with other multipliers.
3. **Watch for synergies** - Charcoal + Egg: sacrifice fuels future runs.
4. **Empty slot builds** - Eraser + Feather can outdamage full loadouts.
5. **Position matters** - Amplifiers before multipliers, stackers early.
6. **Check your math** - Low PWR + high BW = multiplying a small number.

---

## Chip Skills

Each chip has an **active skill** that charges over 5 successful vocabulary answers. Skills provide powerful one-time effects like flat damage bonuses, multipliers, or healing. Check individual chip descriptions for skill details.

---

*Master the dual-pool system and your chips will carry you through even the toughest wards of Neo Tokyo.*
