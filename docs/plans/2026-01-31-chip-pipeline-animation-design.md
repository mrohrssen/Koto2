# Chip Pipeline Animation Design

## Overview

Replace the current combat display that shows final damage immediately with an animated build-up that reveals PWR and BW values as each chip fires.

**Current behavior:** Formula `PWR 6 × (1 + BW 0) = 6` appears instantly, then chips are listed.

**New behavior:** Two stat boxes start at PWR 0 and BW ×1, numbers climb as each chip activates, damage revealed at end.

## Visual Design

### Layout

Two stat boxes side by side, centered in action area:

```
┌─────────┐   ┌─────────┐
│ PWR  0  │   │ BW  ×1  │
└─────────┘   └─────────┘
```

After chips fire, damage box appears:

```
┌─────────┐   ┌─────────┐   ┌─────────┐
│ PWR  8  │ × │ BW ×1.5 │ = │   12    │
└─────────┘   └─────────┘   └─────────┘
```

### Number Formatting

- **PWR:** Integer (e.g., `8`, `16`, `20`)
- **BW:** Effective multiplier with × prefix (e.g., `×1`, `×1.5`, `×2`)
- **Damage:** Integer, snaps to final value (no count-up animation)

### Animation Flow Per Chip

Each chip's contribution breaks into distinct visual beats:

1. **Chip activates** - Slot glows, SFX plays
2. **Base PWR added** - PWR box updates with pulse, log line appears (~200ms)
3. **Base BW added** - BW box updates with pulse, log line appears (~200ms)
4. **Passive triggers** - Box updates with pulse, log line appears (~200ms)
5. **Next chip starts**

### Example Sequence

**Initial state:**
```
┌─────────┐   ┌─────────┐
│ PWR  0  │   │ BW  ×1  │
└─────────┘   └─────────┘
```

**Battery Bot activates (+8 PWR base stat):**
```
┌─────────┐   ┌─────────┐
│ PWR  8  │   │ BW  ×1  │
└─────────┘   └─────────┘
  • Battery Bot: +8 PWR
```

**Amplifier activates (+2 PWR base, ×2 PWR passive):**
```
┌─────────┐   ┌─────────┐
│ PWR 10  │   │ BW  ×1  │
└─────────┘   └─────────┘
  • Battery Bot: +8 PWR
  • Amplifier: +2 PWR
```
Then passive triggers:
```
┌─────────┐   ┌─────────┐
│ PWR 20  │   │ BW  ×1  │
└─────────┘   └─────────┘
  • Battery Bot: +8 PWR
  • Amplifier: +2 PWR
  • Amplifier: ×2 PWR
```

**Final reveal:**
```
┌─────────┐   ┌─────────┐   ┌─────────┐
│ PWR 20  │ × │ BW  ×1  │ = │   20    │
└─────────┘   └─────────┘   └─────────┘
  • Battery Bot: +8 PWR
  • Amplifier: +2 PWR
  • Amplifier: ×2 PWR
```

## Display Log Format

Each action gets its own line as it happens:

| Event | Display Line | Style |
|-------|--------------|-------|
| Base stat PWR | `• Chip Name: +N PWR` | default |
| Base stat BW | `• Chip Name: +N BW` | default |
| Passive adds PWR | `• Chip Name: +N PWR` | default |
| Passive adds BW | `• Chip Name: +N BW` | default |
| Passive multiplies PWR | `• Chip Name: ×N PWR` | default |
| Passive multiplies BW | `• Chip Name: ×N BW` | default |
| Heal | `• Chip Name: +N HP` | green |
| Conditional miss | `• Chip Name: (no trigger)` | dimmed |
| Sacrifice | `• Chip Name: SACRIFICED` | red |

## Data Structure

### Server Response

Modify `executeChipPipeline()` to return a step-by-step sequence:

```javascript
{
  finalDamage: 20,
  powerPool: 20,
  bandwidthPool: 0,  // Raw value (×1 effective)
  firedChips: [...],  // Keep for backwards compatibility
  sequence: [
    { type: 'activate', chipId: 'battery', chipName: 'Battery Bot' },
    { type: 'base', chipId: 'battery', chipName: 'Battery Bot', power: 8 },
    { type: 'activate', chipId: 'amplifier', chipName: 'Amplifier' },
    { type: 'base', chipId: 'amplifier', chipName: 'Amplifier', power: 2 },
    { type: 'effect', chipId: 'amplifier', chipName: 'Amplifier', powerMult: 2 },
    { type: 'heal', chipId: 'onigiri', chipName: 'Onigiri Bot', hp: 5 },
    { type: 'sacrifice', chipId: 'charcoal', chipName: 'Charcoal Bot' },
    { type: 'noTrigger', chipId: 'conditional', chipName: 'Some Chip' },
  ]
}
```

### Sequence Event Types

| Type | Fields | Description |
|------|--------|-------------|
| `activate` | `chipId`, `chipName` | Chip slot glows, SFX plays |
| `base` | `chipId`, `chipName`, `power?`, `bandwidth?` | Base stat contribution |
| `effect` | `chipId`, `chipName`, `powerAdd?`, `powerMult?`, `bandwidthAdd?`, `bandwidthMult?` | Passive effect |
| `heal` | `chipId`, `chipName`, `hp` | Healing effect |
| `sacrifice` | `chipId`, `chipName` | Chip destroyed |
| `noTrigger` | `chipId`, `chipName` | Conditional didn't fire |

## Implementation

### Files to Modify

1. **`src/game/items/chips.js`**
   - Modify `executeChipPipeline()` to build `sequence` array
   - Track each step as it happens during first and second pass
   - Include `activate` event when starting each chip

2. **`public/js/ui/combat-loop.js`**
   - Replace `showChipActivationSequence()` with new animation logic
   - Render stat boxes with initial values
   - Loop through `sequence`, updating boxes and appending log lines
   - Reveal damage box after sequence completes

3. **`public/game.css`**
   - Add `.stat-box` styles for PWR/BW/damage boxes
   - Add `.stat-pulse` animation for number changes
   - Style log lines by type (heal green, sacrifice red, noTrigger dimmed)

### Edge Cases

- **No chips equipped:** Show `PWR 0 × BW ×1 = 0` immediately
- **Critical hit:** Show "CRITICAL HIT!" banner first, then start build-up
- **Cascade damage:** Append after main sequence
- **DoT damage:** Show after main sequence (existing behavior)

### Timing

- **Between steps within a chip:** ~200ms
- **Chip activation (slot glow):** Use existing timing
- **Final damage reveal:** 300ms pause after last step

## Security

Server remains authoritative. Client only animates the sequence reported by server - no local calculation of damage values.
