/**
 * @fileoverview Player, run, combat, and meta-progression state management
 * @module src/game/state
 *
 * PURPOSE:
 * Central state management for all game entities. Provides factory functions
 * for creating players, runs, and combat instances.
 *
 * SIMPLIFIED SYSTEM:
 * - No levels, no XP
 * - No stat allocation (STR, AGI, etc.)
 * - Players have only: attack, maxHp
 * - See state.full.js for the original complex system
 *
 * KEY EXPORTS:
 * - createNewPlayer(name) - Creates player with attack and maxHp
 * - createNewRun(player) - Initializes dungeon run with ward system
 * - createCombatState(enemy) - Creates combat instance
 * - createMetaProgression() - Creates fresh meta-save
 * - saveGame/loadGame/deleteSave - File-based persistence
 *
 * DEPENDENCIES:
 * - ./stats.js - Simplified stats (just attack/maxHp stubs)
 * - ./items.js - Equipment (no stat bonuses in simplified mode)
 */

import {
  getStatPointCost,
  getStatPointsForLevel,
  calculateDerivedStats,
  calculateMaxHp,
  calculateMaxSp,
  getStartingPlayerStats
} from './stats.js';
import { calculateEquipmentBonuses, getClassStartingEquipment } from './items.js';

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
      totalGoldEarned: 0,
      totalEssenceEarned: 0,
      highestFloor: 0,
      highestLevel: 0,
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

// ============ UPGRADE DEFINITIONS ============

export const META_UPGRADES = {
  // Starting Resources
  vitality: {
    id: 'vitality',
    name: '生命力強化',
    nameEn: 'Vitality',
    description: 'Start with +10% Max HP per level',
    maxLevel: 5,
    costPerLevel: [50, 100, 200, 400, 800],
    effect: (level) => ({ maxHpPercent: level * 10 })
  },

  manaPool: {
    id: 'manaPool',
    name: '魔力増強',
    nameEn: 'Mana Pool',
    description: 'Start with +10% Max MP per level',
    maxLevel: 5,
    costPerLevel: [50, 100, 200, 400, 800],
    effect: (level) => ({ maxMpPercent: level * 10 })
  },

  startingGold: {
    id: 'startingGold',
    name: '財宝嗅覚',
    nameEn: 'Treasure Sense',
    description: 'Start each run with +25 gold per level',
    maxLevel: 4,
    costPerLevel: [30, 60, 120, 240],
    effect: (level) => ({ startingGold: level * 25 })
  },

  potionStock: {
    id: 'potionStock',
    name: 'ポーション備蓄',
    nameEn: 'Potion Stock',
    description: 'Start with +1 potion per level',
    maxLevel: 3,
    costPerLevel: [40, 80, 160],
    effect: (level) => ({ startingPotions: level })
  },

  // Combat Bonuses
  attackPower: {
    id: 'attackPower',
    name: '攻撃力上昇',
    nameEn: 'Attack Power',
    description: 'Start with +2 ATK per level',
    maxLevel: 5,
    costPerLevel: [75, 150, 300, 600, 1200],
    effect: (level) => ({ attackBonus: level * 2 })
  },

  defensePower: {
    id: 'defensePower',
    name: '防御力上昇',
    nameEn: 'Defense Power',
    description: 'Start with +2 DEF per level',
    maxLevel: 5,
    costPerLevel: [75, 150, 300, 600, 1200],
    effect: (level) => ({ defenseBonus: level * 2 })
  },

  magicPower: {
    id: 'magicPower',
    name: '魔力上昇',
    nameEn: 'Magic Power',
    description: 'Start with +2 MAG per level',
    maxLevel: 5,
    costPerLevel: [75, 150, 300, 600, 1200],
    effect: (level) => ({ magicBonus: level * 2 })
  },

  swiftness: {
    id: 'swiftness',
    name: '俊敏性強化',
    nameEn: 'Swiftness',
    description: 'Start with +1 SPD per level',
    maxLevel: 5,
    costPerLevel: [60, 120, 240, 480, 960],
    effect: (level) => ({ speedBonus: level })
  },

  // Quality of Life
  potionEfficiency: {
    id: 'potionEfficiency',
    name: 'ポーション効率',
    nameEn: 'Potion Efficiency',
    description: 'Potions heal +15% more per level',
    maxLevel: 3,
    costPerLevel: [100, 200, 400],
    effect: (level) => ({ potionEfficiencyPercent: level * 15 })
  },

  goldFind: {
    id: 'goldFind',
    name: 'ゴールド発見率',
    nameEn: 'Gold Find',
    description: 'Earn +10% more gold per level',
    maxLevel: 5,
    costPerLevel: [50, 100, 200, 400, 800],
    effect: (level) => ({ goldFindPercent: level * 10 })
  },

  xpGain: {
    id: 'xpGain',
    name: '経験値ボーナス',
    nameEn: 'XP Gain',
    description: 'Earn +10% more XP per level',
    maxLevel: 5,
    costPerLevel: [60, 120, 240, 480, 960],
    effect: (level) => ({ xpGainPercent: level * 10 })
  },

  trapResist: {
    id: 'trapResist',
    name: '罠耐性',
    nameEn: 'Trap Resistance',
    description: 'Take 10% less trap damage per level',
    maxLevel: 3,
    costPerLevel: [80, 160, 320],
    effect: (level) => ({ trapResistPercent: level * 10 })
  },

  // Special Skills (unlock at first level)
  skillFireball: {
    id: 'skillFireball',
    name: '火球術',
    nameEn: 'Fireball',
    description: 'Start with Fireball skill',
    maxLevel: 1,
    costPerLevel: [300],
    effect: (level) => ({ unlockSkill: 'fireball' })
  },

  skillHeal: {
    id: 'skillHeal',
    name: '回復術',
    nameEn: 'Heal',
    description: 'Start with Heal skill',
    maxLevel: 1,
    costPerLevel: [300],
    effect: (level) => ({ unlockSkill: 'heal' })
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
    maxMpPercent: 0,
    startingGold: 0,
    startingPotions: 0,
    attackBonus: 0,
    defenseBonus: 0,
    magicBonus: 0,
    speedBonus: 0,
    potionEfficiencyPercent: 0,
    goldFindPercent: 0,
    xpGainPercent: 0,
    trapResistPercent: 0,
    unlockedSkills: []
  };

  if (!metaProgression?.upgrades) return effects;

  for (const [upgradeId, level] of Object.entries(metaProgression.upgrades)) {
    if (level <= 0) continue;

    const upgrade = META_UPGRADES[upgradeId];
    if (!upgrade) continue;

    const upgradeEffect = upgrade.effect(level);

    // Merge effects
    for (const [key, value] of Object.entries(upgradeEffect)) {
      if (key === 'unlockSkill') {
        effects.unlockedSkills.push(value);
      } else if (typeof value === 'number') {
        effects[key] = (effects[key] || 0) + value;
      }
    }
  }

  return effects;
}

// ============ DEFAULT PLAYER STATE (SIMPLIFIED) ============
export function createNewPlayer(name = "Hunter", customStats = null, customStatPoints = null, playerClass = 'hacker') {
  // SIMPLIFIED: Fixed attack and maxHp, no levels
  const attack = 15;   // Starting attack power
  const maxHp = 100;   // Starting max HP
  const maxSp = 50;    // Starting max SP (for skills)

  return {
    name,
    class: playerClass,
    rank: "E",  // Kept for display but doesn't change

    // SIMPLIFIED: No levels, no XP
    level: 1,  // Fixed at 1 (kept for compatibility)
    xp: 0,
    xpToNext: 999999,  // Never levels up

    // SIMPLIFIED: No primary stats, just attack
    attack,
    stats: {},  // Empty - no stat allocation
    statPoints: 0,

    // Core resources
    hp: maxHp,
    maxHp,
    sp: maxSp,
    maxSp,

    // Resources
    gold: 250,

    // Inventory (max 30 items)
    items: [
      { id: "potion", quantity: 3 }
    ],

    // Equipped gear (4 slots)
    equipment: getClassStartingEquipment(playerClass),

    // Learned skills
    skills: [
      { id: "strike" }
    ],

    // Status effects
    statuses: []
  };
}

// ============ RUN STATE ============
export function createNewRun(player) {
  return {
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
      goldEarned: 0,
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

// ============ RANK SYSTEM ============
const RANKS = ["E", "D", "C", "B", "A", "S"];

export function getRankIndex(rank) {
  return RANKS.indexOf(rank);
}

export function getNextRank(rank) {
  const idx = RANKS.indexOf(rank);
  if (idx < RANKS.length - 1) {
    return RANKS[idx + 1];
  }
  return rank;
}

// ============ LEVEL UP LOGIC (DISABLED IN SIMPLIFIED MODE) ============

export function calculateXpToNext(level) {
  return 999999;  // Never levels up in simplified mode
}

/**
 * Check for level up - DISABLED in simplified mode
 */
export function checkLevelUp(player) {
  // No leveling in simplified mode
  return [];
}

// ============ STAT ALLOCATION (DISABLED IN SIMPLIFIED MODE) ============

/**
 * Allocate stat point - DISABLED in simplified mode
 */
export function allocateStat(player, statName) {
  return { success: false, error: 'Stat allocation disabled in simplified mode' };
}

/**
 * Recalculate player resources - SIMPLIFIED
 * No stat-based calculations, just pass through
 */
export function recalculatePlayerResources(player, equipmentBonuses = {}, healDifference = true) {
  // In simplified mode, maxHp/maxSp are fixed
  // No recalculation needed
}

/**
 * Get full player stats - SIMPLIFIED
 */
export function getFullPlayerStats(player, equipmentBonuses = {}) {
  return {
    attack: player.attack || 15,
    hp: player.hp,
    maxHp: player.maxHp,
    sp: player.sp,
    maxSp: player.maxSp,
    // Stub out old stats for compatibility
    atk: player.attack || 15,
    def: 0,
    matk: 0,
    mdef: 0,
    hit: 100,
    flee: 0,
    crit: 0,
    statPoints: 0
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
