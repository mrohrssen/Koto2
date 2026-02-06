/**
 * @fileoverview Enemy definitions, boss data, intent AI, and dialogue system
 * @module src/game/enemies
 *
 * PURPOSE:
 * Defines all enemies and bosses for NEO TOKYO. Each enemy is a citizen possessed
 * by the SYSTEM AI. Enemies are organized by tier and ward location.
 *
 * KEY EXPORTS:
 * Constants:
 * - INTENT_TYPES - Attack, heavy, defend, special, rage intents
 * - ENEMY_INTENTS - Per-enemy intent patterns (default + lowHp behavior)
 * - ENEMY_ABILITIES - Special abilities indexed by enemy ID
 * - BOSS_INTENTS - Boss-specific intent patterns
 * - ENEMY_TEMPLATES - Enemy definitions from data/enemies.json
 * - FLOOR_BOSSES, FINAL_BOSS, BOSS_DROPS - Boss data from data/bosses.json
 * - WARD_LOCATIONS, FLOOR_TO_WARD - Ward mappings from data/enemy-mappings.json
 *
 * Functions:
 * - generateEnemy(floor) - Create random enemy instance for floor
 * - getBossForFloor(floor) - Get boss definition for floor
 * - getBossDrop(floor) - Get boss reward for floor
 * - selectEnemyIntent(enemy, turnCount) - AI intent selection
 * - getEnemyAbility(enemyId) - Get special ability if any
 * - getEnemiesForFloor(floor, useLocations) - Get valid enemies for floor
 * - getEnemyDisplayStats(enemy) - Get UI-friendly stats
 * - transformEnemy(enemy, targetTier) - Scale enemy to different tier
 * - getAllEnemyIds() / getEnemyById(id) - Enemy lookup
 * - getLiberationTrackerData(tracker) - Liberation progress data
 *
 * ENEMY STATS:
 * - Enemies have: attack, maxHp (simplified system)
 * - Attack/HP scales by tier (1-4)
 * - Tier 1: ~10 attack, ~120 HP; Tier 4: ~30 attack, ~450 HP
 * - Bosses: ~30-40 attack, ~600-900 HP
 *
 * DEPENDENCIES:
 * - data/enemies.json - Enemy template definitions
 * - data/bosses.json - Boss data and drops
 * - data/enemy-mappings.json - Ward/floor location mappings
 */

// Enemy template data extracted to JSON for maintainability
import enemyTemplatesData from '../../data/enemies.json' with { type: 'json' };
import bossData from '../../data/bosses.json' with { type: 'json' };
import enemyMappings from '../../data/enemy-mappings.json' with { type: 'json' };

// ============ INTENT TYPES ============
// Each intent determines what the enemy will do on their turn
export const INTENT_TYPES = {
  attack: {
    id: 'attack',
    icon: '⚔️',
    name: '攻撃',
    nameEn: 'Attack',
    description: 'Normal attack incoming',
    damageMultiplier: 1.0
  },
  heavy: {
    id: 'heavy',
    icon: '💥',
    name: '強攻撃',
    nameEn: 'Heavy Attack',
    description: 'Powerful attack - consider defending!',
    damageMultiplier: 2.0
  },
  defend: {
    id: 'defend',
    icon: '🛡️',
    name: '防御',
    nameEn: 'Defend',
    description: 'Enemy is defending - they take less damage',
    damageMultiplier: 0,
    defenseMultiplier: 0.5
  },
  special: {
    id: 'special',
    icon: '⚡',
    name: '特殊',
    nameEn: 'Special',
    description: 'Unique ability!',
    damageMultiplier: 0
  },
  rage: {
    id: 'rage',
    icon: '🔥',
    name: '激怒',
    nameEn: 'Rage',
    description: 'Enraged! +50% damage',
    damageMultiplier: 1.5,
    enrage: true
  }
};

// ============ ENEMY INTENT PATTERNS ============
// Define how each enemy chooses their next intent
export const ENEMY_INTENTS = {
  // Tier 1
  sleepyStudent: {
    default: [
      { intent: 'attack', weight: 70 },
      { intent: 'heavy', weight: 20 },
      { intent: 'defend', weight: 10 }
    ],
    lowHp: null // No special behavior
  },
  noisyNeighbor: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'heavy', weight: 20 },
      { intent: 'defend', weight: 20 },
      { intent: 'special', weight: 10 } // Call for backup
    ],
    lowHp: null
  },
  possessedDogWalker: {
    default: [
      { intent: 'attack', weight: 60 },
      { intent: 'heavy', weight: 30 },
      { intent: 'defend', weight: 10 }
    ],
    lowHp: [
      { intent: 'rage', weight: 60 },
      { intent: 'heavy', weight: 40 }
    ],
    lowHpThreshold: 0.3
  },

  // Tier 2
  expressionlessClerk: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'heavy', weight: 30 },
      { intent: 'defend', weight: 20 }
    ],
    lowHp: null
  },
  drunkSalaryman: {
    default: [
      { intent: 'attack', weight: 40 },
      { intent: 'heavy', weight: 40 },
      { intent: 'defend', weight: 20 }
    ],
    lowHp: [
      { intent: 'rage', weight: 70 },
      { intent: 'heavy', weight: 30 }
    ],
    lowHpThreshold: 0.5
  },
  strictTeacher: {
    default: [
      { intent: 'attack', weight: 40 },
      { intent: 'special', weight: 40 }, // Magic attack
      { intent: 'defend', weight: 20 }
    ],
    lowHp: null
  },

  // Tier 3
  powerHarassingBoss: {
    default: [
      { intent: 'attack', weight: 40 },
      { intent: 'heavy', weight: 30 },
      { intent: 'defend', weight: 30 }
    ],
    lowHp: [
      { intent: 'heavy', weight: 60 },
      { intent: 'attack', weight: 40 }
    ],
    lowHpThreshold: 0.3
  },
  foreignCorpExecutive: {
    default: [
      { intent: 'attack', weight: 30 },
      { intent: 'special', weight: 40 }, // Fire magic
      { intent: 'heavy', weight: 30 }
    ],
    lowHp: [
      { intent: 'rage', weight: 50 },
      { intent: 'special', weight: 50 }
    ],
    lowHpThreshold: 0.4
  },
  strictSecurityGuard: {
    default: [
      { intent: 'heavy', weight: 60 },
      { intent: 'defend', weight: 40 }
    ],
    lowHp: null
  },

  // Tier 4
  topBureaucrat: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'special', weight: 30 }, // Vanish
      { intent: 'heavy', weight: 20 }
    ],
    lowHp: [
      { intent: 'special', weight: 70 },
      { intent: 'attack', weight: 30 }
    ],
    lowHpThreshold: 0.4
  },
  systemExecutive: {
    default: [
      { intent: 'attack', weight: 30 },
      { intent: 'heavy', weight: 30 },
      { intent: 'special', weight: 30 }, // Breath attack
      { intent: 'defend', weight: 10 }
    ],
    lowHp: [
      { intent: 'rage', weight: 40 },
      { intent: 'special', weight: 40 },
      { intent: 'heavy', weight: 20 }
    ],
    lowHpThreshold: 0.3
  },

  // ===== NEW ENEMY INTENTS =====
  // Tier 1 - New
  kindGrandmother: {
    default: [
      { intent: 'attack', weight: 60 },
      { intent: 'defend', weight: 30 },
      { intent: 'special', weight: 10 }
    ],
    lowHp: null
  },
  busyHousewife: {
    default: [
      { intent: 'attack', weight: 55 },
      { intent: 'heavy', weight: 25 },
      { intent: 'defend', weight: 20 }
    ],
    lowHp: null
  },
  deliveryPerson: {
    default: [
      { intent: 'attack', weight: 60 },
      { intent: 'heavy', weight: 30 },
      { intent: 'defend', weight: 10 }
    ],
    lowHp: null
  },
  neighborhoodKid: {
    default: [
      { intent: 'attack', weight: 70 },
      { intent: 'heavy', weight: 15 },
      { intent: 'defend', weight: 15 }
    ],
    lowHp: null
  },
  irritatedCustomer: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'heavy', weight: 35 },
      { intent: 'rage', weight: 15 }
    ],
    lowHp: [
      { intent: 'rage', weight: 60 },
      { intent: 'heavy', weight: 40 }
    ],
    lowHpThreshold: 0.4
  },
  nightShiftWorker: {
    default: [
      { intent: 'attack', weight: 70 },
      { intent: 'defend', weight: 30 }
    ],
    lowHp: null
  },
  confusedOldMan: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'defend', weight: 40 },
      { intent: 'heavy', weight: 10 }
    ],
    lowHp: null
  },
  rushingOfficeWorker: {
    default: [
      { intent: 'attack', weight: 60 },
      { intent: 'heavy', weight: 25 },
      { intent: 'defend', weight: 15 }
    ],
    lowHp: null
  },

  // School enemies
  studentCouncilPresident: {
    default: [
      { intent: 'attack', weight: 45 },
      { intent: 'heavy', weight: 30 },
      { intent: 'special', weight: 25 }
    ],
    lowHp: null
  },
  schoolNurse: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'defend', weight: 35 },
      { intent: 'special', weight: 15 }
    ],
    lowHp: null
  },
  gymTeacher: {
    default: [
      { intent: 'attack', weight: 40 },
      { intent: 'heavy', weight: 40 },
      { intent: 'rage', weight: 20 }
    ],
    lowHp: [
      { intent: 'rage', weight: 70 },
      { intent: 'heavy', weight: 30 }
    ],
    lowHpThreshold: 0.3
  },
  quietLibrarian: {
    default: [
      { intent: 'attack', weight: 60 },
      { intent: 'defend', weight: 30 },
      { intent: 'special', weight: 10 }
    ],
    lowHp: null
  },
  loudDelinquent: {
    default: [
      { intent: 'attack', weight: 45 },
      { intent: 'heavy', weight: 35 },
      { intent: 'rage', weight: 20 }
    ],
    lowHp: [
      { intent: 'rage', weight: 60 },
      { intent: 'heavy', weight: 40 }
    ],
    lowHpThreshold: 0.4
  },
  runningStudent: {
    default: [
      { intent: 'attack', weight: 65 },
      { intent: 'heavy', weight: 20 },
      { intent: 'defend', weight: 15 }
    ],
    lowHp: null
  },

  // Office enemies
  tiredSalaryman: {
    default: [
      { intent: 'attack', weight: 60 },
      { intent: 'defend', weight: 30 },
      { intent: 'heavy', weight: 10 }
    ],
    lowHp: null
  },
  eagerNewEmployee: {
    default: [
      { intent: 'attack', weight: 55 },
      { intent: 'heavy', weight: 25 },
      { intent: 'defend', weight: 20 }
    ],
    lowHp: null
  },
  chattyOfficeLady: {
    default: [
      { intent: 'attack', weight: 60 },
      { intent: 'special', weight: 25 },
      { intent: 'defend', weight: 15 }
    ],
    lowHp: null
  },
  coldReceptionist: {
    default: [
      { intent: 'attack', weight: 55 },
      { intent: 'defend', weight: 35 },
      { intent: 'heavy', weight: 10 }
    ],
    lowHp: null
  },
  sleepingManager: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'heavy', weight: 30 },
      { intent: 'defend', weight: 20 }
    ],
    lowHp: null
  },
  itSupport: {
    default: [
      { intent: 'attack', weight: 40 },
      { intent: 'special', weight: 40 },
      { intent: 'defend', weight: 20 }
    ],
    lowHp: null
  },

  // Station enemies
  preciseStationStaff: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'heavy', weight: 30 },
      { intent: 'defend', weight: 20 }
    ],
    lowHp: null
  },
  lostTourist: {
    default: [
      { intent: 'attack', weight: 65 },
      { intent: 'defend', weight: 25 },
      { intent: 'heavy', weight: 10 }
    ],
    lowHp: null
  },
  platformPusher: {
    default: [
      { intent: 'attack', weight: 45 },
      { intent: 'heavy', weight: 40 },
      { intent: 'defend', weight: 15 }
    ],
    lowHp: null
  },
  trainOtaku: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'special', weight: 35 },
      { intent: 'defend', weight: 15 }
    ],
    lowHp: null
  },

  // Restaurant enemies
  energeticManager: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'heavy', weight: 30 },
      { intent: 'special', weight: 20 }
    ],
    lowHp: null
  },
  silentChef: {
    default: [
      { intent: 'attack', weight: 45 },
      { intent: 'heavy', weight: 40 },
      { intent: 'defend', weight: 15 }
    ],
    lowHp: null
  },
  friendlyWaiter: {
    default: [
      { intent: 'attack', weight: 55 },
      { intent: 'special', weight: 30 },
      { intent: 'defend', weight: 15 }
    ],
    lowHp: null
  },
  regularCustomer: {
    default: [
      { intent: 'attack', weight: 60 },
      { intent: 'defend', weight: 30 },
      { intent: 'heavy', weight: 10 }
    ],
    lowHp: null
  },
  drunkGroup: {
    default: [
      { intent: 'attack', weight: 40 },
      { intent: 'heavy', weight: 35 },
      { intent: 'rage', weight: 25 }
    ],
    lowHp: [
      { intent: 'rage', weight: 60 },
      { intent: 'heavy', weight: 40 }
    ],
    lowHpThreshold: 0.4
  },
  partTimerStudent: {
    default: [
      { intent: 'attack', weight: 65 },
      { intent: 'defend', weight: 25 },
      { intent: 'heavy', weight: 10 }
    ],
    lowHp: null
  },

  // Government enemies
  boredCivilServant: {
    default: [
      { intent: 'attack', weight: 55 },
      { intent: 'defend', weight: 35 },
      { intent: 'heavy', weight: 10 }
    ],
    lowHp: null
  },
  confusedApplicant: {
    default: [
      { intent: 'attack', weight: 60 },
      { intent: 'defend', weight: 30 },
      { intent: 'heavy', weight: 10 }
    ],
    lowHp: null
  },
  strictSectionChief: {
    default: [
      { intent: 'attack', weight: 45 },
      { intent: 'heavy', weight: 35 },
      { intent: 'defend', weight: 20 }
    ],
    lowHp: null
  },
  kindlyWindowStaff: {
    default: [
      { intent: 'attack', weight: 55 },
      { intent: 'defend', weight: 35 },
      { intent: 'special', weight: 10 }
    ],
    lowHp: null
  },
  angryCitizen: {
    default: [
      { intent: 'attack', weight: 45 },
      { intent: 'heavy', weight: 35 },
      { intent: 'rage', weight: 20 }
    ],
    lowHp: [
      { intent: 'rage', weight: 70 },
      { intent: 'heavy', weight: 30 }
    ],
    lowHpThreshold: 0.4
  },

  // Hospital enemies
  kindNurse: {
    default: [
      { intent: 'attack', weight: 55 },
      { intent: 'defend', weight: 30 },
      { intent: 'special', weight: 15 }
    ],
    lowHp: null
  },
  coldDoctor: {
    default: [
      { intent: 'attack', weight: 45 },
      { intent: 'special', weight: 35 },
      { intent: 'defend', weight: 20 }
    ],
    lowHp: null
  },
  worriedPatient: {
    default: [
      { intent: 'attack', weight: 55 },
      { intent: 'defend', weight: 35 },
      { intent: 'heavy', weight: 10 }
    ],
    lowHp: null
  },
  calmPharmacist: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'special', weight: 30 },
      { intent: 'defend', weight: 20 }
    ],
    lowHp: null
  },
  cryingChild: {
    default: [
      { intent: 'attack', weight: 70 },
      { intent: 'defend', weight: 20 },
      { intent: 'heavy', weight: 10 }
    ],
    lowHp: null
  },

  // Shopping enemies
  pushySalesperson: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'heavy', weight: 30 },
      { intent: 'special', weight: 20 }
    ],
    lowHp: null
  },
  indecisiveShopper: {
    default: [
      { intent: 'attack', weight: 60 },
      { intent: 'defend', weight: 30 },
      { intent: 'heavy', weight: 10 }
    ],
    lowHp: null
  },
  veteranCashier: {
    default: [
      { intent: 'attack', weight: 55 },
      { intent: 'heavy', weight: 30 },
      { intent: 'defend', weight: 15 }
    ],
    lowHp: null
  },
  stockingWorker: {
    default: [
      { intent: 'attack', weight: 60 },
      { intent: 'defend', weight: 30 },
      { intent: 'heavy', weight: 10 }
    ],
    lowHp: null
  },
  complainerCustomer: {
    default: [
      { intent: 'attack', weight: 45 },
      { intent: 'heavy', weight: 35 },
      { intent: 'rage', weight: 20 }
    ],
    lowHp: [
      { intent: 'rage', weight: 70 },
      { intent: 'heavy', weight: 30 }
    ],
    lowHpThreshold: 0.4
  }
};

// ============ ENEMY ABILITIES (SYSTEM Glitches) ============
// Unique abilities that trigger under certain conditions
export const ENEMY_ABILITIES = {
  sleepyStudent: {
    id: 'split',
    name: '意識分裂',
    nameEn: 'Split Consciousness',
    trigger: 'onLowHp',
    threshold: 0.4,
    description: 'SYSTEM splits their consciousness into two when damaged',
    effect: 'split'
  },
  noisyNeighbor: {
    id: 'callBackup',
    name: '騒音拡散',
    nameEn: 'Noise Spread',
    trigger: 'onTurn',
    turnNumber: 4,
    description: 'Calls another possessed neighbor for backup',
    effect: 'summon',
    summonId: 'noisyNeighbor'
  },
  possessedDogWalker: {
    id: 'cornered',
    name: 'パニック',
    nameEn: 'Panic Mode',
    trigger: 'onLowHp',
    threshold: 0.3,
    description: 'Panics when cornered, gains +50% ATK',
    effect: 'buff',
    buffType: 'atk',
    buffAmount: 0.5
  },
  expressionlessClerk: {
    id: 'reassemble',
    name: 'システム再起動',
    nameEn: 'System Reboot',
    trigger: 'onDeath',
    uses: 1,
    description: 'SYSTEM reboots them once with 30% HP',
    effect: 'revive',
    revivePercent: 0.3
  },
  drunkSalaryman: {
    id: 'berserk',
    name: '酔狂モード',
    nameEn: 'Drunk Rage',
    trigger: 'onLowHp',
    threshold: 0.5,
    description: 'Alcohol amplifies aggression - 2x ATK, 0.5x DEF',
    effect: 'berserk',
    atkMultiplier: 2.0,
    defMultiplier: 0.5
  },
  strictTeacher: {
    id: 'barrier',
    name: '規則の壁',
    nameEn: 'Rule Barrier',
    trigger: 'onTurn',
    turnInterval: 3,
    description: 'Creates a barrier of regulations that absorbs one hit',
    effect: 'barrier'
  },
  powerHarassingBoss: {
    id: 'riposte',
    name: '報復人事',
    nameEn: 'Retaliation',
    trigger: 'onDefend',
    description: 'Counter-attacks when defending their position',
    effect: 'counter',
    counterDamage: 0.5
  },
  foreignCorpExecutive: {
    id: 'hellfire',
    name: 'リストラ宣告',
    nameEn: 'Layoff Declaration',
    trigger: 'special',
    description: 'Unleashes corporate restructuring magic',
    effect: 'magic',
    magicMultiplier: 1.5
  },
  strictSecurityGuard: {
    id: 'stoneForm',
    name: '鉄壁の警備',
    nameEn: 'Iron Defense',
    trigger: 'passive',
    description: 'Takes 20% less damage from all attacks',
    effect: 'resistance',
    physicalResist: 0.2
  },
  topBureaucrat: {
    id: 'vanish',
    name: '官僚的回避',
    nameEn: 'Bureaucratic Dodge',
    trigger: 'special',
    description: 'Becomes untargetable through paperwork for one turn',
    effect: 'vanish'
  },
  systemExecutive: {
    id: 'dragonBreath',
    name: 'データ放射',
    nameEn: 'Data Broadcast',
    trigger: 'special',
    description: 'Broadcasts SYSTEM propaganda dealing damage',
    effect: 'breath',
    breathMultiplier: 1.8
  }
};

// ============ BOSS INTENT PATTERNS ============
export const BOSS_INTENTS = {
  boss_goblin_king: {
    phase1: [
      { intent: 'attack', weight: 40 },
      { intent: 'heavy', weight: 30 },
      { intent: 'special', weight: 30 } // Rally (buff self)
    ],
    phase2: [
      { intent: 'rage', weight: 40 },
      { intent: 'heavy', weight: 40 },
      { intent: 'special', weight: 20 }
    ],
    phaseThreshold: 0.5
  },
  boss_wolf_alpha: {
    phase1: [
      { intent: 'attack', weight: 50 },
      { intent: 'heavy', weight: 30 },
      { intent: 'special', weight: 20 } // Howl
    ],
    phase2: [
      { intent: 'rage', weight: 60 },
      { intent: 'heavy', weight: 40 }
    ],
    phaseThreshold: 0.4
  },
  boss_lich: {
    phase1: [
      { intent: 'special', weight: 50 }, // Dark magic
      { intent: 'defend', weight: 30 },
      { intent: 'attack', weight: 20 }
    ],
    phase2: [
      { intent: 'special', weight: 70 },
      { intent: 'heavy', weight: 30 }
    ],
    phaseThreshold: 0.5
  },
  boss_ogre: {
    phase1: [
      { intent: 'heavy', weight: 50 },
      { intent: 'attack', weight: 30 },
      { intent: 'defend', weight: 20 }
    ],
    phase2: [
      { intent: 'rage', weight: 50 },
      { intent: 'heavy', weight: 50 }
    ],
    phaseThreshold: 0.4
  },
  boss_demon_lord: {
    phase1: [
      { intent: 'special', weight: 40 },
      { intent: 'heavy', weight: 30 },
      { intent: 'attack', weight: 30 }
    ],
    phase2: [
      { intent: 'rage', weight: 40 },
      { intent: 'special', weight: 40 },
      { intent: 'heavy', weight: 20 }
    ],
    phaseThreshold: 0.5
  },
  boss_dragon_elder: {
    phase1: [
      { intent: 'special', weight: 40 }, // Breath
      { intent: 'heavy', weight: 30 },
      { intent: 'defend', weight: 30 }
    ],
    phase2: [
      { intent: 'rage', weight: 30 },
      { intent: 'special', weight: 50 },
      { intent: 'heavy', weight: 20 }
    ],
    phaseThreshold: 0.4
  },
  boss_shadow_monarch: {
    phase1: [
      { intent: 'attack', weight: 30 },
      { intent: 'special', weight: 40 },
      { intent: 'defend', weight: 30 }
    ],
    phase2: [
      { intent: 'special', weight: 50 },
      { intent: 'heavy', weight: 30 },
      { intent: 'rage', weight: 20 }
    ],
    phase3: [
      { intent: 'rage', weight: 40 },
      { intent: 'special', weight: 40 },
      { intent: 'heavy', weight: 20 }
    ],
    phaseThreshold: 0.6,
    phase3Threshold: 0.3
  }
};

// ============ INTENT SELECTION ============

/**
 * Select next intent for an enemy based on their pattern and current state
 */
export function selectEnemyIntent(enemy, turnCount = 1) {
  const enemyId = enemy.id.replace('boss_', '');
  const hpPercent = enemy.hp / enemy.maxHp;

  // Get intent pattern
  let pattern;
  if (enemy.isBoss) {
    pattern = BOSS_INTENTS[enemy.id];
    if (!pattern) pattern = BOSS_INTENTS.boss_goblin_king; // fallback

    // Determine phase
    if (pattern.phase3 && hpPercent <= pattern.phase3Threshold) {
      pattern = pattern.phase3;
    } else if (hpPercent <= pattern.phaseThreshold) {
      pattern = pattern.phase2;
    } else {
      pattern = pattern.phase1;
    }
  } else {
    pattern = ENEMY_INTENTS[enemyId];
    if (!pattern) pattern = ENEMY_INTENTS.sleepyStudent; // fallback

    // Check for low HP pattern
    if (pattern.lowHp && hpPercent <= (pattern.lowHpThreshold || 0.3)) {
      pattern = pattern.lowHp;
    } else {
      pattern = pattern.default;
    }
  }

  // Weighted random selection
  const totalWeight = pattern.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const option of pattern) {
    roll -= option.weight;
    if (roll <= 0) {
      return INTENT_TYPES[option.intent];
    }
  }

  // Fallback to attack
  return INTENT_TYPES.attack;
}

/**
 * Get ability for an enemy type
 */
export function getEnemyAbility(enemyId) {
  const id = enemyId.replace('boss_', '');
  return ENEMY_ABILITIES[id] || null;
}

// Re-export the imported JSON data
export const ENEMY_TEMPLATES = enemyTemplatesData;


// Re-export boss data from JSON
export const FLOOR_BOSSES = bossData.floorBosses;
export const FINAL_BOSS = bossData.finalBoss;
export const BOSS_DROPS = bossData.bossDrops;

// Re-export ward/floor mappings from JSON
export const WARD_LOCATIONS = enemyMappings.wardLocations;
export const FLOOR_TO_WARD = enemyMappings.floorToWard;

// ============ HELPER FUNCTIONS ============

/**
 * Build a combat-ready enemy from a template - SIMPLIFIED
 * Uses flat attack/maxHp based on tier, no levels
 */
function buildEnemy(template, levelBonus = 0) {
  // SIMPLIFIED: attack and maxHp based on tier
  // Tier 1: attack 8-12, HP 120-180
  // Tier 2: attack 12-18, HP 180-270
  // Tier 3: attack 18-25, HP 270-390
  // Tier 4: attack 25-35, HP 390-540
  // Bosses: attack 20-40, HP 450-900

  const tier = template.tier || 1;
  const isBoss = template.isBoss || false;

  let baseAttack, baseHp;

  if (isBoss) {
    // Bosses are stronger
    baseAttack = 20 + (tier * 5);
    baseHp = 225 + (tier * 60);
  } else {
    // Regular enemies scale by tier
    baseAttack = 5 + (tier * 4);
    baseHp = 45 + (tier * 30);
  }

  // Add some variance (±20%)
  const attackVariance = 0.8 + Math.random() * 0.4;
  const hpVariance = 0.8 + Math.random() * 0.4;

  const attack = Math.floor(baseAttack * attackVariance);
  const maxHp = Math.floor(baseHp * hpVariance);

  return {
    ...template,
    level: 1,  // Fixed level for compatibility
    stats: {},  // No primary stats in simplified mode
    // SIMPLIFIED: just attack and maxHp
    attack,
    atk: attack,  // Alias for compatibility
    hp: maxHp,
    maxHp,
    sp: 0,
    maxSp: 0,
    // Stub out old stats for compatibility
    def: 0,
    matk: attack,
    mdef: 0,
    hit: 100,
    flee: 0,
    crit: 0,
    critShield: 0,
    perfectDodge: 0
  };
}

// Get all enemies of a specific tier
export function getEnemiesByTier(tier) {
  return Object.values(ENEMY_TEMPLATES).filter(e => e.tier === tier);
}

// Get enemies by location type(s)
export function getEnemiesByLocation(locations, tier = null) {
  return Object.values(ENEMY_TEMPLATES).filter(e => {
    // Filter by tier if specified
    if (tier !== null && e.tier !== tier) return false;
    // Check if enemy has any of the specified locations
    if (!e.locations) return true; // Legacy enemies without locations still appear
    return e.locations.some(loc => locations.includes(loc));
  });
}

// Get enemies for a specific floor (with location filtering)
export function getEnemiesForFloor(floor, useLocations = true) {
  // Determine tier based on floor
  let tier;
  if (floor <= 2) tier = 1;
  else if (floor <= 4) tier = 2;
  else if (floor <= 6) tier = 3;
  else tier = 4;

  // Endless mode (floor > 7): return all enemies from pool
  if (floor > 7) {
    return Object.values(ENEMY_TEMPLATES);
  }

  // If location filtering is disabled, use tier-only
  if (!useLocations) {
    return getEnemiesByTier(tier);
  }

  // Get ward for this floor
  const ward = FLOOR_TO_WARD[floor];
  if (!ward) {
    return getEnemiesByTier(tier);
  }

  // Get locations for this ward
  const locations = WARD_LOCATIONS[ward];
  if (!locations) {
    return getEnemiesByTier(tier);
  }

  // Get enemies matching both tier and location
  const locationEnemies = getEnemiesByLocation(locations, tier);

  // Fall back to tier-only if no location matches
  if (locationEnemies.length === 0) {
    return getEnemiesByTier(tier);
  }

  return locationEnemies;
}

// Generate a random enemy for the floor - SIMPLIFIED
export function generateEnemy(floor) {
  const enemies = getEnemiesForFloor(floor);
  const template = enemies[Math.floor(Math.random() * enemies.length)];

  // For endless floors, override template tier with floor-derived tier
  const effectiveTemplate = floor > 7
    ? { ...template, tier: Math.ceil(floor / 2) }
    : template;

  const enemy = buildEnemy(effectiveTemplate, 0);

  enemy.xpReward = 0;
  enemy.creditReward = template.creditReward || 20;

  return enemy;
}

// Get boss for a specific floor
export function getBossForFloor(floor) {
  let template;

  if (floor > 7) {
    // Endless mode: pick a random boss, scale to current tier
    const allBosses = Object.values(FLOOR_BOSSES);
    const base = allBosses[Math.floor(Math.random() * allBosses.length)];
    template = { ...base, tier: Math.ceil(floor / 2) };
  } else if (floor === 7) {
    template = FINAL_BOSS;
  } else {
    template = FLOOR_BOSSES[floor];
  }

  if (!template) return null;

  return buildEnemy(template);
}

// Get random boss drop
export function getBossDrop(floor) {
  const drops = BOSS_DROPS[floor];
  if (!drops || drops.length === 0) return null;

  return drops[Math.floor(Math.random() * drops.length)];
}

/**
 * Get enemy's full stats for combat display
 */
export function getEnemyDisplayStats(enemy) {
  return {
    // Primary stats
    str: enemy.stats.str,
    agi: enemy.stats.agi,
    vit: enemy.stats.vit,
    int: enemy.stats.int,
    dex: enemy.stats.dex,
    luk: enemy.stats.luk,
    // Derived stats
    atk: enemy.atk,
    def: enemy.def,
    matk: enemy.matk,
    mdef: enemy.mdef,
    hit: enemy.hit,
    flee: enemy.flee,
    crit: enemy.crit,
    // Resources
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    sp: enemy.sp,
    maxSp: enemy.maxSp,
    level: enemy.level
  };
}

/**
 * Transform an enemy into a weaker version (lower tier)
 * Used by weapons with the transform effect (e.g., Azoth)
 * @param {object} enemy - The enemy to transform
 * @param {number} targetTier - The tier to transform to (1-4)
 * @returns {object|null} The transformed enemy or null if failed
 */
export function transformEnemy(enemy, targetTier = 1) {
  // Can't transform bosses
  if (enemy.isBoss) {
    return null;
  }

  // Can't transform if already at or below target tier
  if (enemy.tier && enemy.tier <= targetTier) {
    return null;
  }

  // Ensure valid target tier
  const tier = Math.max(1, Math.min(4, targetTier));

  // Get a random enemy from the target tier
  const enemies = getEnemiesByTier(tier);
  if (!enemies || enemies.length === 0) {
    return null;
  }

  const template = enemies[Math.floor(Math.random() * enemies.length)];
  const transformed = buildEnemy(template, 0);

  // Keep the current HP percentage
  const hpPercent = enemy.hp / enemy.maxHp;
  transformed.hp = Math.max(1, Math.floor(transformed.maxHp * hpPercent));

  // Preserve any status effects
  transformed.statuses = enemy.statuses || [];

  return transformed;
}

// ============ DIALOGUE HELPERS ============

/**
 * Pick a random voice line from a dialogue state.
 * Handles both old string format and new array format for backwards compatibility.
 * @param {string|string[]} dialogueState - Single string or array of strings
 * @returns {string|null} Random voice line or null if not available
 */
export function pickRandomVoiceLine(dialogueState) {
  if (!dialogueState) return null;
  if (typeof dialogueState === 'string') return dialogueState;
  if (Array.isArray(dialogueState) && dialogueState.length > 0) {
    return dialogueState[Math.floor(Math.random() * dialogueState.length)];
  }
  return null;
}

// ============ LIBERATION TRACKER HELPERS ============

/**
 * Get all unique enemy IDs (regular + bosses)
 */
export function getAllEnemyIds() {
  const regularIds = Object.keys(ENEMY_TEMPLATES);
  const bossIds = Object.values(FLOOR_BOSSES).map(b => b.id);
  return [...regularIds, ...bossIds, FINAL_BOSS.id];
}

/**
 * Get enemy template by ID (regular or boss)
 */
export function getEnemyById(id) {
  // Check regular enemies first
  if (ENEMY_TEMPLATES[id]) {
    return { ...ENEMY_TEMPLATES[id], id };
  }
  // Check floor bosses
  for (const boss of Object.values(FLOOR_BOSSES)) {
    if (boss.id === id) {
      return boss;
    }
  }
  // Check final boss
  if (FINAL_BOSS.id === id) {
    return FINAL_BOSS;
  }
  return null;
}

/**
 * Get liberation tracker data formatted for UI
 */
export function getLiberationTrackerData(liberationTracker = {}) {
  const allIds = getAllEnemyIds();
  const data = {
    liberated: [],
    notLiberated: [],
    totalCount: allIds.length,
    liberatedCount: 0
  };

  for (const id of allIds) {
    const enemy = getEnemyById(id);
    if (!enemy) continue;

    const tracker = liberationTracker[id];
    if (tracker && tracker.count > 0) {
      data.liberated.push({
        id,
        name: enemy.name,
        nameEn: enemy.nameEn,
        tier: enemy.tier || 'boss',
        isBoss: enemy.isBoss || false,
        count: tracker.count,
        firstLiberated: tracker.firstLiberated,
        dialogue: pickRandomVoiceLine(enemy.dialogue?.liberated) || ''
      });
      data.liberatedCount++;
    } else {
      data.notLiberated.push({
        id,
        name: '???',
        nameEn: '???',
        tier: enemy.tier || 'boss',
        isBoss: enemy.isBoss || false
      });
    }
  }

  return data;
}
