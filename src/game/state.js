/**
 * @fileoverview Player, run, combat, and meta-progression state management
 * @module src/game/state
 *
 * PURPOSE:
 * State factory functions for all game objects. Defines player stats (simplified
 * to attack/maxHp), run state with area progression, combat state, and meta-
 * progression system for cross-run upgrades.
 *
 * KEY EXPORTS:
 * State Factories:
 * - createNewPlayer(name) - Player with attack, maxHp, credits
 * - createNewRun(player) - Run state: area loop, rooms, encounters
 * - createCombatState(enemy) - Combat instance for battle
 * - createMetaProgression() - Meta-save: upgrades, achievements
 *
 * Meta-Progression:
 * - ACHIEVEMENTS - Achievement definitions and unlock conditions
 *
 * Persistence:
 * - saveGame(fs, player, completedRuns) - Save to .jrpg-save.json
 * - loadGame(fs) - Load from .jrpg-save.json
 * - deleteSave(fs) - Delete save file
 *
 * Utilities:
 * - generateEncounterCount() - Random rooms per area (8-12)
 *
 * ARCHITECTURE NOTES:
 * - Player stats: attack and maxHp (no STR/AGI/VIT/INT/DEX/LUK)
 * - Meta-progression persists across runs via separate save
 */

// ============ META-PROGRESSION STATE ============

/**
 * Create a fresh meta-progression save
 * This persists across all runs and deaths
 */
export function createMetaProgression() {
  return {
    // Purchased upgrades (key: upgrade ID, value: level purchased)
    upgrades: {},

    // Lifetime statistics
    lifetimeStats: {
      totalRuns: 0,
      runsCompleted: 0,
      runsFailed: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      totalCreditsEarned: 0,
      highestAreasCleared: 0,
      totalPlayTime: 0,      // in milliseconds
      firstPlayDate: null,
      lastPlayDate: null
    },

    // Unlocked features (achievements unlock these)
    unlocks: [],

    // Achievements earned
    achievements: [],

    // Permanent creature collection (persists across runs)
    creatureCollection: ['hikaribon', 'hanatchi', 'tsukimochi'],

    // Befriend counts per creature (persists across runs)
    befriendCount: {},

    // NPC bonds (persists across runs)
    npcBonds: {}
  };
}

// ============ CONSTANTS ============

/** Base starting credits for each run (before meta-progression bonuses) */
export const BASE_STARTING_CREDITS = 55;

// ============ ACHIEVEMENT DEFINITIONS ============

export const ACHIEVEMENTS = {
  firstVictory: {
    id: 'firstVictory',
    name: '初勝利',
    nameEn: 'First Victory',
    description: 'Win your first combat encounter',
    check: (stats) => stats.totalDamageDealt > 0,
    reward: {}
  },

  veteranHunter: {
    id: 'veteranHunter',
    name: 'ベテランハンター',
    nameEn: 'Veteran Hunter',
    description: 'Complete 10 runs',
    check: (stats) => stats.totalRuns >= 10,
    reward: {}
  },

  dungeonMaster: {
    id: 'dungeonMaster',
    name: 'ダンジョンマスター',
    nameEn: 'Dungeon Master',
    description: 'Clear all 10 areas in a run',
    check: (stats) => stats.runsCompleted >= 1,
    reward: {}
  },

  perfectRun: {
    id: 'perfectRun',
    name: 'パーフェクトラン',
    nameEn: 'Perfect Run',
    description: 'Clear all 10 areas without failing',
    check: (stats, runStats) => runStats?.areasCleared >= 10,
    reward: {}
  }
};

// ============ DEFAULT PLAYER STATE ============
export function createNewPlayer(name = "Hunter") {
  return {
    name,
    hp: 100,
    maxHp: 100,
    attack: 0,
    credits: BASE_STARTING_CREDITS
  };
}

// ============ RUN STATE ============
export function createNewRun(player) {
  const run = {
    active: true,

    // Area loop system
    currentArea: null,           // full area object from staging JSON
    areasCompleted: 0,           // number of areas cleared
    areasToWin: 10,              // win condition threshold
    areaPath: [],                // array of area IDs visited (for history)
    areaSelectionRequired: true, // true at start and after each area
    areaCleared: false,          // true when all rooms in current area are done

    // Room-based exploration (per-area, reset each area)
    rooms: [],
    currentRoom: 0,
    roomsExplored: 0,

    // Current area progress
    currentAreaEncounters: 0,
    encountersNeeded: 0,
    totalEncounters: 0,

    // Player state for this run (copy so we can reset)
    player: JSON.parse(JSON.stringify(player)),

    // Current encounter
    encounter: null,

    // Creature party (run-scoped)
    creatureParty: {
      active: [],    // 0-3 deployed creatures
      reserves: [],  // 0-3 bench creatures
      maxTotal: 6
    },

    // Item buff stacking (run-scoped)
    itemBuffs: {
      attackMult: 1.0,
      hpMult: 1.0,
      autoPowerMult: 1.0,
      ultimatePowerMult: 1.0,
      elementEdge: 0,
      flatDamageReduction: 0,
      xpMultiplier: 1.0,
      xpBalanceStacks: 0
    },

    // Run history for DM context
    eventLog: [],

    // Run statistics
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      itemsUsed: 0,
      creditsEarned: 0,
      areasCleared: 0,
      roomsExplored: 0,
      treasuresOpened: 0,
      startTime: Date.now(),
      endTime: null
    },

    // Per-run tracking stats
    runStats: {
      kills: 0,
      roomsCleared: 0,
      damageDealt: 0,
      damageHealed: 0
    }
  };

  return run;
}

// ============ COMBAT STATE ============
export function createCombatState(enemy) {
  return {
    active: true,
    turn: "player",  // "player" | "enemy"
    turnCount: 1,

    enemy: { ...enemy },

    allies: [],    // references to run.creatureParty.active
    enemies: [],   // MVP: single enemy creature

    // Last action for DM narration
    lastAction: null,

    // Combat log
    log: [],

    // Creature swap state
    swapPhase: true  // true = free swaps allowed, false = swap costs action
  };
}


// ============ ENCOUNTER GENERATION ============
export function generateEncounterCount() {
  // Areas have 8-12 rooms
  const min = 8;
  const max = 12;
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

