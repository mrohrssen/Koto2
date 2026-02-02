/**
 * @fileoverview Player, run, combat, and meta-progression state management
 * @module src/game/state
 *
 * PURPOSE:
 * State factory functions for all game objects. Defines player stats (simplified
 * to attack/maxHp), run state with ward progression, combat state, and meta-
 * progression system for cross-run upgrades.
 *
 * KEY EXPORTS:
 * State Factories:
 * - createNewPlayer(name) - Player with attack, maxHp, credits, chips, equipment
 * - createNewRun(player) - Run state: floor, ward path, rooms, encounters
 * - createCombatState(enemy) - Combat instance for battle
 * - createMetaProgression() - Meta-save: essence, upgrades, achievements
 *
 * Meta-Progression:
 * - META_UPGRADES - Upgrade definitions (vitality, startingCredits, attackPower, creditFind)
 * - ACHIEVEMENTS - Achievement definitions and unlock conditions
 * - calculateEssenceReward(runStats, floor, isVictory) - Compute essence earned
 * - getMetaUpgradeEffects(meta) - Aggregate effects from purchased upgrades
 *
 * Persistence:
 * - saveGame(fs, player, completedRuns) - Save to .jrpg-save.json
 * - loadGame(fs) - Load from .jrpg-save.json
 * - deleteSave(fs) - Delete save file
 *
 * Utilities:
 * - generateEncounterCount(floor) - Random encounters per floor
 *
 * DEPENDENCIES:
 * - ./items.js - getClassStartingEquipment for new players
 *
 * ARCHITECTURE NOTES:
 * - Player stats: attack and maxHp (no STR/AGI/VIT/INT/DEX/LUK)
 * - Only chips for equipment (no armor/weapons)
 * - Meta-progression persists across runs via separate save
 */

import { getClassStartingEquipment } from './items.js';

// ============ INVENTORY CONSTANTS ============
export const MAX_INVENTORY_SIZE = 12;  // Maximum unequipped chips in inventory

// ============ META-PROGRESSION STATE ============

/**
 * Create a fresh meta-progression save
 * This persists across all runs and deaths
 */
export function createMetaProgression() {
  return {
    // Meta currency
    essence: 0,           // Shadow Essence - earned from runs

    // Purchased upgrades (key: upgrade ID, value: level purchased)
    upgrades: {},

    // Lifetime statistics
    lifetimeStats: {
      totalRuns: 0,
      runsCompleted: 0,      // Successfully cleared all 7 floors
      runsFailed: 0,
      totalEnemiesDefeated: 0,
      totalBossesDefeated: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      totalCreditsEarned: 0,
      totalEssenceEarned: 0,
      highestFloor: 0,
      totalPlayTime: 0,      // in milliseconds
      firstPlayDate: null,
      lastPlayDate: null,
      liberationTracker: {}  // { enemyId: { count, firstLiberated } }
    },

    // Unlocked features (achievements unlock these)
    unlocks: [],

    // Achievements earned
    achievements: []
  };
}

// ============ CONSTANTS ============

/** Base starting credits for each run (before meta-progression bonuses) */
export const BASE_STARTING_CREDITS = 250;

// ============ UPGRADE DEFINITIONS ============

export const META_UPGRADES = {
  vitality: {
    id: 'vitality',
    name: '生命力強化',
    nameEn: 'Vitality',
    description: 'Start with +10% Max HP per level',
    maxLevel: 5,
    costPerLevel: [50, 100, 200, 400, 800],
    effect: (level) => ({ maxHpPercent: level * 10 })
  },

  startingCredits: {
    id: 'startingCredits',
    name: '財宝嗅覚',
    nameEn: 'Treasure Sense',
    description: 'Start each run with +25 credits per level',
    maxLevel: 4,
    costPerLevel: [30, 60, 120, 240],
    effect: (level) => ({ startingCredits: level * 25 })
  },

  attackPower: {
    id: 'attackPower',
    name: '攻撃力上昇',
    nameEn: 'Attack Power',
    description: 'Start with +2 ATK per level',
    maxLevel: 5,
    costPerLevel: [75, 150, 300, 600, 1200],
    effect: (level) => ({ attackBonus: level * 2 })
  },

  creditFind: {
    id: 'creditFind',
    name: 'クレジット発見率',
    nameEn: 'Credit Find',
    description: 'Earn +10% more credits per level',
    maxLevel: 5,
    costPerLevel: [50, 100, 200, 400, 800],
    effect: (level) => ({ creditFindPercent: level * 10 })
  }
};

// ============ ACHIEVEMENT DEFINITIONS ============

export const ACHIEVEMENTS = {
  firstVictory: {
    id: 'firstVictory',
    name: '初勝利',
    nameEn: 'First Victory',
    description: 'Defeat your first enemy',
    check: (stats) => stats.totalEnemiesDefeated >= 1,
    reward: { essence: 20 }
  },

  bossSlayer: {
    id: 'bossSlayer',
    name: 'ボススレイヤー',
    nameEn: 'Boss Slayer',
    description: 'Defeat 5 bosses',
    check: (stats) => stats.totalBossesDefeated >= 5,
    reward: { essence: 50 }
  },

  veteranHunter: {
    id: 'veteranHunter',
    name: 'ベテランハンター',
    nameEn: 'Veteran Hunter',
    description: 'Complete 10 runs',
    check: (stats) => stats.totalRuns >= 10,
    reward: { essence: 100 }
  },

  dungeonMaster: {
    id: 'dungeonMaster',
    name: 'ダンジョンマスター',
    nameEn: 'Dungeon Master',
    description: 'Clear all 7 floors',
    check: (stats) => stats.runsCompleted >= 1,
    reward: { essence: 200 }
  },

  thousandKills: {
    id: 'thousandKills',
    name: '千人斬り',
    nameEn: 'Thousand Slayer',
    description: 'Defeat 1000 enemies total',
    check: (stats) => stats.totalEnemiesDefeated >= 1000,
    reward: { essence: 300 }
  },

  perfectRun: {
    id: 'perfectRun',
    name: 'パーフェクトラン',
    nameEn: 'Perfect Run',
    description: 'Clear the dungeon without dying',
    check: (stats, runStats) => runStats?.floorsCleared === 7,
    reward: { essence: 150 }
  }
};

// ============ ESSENCE REWARD CALCULATION ============

/**
 * Calculate essence reward for a completed run
 */
export function calculateEssenceReward(runStats, floor, isVictory) {
  let essence = 0;

  // Base reward per floor reached
  essence += floor * 10;

  // Bonus for full clear
  if (isVictory && floor === 7) {
    essence += 100;
  }

  // Note: Boss essence is awarded immediately on defeat, not at run end

  // Bonus per 10 enemies
  essence += Math.floor((runStats?.enemiesDefeated || 0) / 10) * 5;

  return essence;
}

/**
 * Get all upgrade effects combined at their current levels
 */
export function getMetaUpgradeEffects(metaProgression) {
  const effects = {
    maxHpPercent: 0,
    startingCredits: 0,
    attackBonus: 0,
    creditFindPercent: 0
  };

  if (!metaProgression?.upgrades) return effects;

  for (const [upgradeId, level] of Object.entries(metaProgression.upgrades)) {
    if (level <= 0) continue;

    const upgrade = META_UPGRADES[upgradeId];
    if (!upgrade) continue;

    const upgradeEffect = upgrade.effect(level);
    for (const [key, value] of Object.entries(upgradeEffect)) {
      if (typeof value === 'number') {
        effects[key] = (effects[key] || 0) + value;
      }
    }
  }

  return effects;
}

// ============ DEFAULT PLAYER STATE ============
export function createNewPlayer(name = "Hunter") {
  return {
    name,
    class: 'hacker',
    hp: 100,
    maxHp: 100,
    attack: 15,
    credits: BASE_STARTING_CREDITS,
    chips: [],
    equipment: getClassStartingEquipment('hacker')
  };
}

// ============ RUN STATE ============
export function createNewRun(player) {
  const run = {
    active: true,
    floor: 1,
    maxFloors: 7,

    // Ward path system (NEO TOKYO)
    currentWard: null,      // Current ward ID (e.g., 'nerima')
    wardPath: [],           // Array of ward IDs visited in order
    wardSelectionRequired: true,  // True at start and after each boss

    // Room-based exploration
    rooms: [],              // Array of room objects for current floor
    currentRoom: 0,         // Index of current room (0-based)
    roomsExplored: 0,       // Total rooms explored this floor

    // Branching room selection
    pendingBranch: false,     // True when showing branch choice
    selectedRooms: [],        // Track door choices: [0, 1, 0, ...]

    // Current floor progress
    encountersCompleted: 0,
    encountersNeeded: 0,    // Set when generating floor rooms
    bossDefeated: false,

    // Player state for this run (copy so we can reset)
    player: JSON.parse(JSON.stringify(player)),

    // Current encounter
    encounter: null,

    // Run history for DM context
    eventLog: [],

    // Run statistics
    stats: {
      enemiesDefeated: 0,
      bossesDefeated: 0,
      damageDealt: 0,
      damageTaken: 0,
      itemsUsed: 0,
      creditsEarned: 0,
      floorsCleared: 0,
      roomsExplored: 0,
      trapsDisarmed: 0,
      treasuresOpened: 0,
      startTime: Date.now(),
      endTime: null
    },

    // Counter chip tracking stats (reset each run)
    runStats: {
      kills: 0,
      critsLanded: 0,
      dodges: 0,
      roomsCleared: 0,
      damageDealt: 0,
      damageHealed: 0,
      statusesApplied: {
        defrag: 0,
        lag: 0,
        bufferOverflow: 0,
        corrupted: 0,
        exposed: 0,
        glitched: 0,
        overheated: 0,
        debug: 0
      }
    }
  };

  // Initialize chip state on run player copy
  run.player._chipCharges = {};
  run.player._chipLevels = {};
  run.player._activeBuffs = [];

  return run;
}

// ============ COMBAT STATE ============
export function createCombatState(enemy) {
  return {
    active: true,
    turn: "player",  // "player" | "enemy"
    turnCount: 1,

    enemy: { ...enemy },

    // Last action for DM narration
    lastAction: null,

    // Combat log
    log: []
  };
}


// ============ ENCOUNTER GENERATION ============
export function generateEncounterCount(floor) {
  // Floors have 7-10 encounters before the boss (8-11 rooms total)
  const min = 7;
  const max = 10;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============ SAVE/LOAD ============
const SAVE_FILE = '.jchat-game-save.json';

export async function saveGame(fs, player, completedRuns = []) {
  const saveData = {
    player,
    completedRuns,
    savedAt: new Date().toISOString()
  };

  await fs.promises.writeFile(SAVE_FILE, JSON.stringify(saveData, null, 2));
  return saveData;
}

export async function loadGame(fs) {
  try {
    const data = await fs.promises.readFile(SAVE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;  // No save file
    }
    throw error;
  }
}

export async function deleteSave(fs) {
  try {
    await fs.promises.unlink(SAVE_FILE);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return true;  // Already doesn't exist
    }
    throw error;
  }
}
