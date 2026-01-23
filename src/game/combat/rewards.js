/**
 * Combat Rewards
 * Victory handling
 */

import { processDeathEffects } from './status-effects.js';

// ============ VICTORY HANDLING ============

/**
 * Process combat victory rewards
 */
export function processVictory(player, enemy, run) {
  const gold = enemy.goldReward || 0;

  const rewards = {
    gold,
  };

  // Add gold
  player.gold += gold;

  // Process death effects (enemy abilities like heal-on-death)
  const deathEffects = processDeathEffects(enemy, player);
  if (deathEffects.healAmount > 0) {
    rewards.debugHeal = deathEffects.healAmount;
    rewards.deathEffectsTriggered = deathEffects.effectsTriggered;
  }

  // Update run stats
  if (run) {
    run.stats.enemiesDefeated++;
    run.stats.goldEarned += gold;
    if (enemy.isBoss) {
      run.stats.bossesDefeated++;
    }
  }

  return rewards;
}

/**
 * Process boss victory (guaranteed drop)
 */
export function processBossVictory(player, enemy, floor, bossDrop, run) {
  const baseRewards = processVictory(player, enemy, run);

  // Add boss drop info for display
  if (bossDrop) {
    baseRewards.bossDrop = bossDrop;
  }

  return baseRewards;
}
