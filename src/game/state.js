// ============ META-PROGRESSION STATE ============

/**
 * Create a fresh meta-progression save
 * This persists across all runs and deaths
 */
export function createMetaProgression() {
  return {
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

    // Area progression (highestUnlocked is 1-based: 1 = first area only)
    levels: { highestUnlocked: 1, completed: [], current: null },

    // NPC bonds (persists across runs)
    npcBonds: {},

    // Whether the intro prologue has been shown
    prologueComplete: false,

    // Whether the player is in hiragana learning mode
    kanaMode: false,

    pvpTeams: [null, null, null],  // 3 saved PvP team slots

    // CID scripts already shown (avoid repeats across runs)
    seenCidScripts: [],

    // Element drops collected from defeating enemies (persistent)
    elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },

    // All owned crests
    crests: [],

    // Equipped crest IDs (one per element slot)
    equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null },

    // Lifetime discovery tracking
    itemsDiscovered: [],   // array of item IDs ever obtained

    // Tutorial state (first-run guided experience)
    tutorialStep: 0,
    tutorialFireDropsGifted: false
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
    areasToWin: 1,               // win condition: 1 area per run
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

    // Boss tracking — boss can be befriended on rematch only
    bossesDefeated: [],

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

    // Party skills (run-scoped, server-owned)
    // Stored as array of objects: { id: string }
    partySkills: [],

    // Initial party skill pick (once per run, before first room)
    initialSkillPick: { offered: null, chosenId: null },

    // Equipment items picked up this run (for UI display)
    equippedItems: [],

    // Item buff stacking (run-scoped)
    itemBuffs: {
      attackMult: 1.0,
      hpMult: 1.0,
      elementEdge: 0,
      flatDamageReduction: 0,
      xpMultiplier: 1.0,
      xpBalanceStacks: 0,
      baseAttackBonus: 0,
      baseHpBonus: 0,
      baseMpBonus: 0
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
    },

    // Adventure report tracking (populated during run, snapshot on end)
    runSummary: {
      creaturesBefriended: 0,
      creaturesDefeated: 0,
      itemsCollected: 0,
      elementsCollected: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
      wordsExposed: [],       // unique word strings seen this run
      wordsMastered: [],      // { word, meaning, exposures } for words crossing threshold
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

    enemy, // Share the reference with enemies[0] — same object, single uid

    allies: [],    // references to run.creatureParty.active
    enemies: [],   // MVP: single enemy creature

    // Party skills (combat-scoped)
    partyHitCounter: 0,       // Legacy — kept for backward compat
    chainHitsThisTurn: 0,     // Chain Surge threshold counter (resets each turn)
    counterCounts: {},        // Per-creature counter stack count for Fury Counter
    afflictionBurstCooldown: {}, // Per-enemy cooldown tracker for Affliction Burst

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
  // Areas have 16-24 rooms
  const min = 16;
  const max = 24;
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

