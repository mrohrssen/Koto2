/**
 * Combat Rewards
 * Victory handling
 */

// ============ VICTORY HANDLING ============

/**
 * Process combat victory rewards
 */
export function processVictory(player, enemy, run) {
  const credits = enemy.creditReward || 0;

  const rewards = {
    credits,
  };

  // Add credits
  player.credits += credits;

  // Update run stats
  if (run) {
    run.stats.enemiesDefeated++;
    run.stats.creditsEarned += credits;
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
