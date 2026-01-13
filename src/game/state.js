// Game State Management
// Handles player, run, and combat state

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
      lastPlayDate: null
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

  // Bonus per boss killed
  essence += (runStats?.bossesDefeated || 0) * 15;

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

// ============ DEFAULT PLAYER STATE ============
export function createNewPlayer(name = "Hunter", customStats = null, customStatPoints = null) {
  const level = 1;

  // Use custom stats if provided (from character creation), otherwise defaults
  const defaultData = getStartingPlayerStats();
  const stats = customStats || defaultData.stats;
  const statPoints = customStatPoints !== null ? customStatPoints : defaultData.statPoints;

  // Calculate initial HP/SP from formulas
  const maxHp = calculateMaxHp(level, stats.vit);
  const maxSp = calculateMaxSp(level, stats.int);

  return {
    name,
    rank: "E",  // E, D, C, B, A, S
    level,
    xp: 0,
    xpToNext: calculateXpToNext(level),

    // Primary stats (iRO-style)
    stats: { ...stats },
    statPoints,  // Points available to allocate

    // Core resources (derived from stats)
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

    // Equipped gear (4 slots) - fixed Hacker class equipment
    equipment: getClassStartingEquipment('hacker'),

    // Learned skills
    skills: [
      { id: "strike" }  // Basic attack skill everyone starts with
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

// ============ LEVEL UP LOGIC ============
export function calculateXpToNext(level) {
  // New XP curve: fast early, slower late
  // Level 2: 20 XP (1 enemy)
  // Level 3: 28 XP (1-2 enemies)
  // Level 4: 36 XP (2 enemies)
  // Level 5: 49 XP (2-3 enemies)
  // Level 6: 72 XP (3-4 enemies)
  // Level 7: 105 XP (5-6 enemies)
  // Level 8+: grows faster
  const base = 20;
  const linear = (level - 1) * 8;
  const quadratic = Math.pow(Math.max(0, level - 3), 2) * 5;
  return Math.floor(base + linear + quadratic);
}

export function checkLevelUp(player) {
  const levelUps = [];

  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level++;
    player.xpToNext = calculateXpToNext(player.level);

    // Award stat points based on level (iRO formula)
    const pointsEarned = getStatPointsForLevel(player.level);
    player.statPoints += pointsEarned;

    // Recalculate max HP/SP (they scale with level even without stat changes)
    // Include equipment bonuses for VIT/INT
    const equipBonuses = calculateEquipmentBonuses(player);
    const totalVit = player.stats.vit + (equipBonuses.vit || 0);
    const totalInt = player.stats.int + (equipBonuses.int || 0);
    const oldMaxHp = player.maxHp;
    const oldMaxSp = player.maxSp;
    player.maxHp = calculateMaxHp(player.level, totalVit, equipBonuses.maxHp || 0);
    player.maxSp = calculateMaxSp(player.level, totalInt, equipBonuses.maxSp || 0);

    // Heal on level up (full restore)
    player.hp = player.maxHp;
    player.sp = player.maxSp;

    levelUps.push({
      newLevel: player.level,
      statPointsEarned: pointsEarned,
      totalStatPoints: player.statPoints,
      maxHpGain: player.maxHp - oldMaxHp,
      maxSpGain: player.maxSp - oldMaxSp
    });

    // Check for rank up (every 5 levels)
    if (player.level % 5 === 0) {
      player.rank = getNextRank(player.rank);
    }
  }

  return levelUps;
}

// ============ STAT ALLOCATION ============

/**
 * Allocate a stat point to a primary stat
 * @param {object} player - Player object
 * @param {string} statName - 'str', 'agi', 'vit', 'int', 'dex', or 'luk'
 * @returns {object} Result with success status and updated values
 */
export function allocateStat(player, statName) {
  const validStats = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];

  if (!validStats.includes(statName)) {
    return { success: false, error: `Invalid stat: ${statName}` };
  }

  const currentValue = player.stats[statName];

  // Check stat cap (99)
  if (currentValue >= 99) {
    return { success: false, error: `${statName.toUpperCase()} is already at maximum (99)` };
  }

  // Calculate cost
  const cost = getStatPointCost(currentValue);

  if (player.statPoints < cost) {
    return { success: false, error: `Not enough stat points (need ${cost}, have ${player.statPoints})` };
  }

  // Spend points and increase stat
  player.statPoints -= cost;
  player.stats[statName]++;

  // Recalculate HP/SP if VIT or INT changed (include equipment bonuses)
  const equipBonuses = calculateEquipmentBonuses(player);
  if (statName === 'vit') {
    const totalVit = player.stats.vit + (equipBonuses.vit || 0);
    const oldMaxHp = player.maxHp;
    player.maxHp = calculateMaxHp(player.level, totalVit, equipBonuses.maxHp || 0);
    // Heal the difference (don't lose HP from stat changes)
    player.hp = Math.min(player.hp + (player.maxHp - oldMaxHp), player.maxHp);
  }

  if (statName === 'int') {
    const totalInt = player.stats.int + (equipBonuses.int || 0);
    const oldMaxSp = player.maxSp;
    player.maxSp = calculateMaxSp(player.level, totalInt, equipBonuses.maxSp || 0);
    player.sp = Math.min(player.sp + (player.maxSp - oldMaxSp), player.maxSp);
  }

  return {
    success: true,
    stat: statName,
    newValue: player.stats[statName],
    pointsSpent: cost,
    pointsRemaining: player.statPoints,
    maxHp: player.maxHp,
    maxSp: player.maxSp
  };
}

/**
 * Recalculate player's max HP/SP based on current stats and equipment
 * Call this after equipment changes (buying chips, equipping gear, etc.)
 * @param {object} player - Player object to update
 * @param {object} equipmentBonuses - Bonuses from equipment (from calculateEquipmentBonuses)
 * @param {boolean} healDifference - If true, increase current HP/SP by the gained amount
 */
export function recalculatePlayerResources(player, equipmentBonuses = {}, healDifference = true) {
  const totalVit = player.stats.vit + (equipmentBonuses.vit || 0);
  const totalInt = player.stats.int + (equipmentBonuses.int || 0);

  const oldMaxHp = player.maxHp;
  const oldMaxSp = player.maxSp;

  player.maxHp = calculateMaxHp(player.level, totalVit, equipmentBonuses.maxHp || 0);
  player.maxSp = calculateMaxSp(player.level, totalInt, equipmentBonuses.maxSp || 0);

  if (healDifference) {
    // Increase current HP/SP by the gained amount (chips give immediate benefit)
    player.hp = Math.min(player.hp + (player.maxHp - oldMaxHp), player.maxHp);
    player.sp = Math.min(player.sp + (player.maxSp - oldMaxSp), player.maxSp);
  }
}

/**
 * Get full player stats including derived stats from equipment
 * @param {object} player - Player object
 * @param {object} equipmentBonuses - Bonuses from equipped gear
 * @returns {object} Complete stats object
 */
export function getFullPlayerStats(player, equipmentBonuses = {}) {
  // Get derived combat stats
  const derived = calculateDerivedStats(
    player.stats,
    player.level,
    equipmentBonuses,
    false  // isRanged - TODO: check weapon type
  );

  return {
    // Primary stats
    ...player.stats,
    statPoints: player.statPoints,

    // Derived combat stats
    atk: derived.atk,
    def: derived.def,
    matk: derived.matk,
    mdef: derived.mdef,
    hit: derived.hit,
    flee: derived.flee,
    crit: derived.crit,
    critShield: derived.critShield,
    perfectDodge: derived.perfectDodge,

    // Resources
    hp: player.hp,
    maxHp: player.maxHp,
    sp: player.sp,
    maxSp: player.maxSp
  };
}

// ============ ENCOUNTER GENERATION ============
export function generateEncounterCount(floor) {
  // Floors have 4-5 encounters before the boss (5-6 rooms total)
  const min = 4;
  const max = 5;
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
