#!/usr/bin/env node
/**
 * @fileoverview CLI for running game simulations
 *
 * Usage:
 *   node simulate.js --runs 1000 --enemy-hp 1.1
 *
 * Options:
 *   --runs <n>        Number of runs (default: 100)
 *   --enemy-hp <x>    Enemy HP modifier (1.1 = +10%)
 *   --enemy-dmg <x>   Enemy damage modifier
 *   --player-hp <x>   Player HP modifier
 *   --player-dmg <x>  Player damage modifier
 *   --no-chips        Disable random chips
 *   --verbose         Enable verbose logging
 *   --json            Output as JSON instead of formatted text
 */

import { runSimulation, DEFAULT_OPTIONS } from './src/game/simulation/simulator.js';
import { SimulationStats } from './src/game/simulation/stats.js';
import { getChip } from './src/game/items/chips.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--runs':
      case '-n':
        options.runs = parseInt(next, 10) || 100;
        i++;
        break;

      case '--enemy-hp':
        options.enemyHpModifier = parseFloat(next) || 1.0;
        i++;
        break;

      case '--enemy-dmg':
      case '--enemy-damage':
        options.enemyDamageModifier = parseFloat(next) || 1.0;
        i++;
        break;

      case '--player-hp':
        options.playerHpModifier = parseFloat(next) || 1.0;
        i++;
        break;

      case '--player-dmg':
      case '--player-damage':
        options.playerDamageModifier = parseFloat(next) || 1.0;
        i++;
        break;

      case '--no-chips':
        options.randomChips = false;
        break;

      case '--chips':
        options.chipCount = parseInt(next, 10) || 4;
        i++;
        break;

      case '--verbose':
      case '-v':
        options.verbose = true;
        break;

      case '--json':
        options.jsonOutput = true;
        break;

      case '--help':
      case '-h':
        printHelp();
        process.exit(0);

      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Game Simulation CLI
━━━━━━━━━━━━━━━━━━━

Usage: node simulate.js [options]

Options:
  --runs, -n <n>       Number of simulation runs (default: 100)
  --enemy-hp <x>       Enemy HP modifier (e.g., 1.1 = +10%)
  --enemy-dmg <x>      Enemy damage modifier
  --player-hp <x>      Player HP modifier
  --player-dmg <x>     Player damage modifier
  --no-chips           Run without random chips
  --chips <n>          Number of chips to equip (default: 4)
  --verbose, -v        Enable verbose logging
  --json               Output results as JSON
  --help, -h           Show this help message

Examples:
  node simulate.js --runs 1000
  node simulate.js --runs 500 --enemy-hp 1.1
  node simulate.js --runs 100 --enemy-hp 1.2 --enemy-dmg 1.1 --json
`);
}

async function main() {
  const options = parseArgs();

  console.log('');
  console.log('Starting simulation...');
  console.log(`  Runs: ${options.runs}`);

  if (options.enemyHpModifier !== 1.0) {
    console.log(`  Enemy HP: ${(options.enemyHpModifier * 100).toFixed(0)}%`);
  }
  if (options.enemyDamageModifier !== 1.0) {
    console.log(`  Enemy Damage: ${(options.enemyDamageModifier * 100).toFixed(0)}%`);
  }
  if (options.playerHpModifier !== 1.0) {
    console.log(`  Player HP: ${(options.playerHpModifier * 100).toFixed(0)}%`);
  }
  if (options.playerDamageModifier !== 1.0) {
    console.log(`  Player Damage: ${(options.playerDamageModifier * 100).toFixed(0)}%`);
  }

  console.log('');

  try {
    const summary = await runSimulation(options);

    if (options.jsonOutput) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      const stats = new SimulationStats();
      stats.runs = Array(summary.totalRuns).fill(null); // Placeholder
      stats.elapsed = summary.elapsed;
      stats.config = options;

      // Rebuild for formatting (we already have summary)
      console.log(formatSummary(summary));
    }
  } catch (error) {
    console.error('Simulation failed:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

function formatSummary(s) {
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

  // Best run details
  if (s.bestRun) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('Best Run:');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const b = s.bestRun;
    lines.push(`  Floor: ${b.floor} | Bosses: ${b.bossesDefeated} | Enemies: ${b.enemiesDefeated}`);
    lines.push(`  Level: ${b.playerLevel} | Damage Dealt: ${b.damageDealt.toLocaleString()}`);
    lines.push(`  Victory: ${b.victory ? 'Yes' : 'No'}`);
    lines.push('');
    lines.push('  Chips Equipped:');
    if (b.chips && b.chips.length > 0) {
      // Count rarities
      const rarityCounts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };

      for (const chipId of b.chips) {
        // Parse rarity from chip ID (e.g., "boxCutter_uncommon")
        const parts = chipId.split('_');
        const rarity = parts[parts.length - 1];
        if (rarityCounts[rarity] !== undefined) {
          rarityCounts[rarity]++;
        }
      }

      // Show rarity summary
      const rarityParts = [];
      if (rarityCounts.legendary > 0) rarityParts.push(`${rarityCounts.legendary} legendary`);
      if (rarityCounts.epic > 0) rarityParts.push(`${rarityCounts.epic} epic`);
      if (rarityCounts.rare > 0) rarityParts.push(`${rarityCounts.rare} rare`);
      if (rarityCounts.uncommon > 0) rarityParts.push(`${rarityCounts.uncommon} uncommon`);
      if (rarityCounts.common > 0) rarityParts.push(`${rarityCounts.common} common`);
      lines.push(`  Total: ${b.chips.length} chips (${rarityParts.join(', ')})`);
      lines.push('');

      // Show each chip with effects
      for (const chipId of b.chips) {
        const chip = getChip(chipId);
        if (chip) {
          // Parse rarity from ID
          const parts = chipId.split('_');
          const rarity = parts[parts.length - 1];
          const rarityTag = rarity !== 'common' ? ` [${rarity}]` : '';

          // Format effects
          let effectStr = '';
          if (chip.effects?.stats) {
            const statParts = Object.entries(chip.effects.stats)
              .map(([stat, val]) => `+${val} ${stat.toUpperCase()}`)
              .join(', ');
            effectStr = statParts;
          } else if (chip.effects?.onHit) {
            effectStr = `on-hit: ${chip.effects.onHit.effect || 'special'}`;
          } else if (chip.effects?.onKill) {
            effectStr = `on-kill: ${chip.effects.onKill.effect || 'special'}`;
          } else if (chip.effects?.onDamage) {
            effectStr = `on-damage: ${chip.effects.onDamage.effect || 'special'}`;
          } else if (chip.effects?.onCrit) {
            effectStr = `on-crit: ${chip.effects.onCrit.effect || 'special'}`;
          } else if (chip.category) {
            effectStr = `[${chip.category}]`;
          }

          lines.push(`    - ${chip.nameEn || chip.name}${rarityTag}: ${effectStr}`);
        } else {
          lines.push(`    - ${chipId}`);
        }
      }
    } else {
      lines.push('    (none)');
    }
    lines.push('');
  }

  return lines.join('\n');
}

main();
