/**
 * @fileoverview Statistics aggregation for game simulations
 * @module src/game/simulation/stats
 *
 * Collects and aggregates results from multiple simulation runs.
 */

/**
 * Statistics collector and aggregator
 */
export class SimulationStats {
  constructor() {
    this.runs = [];
    this.config = null;
    this.elapsed = 0;
  }

  /**
   * Record a single run result
   * @param {Object} result - Run result from simulator
   */
  recordRun(result) {
    this.runs.push(result);
  }

  /**
   * Finalize stats after all runs complete
   * @param {number} elapsed - Time elapsed in seconds
   * @param {Object} config - Simulation config used
   */
  finalize(elapsed, config) {
    this.elapsed = elapsed;
    this.config = config;
  }

  /**
   * Get aggregated summary of all runs
   * @returns {Object} Summary statistics
   */
  getSummary() {
    const total = this.runs.length;
    if (total === 0) {
      return { error: 'No runs completed' };
    }

    const victories = this.runs.filter(r => r.victory).length;
    const floors = this.runs.map(r => r.floor);
    const enemies = this.runs.map(r => r.enemiesDefeated);
    const bosses = this.runs.map(r => r.bossesDefeated);
    const damage = this.runs.map(r => r.damageDealt);
    const damageTaken = this.runs.map(r => r.damageTaken);
    const levels = this.runs.map(r => r.playerLevel);

    return {
      // Run info
      totalRuns: total,
      elapsed: this.elapsed,
      runsPerSecond: total / this.elapsed,

      // Modifiers applied
      modifiers: {
        enemyHp: this.config?.enemyHpModifier || 1.0,
        enemyDamage: this.config?.enemyDamageModifier || 1.0,
        playerHp: this.config?.playerHpModifier || 1.0,
        playerDamage: this.config?.playerDamageModifier || 1.0,
      },

      // Victory stats
      victories,
      winRate: victories / total,
      winRatePercent: ((victories / total) * 100).toFixed(1),

      // Floor progression
      avgFloor: this.average(floors),
      minFloor: Math.min(...floors),
      maxFloor: Math.max(...floors),
      floorDistribution: this.distribution(floors, 1, 7),

      // Combat stats
      avgEnemiesDefeated: this.average(enemies),
      avgBossesDefeated: this.average(bosses),
      avgDamageDealt: this.average(damage),
      avgDamageTaken: this.average(damageTaken),

      // Player progression
      avgLevel: this.average(levels),
      maxLevel: Math.max(...levels),

      // Best run details
      bestRun: this.getBestRun(),
    };
  }

  /**
   * Calculate average of an array
   */
  average(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Create distribution histogram
   * @param {number[]} values - Array of values
   * @param {number} min - Minimum bucket value
   * @param {number} max - Maximum bucket value
   * @returns {Object} Distribution by bucket
   */
  distribution(values, min, max) {
    const dist = {};
    for (let i = min; i <= max; i++) {
      dist[i] = 0;
    }
    for (const v of values) {
      const bucket = Math.min(max, Math.max(min, Math.floor(v)));
      dist[bucket] = (dist[bucket] || 0) + 1;
    }
    // Convert to percentages
    const total = values.length;
    const result = {};
    for (const [k, v] of Object.entries(dist)) {
      result[k] = {
        count: v,
        percent: ((v / total) * 100).toFixed(1)
      };
    }
    return result;
  }

  /**
   * Find the best performing run
   * Sorted by: floor (desc), bossesDefeated (desc), enemiesDefeated (desc), damageDealt (desc)
   */
  getBestRun() {
    if (this.runs.length === 0) return null;

    return this.runs.reduce((best, run) => {
      if (!best) return run;

      // Compare by floor first
      if (run.floor > best.floor) return run;
      if (run.floor < best.floor) return best;

      // Then by bosses defeated
      if (run.bossesDefeated > best.bossesDefeated) return run;
      if (run.bossesDefeated < best.bossesDefeated) return best;

      // Then by enemies defeated
      if (run.enemiesDefeated > best.enemiesDefeated) return run;
      if (run.enemiesDefeated < best.enemiesDefeated) return best;

      // Finally by damage dealt
      if (run.damageDealt > best.damageDealt) return run;
      return best;
    }, null);
  }

  /**
   * Format summary for console output
   * @returns {string} Formatted string
   */
  formatConsole() {
    const s = this.getSummary();
    const lines = [];

    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`Simulation Complete: ${s.totalRuns} runs`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');

    // Modifiers
    const mods = [];
    if (s.modifiers.enemyHp !== 1.0) mods.push(`Enemy HP: ${(s.modifiers.enemyHp * 100).toFixed(0)}%`);
    if (s.modifiers.enemyDamage !== 1.0) mods.push(`Enemy Damage: ${(s.modifiers.enemyDamage * 100).toFixed(0)}%`);
    if (s.modifiers.playerHp !== 1.0) mods.push(`Player HP: ${(s.modifiers.playerHp * 100).toFixed(0)}%`);
    if (s.modifiers.playerDamage !== 1.0) mods.push(`Player Damage: ${(s.modifiers.playerDamage * 100).toFixed(0)}%`);
    if (mods.length > 0) {
      lines.push(`Modifiers: ${mods.join(', ')}`);
      lines.push('');
    }

    // Win rate
    lines.push(`Win Rate: ${s.winRatePercent}% (${s.victories}/${s.totalRuns})`);
    lines.push(`Avg Floor: ${s.avgFloor.toFixed(1)}`);
    lines.push('');

    // Floor distribution
    lines.push('Floor Distribution:');
    for (let f = 1; f <= 7; f++) {
      const d = s.floorDistribution[f];
      const bar = '█'.repeat(Math.floor(parseFloat(d.percent) / 2));
      const label = f === 7 ? ' (victories)' : '';
      lines.push(`  Floor ${f}: ${bar} ${d.percent}%${label}`);
    }
    lines.push('');

    // Combat stats
    lines.push(`Avg Enemies Defeated: ${s.avgEnemiesDefeated.toFixed(1)}`);
    lines.push(`Avg Bosses Defeated: ${s.avgBossesDefeated.toFixed(1)}`);
    lines.push(`Avg Damage Dealt: ${Math.floor(s.avgDamageDealt).toLocaleString()}`);
    lines.push(`Avg Damage Taken: ${Math.floor(s.avgDamageTaken).toLocaleString()}`);
    lines.push('');

    // Player stats
    lines.push(`Avg Level Reached: ${s.avgLevel.toFixed(1)}`);
    lines.push(`Max Level Reached: ${s.maxLevel}`);
    lines.push('');

    // Performance
    lines.push(`Time: ${s.elapsed.toFixed(1)}s (${s.runsPerSecond.toFixed(1)} runs/sec)`);
    lines.push('');

    return lines.join('\n');
  }
}
