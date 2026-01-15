/**
 * @fileoverview Headless game simulation for balance testing
 * @module src/game/simulation/simulator
 *
 * Runs games without UI, AI narration, or delays for rapid playtesting.
 * Use to test balance changes like "enemies have 10% more HP".
 */

import { GameManager } from '../loop.js';
import { CHIPS, getChipsByRarity, equipChip } from '../items/chips.js';
import { allocateStat } from '../state.js';
import { AIPlayer } from './ai-player.js';
import { SimulationStats } from './stats.js';

/**
 * Configuration options for simulation
 */
export const DEFAULT_OPTIONS = {
  runs: 100,
  // Balance modifiers (1.0 = baseline)
  enemyHpModifier: 1.0,
  enemyDamageModifier: 1.0,
  playerHpModifier: 1.0,
  playerDamageModifier: 1.0,
  // Chip configuration
  randomChips: true,
  chipCount: 4,
  // Player starting stats (realistic - similar to character creation)
  playerStats: { str: 8, agi: 7, vit: 8, int: 5, dex: 7, luk: 5 },
  // Logging
  verbose: false,
  logEveryN: 100, // Log progress every N runs
};

/**
 * Run a batch of game simulations
 * @param {Object} options - Simulation options
 * @returns {Object} Aggregated statistics
 */
export async function runSimulation(options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const stats = new SimulationStats();
  const startTime = Date.now();

  for (let i = 0; i < config.runs; i++) {
    if (config.logEveryN && i > 0 && i % config.logEveryN === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const runsPerSec = (i / elapsed).toFixed(1);
      console.log(`  Progress: ${i}/${config.runs} runs (${runsPerSec}/sec)`);
    }

    const result = simulateSingleRun(config);
    stats.recordRun(result);
  }

  const elapsed = (Date.now() - startTime) / 1000;
  stats.finalize(elapsed, config);

  return stats.getSummary();
}

/**
 * Simulate a single complete game run
 * @param {Object} config - Run configuration
 * @returns {Object} Run result data
 */
function simulateSingleRun(config) {
  const gm = createHeadlessGameManager(config);
  const ai = new AIPlayer(config);

  // Create player
  gm.createPlayer('SimBot', config.playerStats, 0);

  // Start run (this creates gm.run with cloned player)
  gm.startRun();

  // Apply player modifiers
  if (config.playerHpModifier && config.playerHpModifier !== 1.0) {
    gm.run.player.maxHp = Math.floor(gm.run.player.maxHp * config.playerHpModifier);
    gm.run.player.hp = gm.run.player.maxHp;
  }

  // Equip random chips AFTER run starts (so gm.run.player exists)
  if (config.randomChips) {
    equipRandomChips(gm, config.chipCount);
  }

  // Select starting ward (always nerima for consistency)
  const startingWards = gm.getStartingWardOptions();
  if (startingWards && startingWards.length > 0) {
    gm.selectStartingWard(startingWards[0].id);
  }

  // Enter the floor (generates rooms)
  gm.enterFloor();

  // Game loop
  let turnCount = 0;
  const maxTurns = 10000; // Safety limit

  if (config.verbose) {
    console.log(`  Run started. Phase: ${gm.getPhase()}, Rooms: ${gm.run?.rooms?.length}`);
  }

  while (gm.run?.active && turnCount < maxTurns) {
    turnCount++;

    const phase = gm.getPhase();

    if (config.verbose && turnCount <= 20) {
      console.log(`  Turn ${turnCount}: phase=${phase}, floor=${gm.run?.floor}, room=${gm.run?.currentRoom}`);
    }

    switch (phase) {
      case 'exploring':
      case 'room':
        handleRoom(gm, ai);
        break;

      case 'room_encounter':
        // Room has an encounter that hasn't started yet
        if (config.verbose) console.log(`  Starting encounter...`);
        gm.startEncounter();
        break;

      case 'combat':
        handleCombat(gm, ai);
        break;

      case 'boss_ready':
        gm.startBossEncounter();
        break;

      case 'post_combat_shop':
        // Auto-allocate any stat points earned from level ups
        autoAllocateStats(gm);
        // Buy chips from shop if affordable
        handlePostCombatShop(gm, config);
        break;

      case 'floor_complete':
      case 'ward_selection':
        if (config.verbose) {
          console.log(`  Ward selection: floor=${gm.run?.floor}, bossDefeated=${gm.run?.bossDefeated}`);
        }
        handleWardSelection(gm);
        break;

      default:
        // Proceed to next room if stuck
        if (gm.run?.active) {
          try {
            gm.proceedToNextRoom();
          } catch (e) {
            // Ignore errors, try to continue
          }
        }
    }
  }

  // Extract results
  return extractRunResult(gm);
}

/**
 * Create a GameManager configured for headless simulation
 */
function createHeadlessGameManager(config) {
  const gm = new GameManager();

  // No-op callbacks (skip narration and state updates)
  gm.onNarration(() => {});
  gm.onStateChange(() => {});

  // Initialize empty meta-progression
  gm.initMeta();

  // Store modifiers for use in combat
  gm._simConfig = config;

  return gm;
}

/**
 * Equip random chips to player equipment slots
 */
function equipRandomChips(gm, count) {
  const rarities = ['common', 'uncommon', 'rare'];
  const slots = ['weapon', 'body', 'shield', 'accessory'];
  const player = gm.run?.player;

  if (!player) return;

  for (let i = 0; i < count && i < 4; i++) {
    const rarity = rarities[Math.floor(Math.random() * rarities.length)];
    const chipsOfRarity = getChipsByRarity(rarity);

    if (chipsOfRarity.length > 0) {
      const chip = chipsOfRarity[Math.floor(Math.random() * chipsOfRarity.length)];
      const slot = slots[i % slots.length];

      // Add chip to inventory first
      player.chips = player.chips || [];
      const chipInstance = {
        id: `${chip.id}_${rarity}`,
        baseId: chip.id,
        rarity: rarity,
        category: chip.category,
        effects: chip.effects,
        name: chip.name,
        nameEn: chip.nameEn
      };
      player.chips.push(chipInstance);

      // Equip chip to slot
      equipChip(player, slot, chipInstance.id);
    }
  }
}

/**
 * Handle room exploration
 */
function handleRoom(gm, ai) {
  const room = gm.getCurrentRoom();

  if (!room) {
    gm.proceedToNextRoom();
    return;
  }

  if (room.interacted) {
    gm.proceedToNextRoom();
    return;
  }

  // Handle room by type
  switch (room.type) {
    case 'encounter':
      gm.startEncounter();
      break;

    case 'trap':
      // AI decides whether to disarm or trigger
      if (ai.shouldDisarmTrap(gm)) {
        gm.disarmTrap();
      } else {
        gm.triggerTrap();
      }
      break;

    case 'treasure':
      gm.openTreasure();
      break;

    case 'body':
      gm.lootBody();
      break;

    case 'shrine':
      gm.useShrine();
      break;

    case 'shop':
    case 'blacksmith':
      // Skip shops for speed
      room.interacted = true;
      break;

    case 'boss':
      gm.startBossEncounter();
      break;

    default:
      room.interacted = true;
  }
}

/**
 * Auto-allocate any unspent stat points
 */
function autoAllocateStats(gm) {
  const player = gm.run?.player;
  if (!player || !player.statPoints || player.statPoints <= 0) return;

  // Simple allocation: prioritize VIT > STR > AGI > DEX
  const priority = ['vit', 'str', 'agi', 'dex', 'int', 'luk'];

  while (player.statPoints > 0) {
    let allocated = false;
    for (const stat of priority) {
      const result = allocateStat(player, stat);
      if (result?.success) {
        allocated = true;
        break;
      }
    }
    if (!allocated) break; // Can't allocate anything (all stats too expensive)
  }
}

/**
 * Handle combat encounters
 */
function handleCombat(gm, ai) {
  if (!gm.combat?.active) return;

  const config = gm._simConfig || {};

  if (config.verbose) {
    console.log(`  Combat start: Player HP ${gm.run.player.hp}/${gm.run.player.maxHp}, Enemy HP ${gm.combat.enemy?.hp}/${gm.combat.enemy?.maxHp}`);
  }

  // Apply modifiers to enemy if not already applied
  if (config && gm.combat.enemy && !gm.combat.enemy._modifiersApplied) {
    const enemy = gm.combat.enemy;
    enemy.maxHp = Math.floor(enemy.maxHp * (config.enemyHpModifier || 1.0));
    enemy.hp = Math.min(enemy.hp, enemy.maxHp);
    enemy._modifiersApplied = true;
  }

  let combatTurns = 0;
  const maxCombatTurns = 100;

  while (gm.combat?.active && combatTurns < maxCombatTurns) {
    combatTurns++;

    if (gm.combat.turn === 'player') {
      const action = ai.decideCombatAction(gm);
      executePlayerAction(gm, action);
    } else {
      gm.enemyTurn();
    }

    // Check if player died
    if (gm.run?.player?.hp <= 0) {
      if (config.verbose) {
        console.log(`  Player died! HP: ${gm.run.player.hp}`);
      }
      break;
    }
  }
}

/**
 * Execute a player combat action
 */
function executePlayerAction(gm, action) {
  try {
    switch (action.type) {
      case 'attack':
        gm.attack(action.attackType || 'normal');
        break;
      case 'defend':
        gm.defend();
        break;
      case 'magic':
        gm.magic(action.skillId);
        break;
      case 'item':
        gm.useItem(action.itemId);
        break;
      case 'flee':
        gm.flee();
        break;
      default:
        gm.attack('normal');
    }
  } catch (e) {
    // If action fails, try basic attack
    try {
      gm.attack('normal');
    } catch (e2) {
      // Combat may have ended
    }
  }
}

/**
 * Handle post-combat shop - buy affordable chips
 */
function handlePostCombatShop(gm, config) {
  const shop = gm.run?.postCombatShop;
  if (!shop?.active || !shop.items) {
    gm.run.postCombatShop.active = false;
    return;
  }

  const player = gm.run.player;

  // Sort items by price (cheapest first) to maximize chip count
  const sortedItems = [...shop.items].sort((a, b) => a.price - b.price);

  // Try to buy chips we can afford
  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i];

    // Find the original index in shop.items
    const originalIndex = shop.items.findIndex(si => si.itemId === item.itemId);

    if (player.gold >= item.price && originalIndex !== -1) {
      try {
        const result = gm.buyFromPostCombatShop(originalIndex);
        if (result.success && config.verbose) {
          console.log(`  Bought chip: ${item.nameEn || item.name} (${item.rarity}) for ${item.price}g`);
        }
        // After buying, try to equip the chip
        if (result.success) {
          tryEquipNewChip(gm, item.itemId);
        }
      } catch (e) {
        // Skip if purchase fails
      }
    }
  }

  // Close shop when done
  if (gm.run.postCombatShop?.active) {
    gm.run.postCombatShop.active = false;
  }
}

/**
 * Try to equip a newly purchased chip to an available slot
 */
function tryEquipNewChip(gm, chipId) {
  const player = gm.run?.player;
  if (!player) return;

  const slots = ['weapon', 'body', 'shield', 'accessory'];

  // Find a slot with room for the chip
  for (const slot of slots) {
    const result = equipChip(player, slot, chipId);
    if (result.success) {
      return; // Successfully equipped
    }
  }
  // If no slot has room, chip stays in inventory (still useful for some effects)
}

/**
 * Handle ward selection between floors
 */
function handleWardSelection(gm) {
  const options = gm.getNextWardOptions();
  if (options && options.length > 0) {
    // Pick first available ward
    gm.selectNextWard(options[0].id);
  } else {
    // No next ward = game complete (palace boss defeated)
    // Mark run as complete
    gm.run.active = false;
    gm.run.stats = gm.run.stats || {};
    gm.run.stats.floorsCleared = gm.run.floor; // Mark as full clear
  }
}

/**
 * Extract results from completed run
 */
function extractRunResult(gm) {
  const run = gm.run;
  const player = run?.player || gm.player;

  // Victory if we cleared floor 5 (palace) or more
  const floorsCleared = run?.stats?.floorsCleared || run?.floor || 1;
  const victory = floorsCleared >= 5 && run?.stats?.bossesDefeated >= 5;

  // Extract equipped chips from all equipment slots
  const equippedChips = [];
  const slots = ['weapon', 'body', 'shield', 'accessory'];
  for (const slot of slots) {
    const eq = player?.equipment?.[slot];
    if (eq?.equippedChips) {
      equippedChips.push(...eq.equippedChips);
    }
  }

  return {
    victory,
    floor: run?.floor || 1,
    floorsCleared: run?.stats?.floorsCleared || 0,
    enemiesDefeated: run?.stats?.enemiesDefeated || 0,
    bossesDefeated: run?.stats?.bossesDefeated || 0,
    damageDealt: run?.stats?.damageDealt || 0,
    damageTaken: run?.stats?.damageTaken || 0,
    goldEarned: run?.stats?.goldEarned || 0,
    playerLevel: player?.level || 1,
    playerHp: player?.hp || 0,
    playerMaxHp: player?.maxHp || 0,
    chips: equippedChips
  };
}

export { simulateSingleRun, createHeadlessGameManager };
