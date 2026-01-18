# Simplify Attack System

## Goal

Replace complex combat timing code with dead-simple turn-based flow:

```
Player attacks → Enemy attacks → Vocab review → Repeat
```

No ASPD. No race conditions. No timing. Just sequential function calls.

## Current Problem

`loop.js` has ~400 lines of combat code with:
- Attack speed (ASPD) calculations
- Race condition flags (`_attackInProgress`, `_processingEnemyTurn`)
- Timing intervals and cooldowns
- `realtimeAttackCycle()` with complex async timing
- Duplicated damage calculation paths

We added a `CombatEngine` class that made it WORSE (+367 lines net).

## Target State

The entire attack flow should be ~50 lines in `loop.js`. No new files. No new classes.

## What to DELETE

1. **Delete entirely:**
   - `src/game/combat/engine.js` (the new file we created)
   - `realtimeAttackCycle()` method
   - All ASPD-related code and imports
   - Race condition flags (`_attackInProgress`, `_processingEnemyTurn`, etc.)
   - Timing interval code

2. **Remove from exports:**
   - `CombatEngine` from `src/game/combat/index.js`
   - `CombatEngine` from `src/game/combat.js`

## What to KEEP

- `executePlayerAttack()` from `player-actions.js` (calculates damage)
- `executeEnemyTurn()` from `enemy-actions.js` (calculates enemy damage)
- Chip pipeline processing
- Status effect processing
- Victory/defeat handling

## New Attack Flow

```javascript
// In loop.js - this replaces hundreds of lines

attack(attackType = 'normal') {
  if (!this.combat?.active) throw new Error('No active combat');

  // 1. Player attacks
  const playerResult = executePlayerAttack(this.run.player, this.combat.enemy, attackType);
  this.combat.enemy.hp -= playerResult.totalDamage;

  // Handle chip side effects (healing, etc.)
  if (playerResult.pipelineResult?.totalHealPlayer > 0) {
    this.run.player.hp = Math.min(
      this.run.player.maxHp,
      this.run.player.hp + playerResult.pipelineResult.totalHealPlayer
    );
  }

  // Check victory
  if (this.combat.enemy.hp <= 0) {
    return this._handleVictory(playerResult);
  }

  // 2. Enemy attacks
  const enemyResult = executeEnemyTurn(this.combat.enemy, this.run.player, this.combat.turnCount);
  this.run.player.hp -= enemyResult.damage;

  // Check defeat
  if (this.run.player.hp <= 0) {
    return this._handleDefeat(enemyResult);
  }

  // 3. Increment turn, select next intent
  this.combat.turnCount++;
  this.combat.intent = selectEnemyIntent(this.combat.enemy, this.combat.turnCount);

  // 4. Signal vocab review needed
  return {
    phase: 'vocab_review',
    playerResult,
    enemyResult,
    nextIntent: this.combat.intent
  };
}

completeVocabReview() {
  // Called after user reviews a word - just returns current state
  return { phase: 'player_turn', intent: this.combat.intent };
}
```

That's it. ~40 lines replaces ~400.

## Frontend Changes

Frontend calls:
1. `POST /api/game/attack` → gets `{ phase: 'vocab_review', ... }`
2. Shows vocab card, user reviews
3. `POST /api/game/complete-vocab-review` → gets `{ phase: 'player_turn', ... }`
4. Repeat

No timers. No intervals. No polling.

## Test Updates

Integration tests need updating to:
1. Remove `CombatEngine` imports
2. Use `gm.attack()` directly
3. Call `gm.completeVocabReview()` between attacks

## Success Criteria

- [ ] Net deletion of 300+ lines
- [ ] No new files created
- [ ] No new classes created
- [ ] `attack()` is < 50 lines
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Combat still works: damage, chips, status effects, victory, defeat
