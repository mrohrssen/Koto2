# Testing Progress for Pipeline Chips

## Current State (2026-01-17)

### What's Done

**Unit Tests** (`tests/unit/pipeline-chips.test.js`)
- 49 tests covering all 13 new pipeline chips
- Tests verify `executeChipPipeline()` returns correct values
- Run with: `npm run test:unit`

**E2E Tests** (`tests/e2e/`)
- 88 existing tests, all passing
- Cover general gameplay flow but not specific chip effects

**Bug Fixes**
- Fixed missing handlers in `realtimeAttackCycle()` for:
  - Sacrifice chip destruction
  - Lifelink/Siphon healing
  - Unstable Core random destruction
  - Stack Overflow/Burst Cycle combat stacks reset on kill
  - Bounty Hunter kill count increment

### What's Missing

**Integration Tests**

The unit tests verify the pipeline *calculates* correctly, but don't verify the game loop *uses* those calculations. This caused a bug where chips worked in the pipeline but effects weren't applied to game state.

Needed integration tests:

```javascript
// Example: tests/integration/chip-effects.test.js

describe('Sacrifice chip', () => {
  it('should remove chip from inventory after attack', () => {
    // Setup: GameManager with sacrifice chip equipped
    // Action: realtimeAttackCycle('player')
    // Assert: chip removed from player.chips and weapon.equippedChips
  });
});

describe('Siphon chip', () => {
  it('should heal player on attack', () => {
    // Setup: GameManager with siphon chip, player at 50 HP
    // Action: realtimeAttackCycle('player')
    // Assert: player.hp increased by 10
  });
});

describe('Bounty Hunter chip', () => {
  it('should gain damage after kills', () => {
    // Setup: GameManager with bounty hunter chip
    // Action: Kill 5 enemies
    // Assert: _runKills = 5, chip adds +5 damage
  });
});

describe('Stack Overflow chip', () => {
  it('should reset stacks on enemy death', () => {
    // Setup: Attack 3 times (build stacks)
    // Action: Kill enemy
    // Assert: _combatStacks reset, next combat starts at 0
  });
});
```

### Testing Pyramid

```
         ┌─────────────────────┐
         │    E2E Tests        │  ✅ 88 tests (UI/flow)
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │  Integration Tests  │  ❌ MISSING (game loop)
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │    Unit Tests       │  ✅ 49 tests (pipeline math)
         └─────────────────────┘
```

### Test Commands

```bash
npm run test        # Run all tests (unit + e2e)
npm run test:unit   # Run unit tests only (~80ms)
npm run test:e2e    # Run e2e tests (~6min)
```

### Chips Requiring Integration Tests

| Chip | Effect to Verify |
|------|------------------|
| Sacrifice | Chip removed from inventory |
| Lifelink | Player healed on attack |
| Siphon | Player healed on attack |
| Unstable Core | Random chip destroyed (10%) |
| Bounty Hunter | Damage scales with `_runKills` |
| Stack Overflow | Stacks reset on enemy death |
| Burst Cycle | Counter resets on enemy death |
| Phoenix Protocol | Scales with `_runChipsDestroyed` |
