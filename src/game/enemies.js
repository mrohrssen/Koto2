/**
 * @fileoverview Enemy definitions, boss data, intent AI, and dialogue system
 * @module src/game/enemies
 *
 * PURPOSE:
 * Defines all enemies and bosses for NEO TOKYO. Each enemy is a citizen possessed
 * by the SYSTEM AI. Contains enemy templates with stats, intent patterns for AI
 * decision-making, special abilities, dialogue lines, and boss encounters. Also
 * handles enemy generation based on floor/ward.
 *
 * KEY EXPORTS:
 * Constants:
 * - INTENT_TYPES - Attack/heavy/defend/special/rage intent definitions
 * - ENEMY_INTENTS - Per-enemy AI patterns (weighted random)
 * - ENEMY_ABILITIES - Special abilities (buff, heal, debuff, barrier)
 * - BOSS_INTENTS - Boss-specific AI patterns
 * - ENEMY_TEMPLATES - All enemy definitions with stats, sprites, dialogue
 * - FLOOR_BOSSES - Boss for each floor (1-7)
 * - FINAL_BOSS - Floor 7 boss definition
 * - BOSS_DROPS - Loot tables for boss rewards
 * - WARD_LOCATIONS - Enemy spawn locations by ward
 *
 * Functions:
 * - selectEnemyIntent(enemy, turn) - AI intent selection (weighted random)
 * - getEnemyAbility(enemyId) - Get enemy's special ability
 * - generateEnemy(floor) - Create enemy instance for floor
 * - getBossForFloor(floor) - Get boss definition for floor
 * - getBossDrop(floor) - Get boss loot table
 * - getEnemiesForFloor(floor) - Get valid enemies for floor/ward
 * - transformEnemy(enemy, tier) - Scale enemy to different tier
 *
 * DEPENDENCIES:
 * - ./stats.js - calculateDerivedStats, calculateMaxHp, calculateMaxSp
 *
 * DATA STRUCTURES:
 * - EnemyTemplate: { id, name, tier, baseStats{}, intents[], abilities[],
 *                   sprite, dialogue{ possessed, breaking, freed } }
 * - Intent: { id, icon, name, damageMultiplier, defenseMultiplier? }
 * - IntentPattern: { default: [{intent, weight}], lowHp: [...] }
 *
 * ENEMY TIERS (by floor):
 * - Tier 1 (Floors 1-2): Citizens, students - low stats
 * - Tier 2 (Floors 3-4): Workers, professionals - medium stats
 * - Tier 3 (Floors 5-6): Specialists, officials - high stats
 * - Tier 4 (Floor 7): Elite enemies before final boss
 *
 * DIALOGUE STATES:
 * - possessed: Enemy is fully controlled by SYSTEM
 * - breaking: Enemy is resisting, showing humanity
 * - freed: Enemy is defeated/liberated
 *
 * ARCHITECTURE NOTES:
 * - Enemies spawned via generateEnemy() which picks from floor-appropriate pool
 * - Intent selection uses weighted random from ENEMY_INTENTS
 * - Bosses have unique mechanics via BOSS_INTENTS and ENEMY_ABILITIES
 * - Ward system filters enemies by location (Nerima, Shibuya, etc.)
 * - Stats calculated via iRO formulas from base values
 *
 * CLAUDE HINTS:
 * - For combat execution, see combat/enemy.js
 * - Enemy dialogue displayed via game.js showEnemyDialogue()
 * - To add new enemy: add to ENEMY_TEMPLATES, add intents to ENEMY_INTENTS
 * - Boss special abilities defined in ENEMY_ABILITIES
 * - Ward-based enemy pools in WARD_LOCATIONS
 */

import {
  calculateDerivedStats,
  calculateMaxHp,
  calculateMaxSp
} from './stats.js';

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
  slime: {
    default: [
      { intent: 'attack', weight: 70 },
      { intent: 'heavy', weight: 20 },
      { intent: 'defend', weight: 10 }
    ],
    lowHp: null // No special behavior
  },
  goblin: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'heavy', weight: 20 },
      { intent: 'defend', weight: 20 },
      { intent: 'special', weight: 10 } // Call for backup
    ],
    lowHp: null
  },
  wolf: {
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
  skeleton: {
    default: [
      { intent: 'attack', weight: 50 },
      { intent: 'heavy', weight: 30 },
      { intent: 'defend', weight: 20 }
    ],
    lowHp: null
  },
  orc: {
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
  mage: {
    default: [
      { intent: 'attack', weight: 40 },
      { intent: 'special', weight: 40 }, // Magic attack
      { intent: 'defend', weight: 20 }
    ],
    lowHp: null
  },

  // Tier 3
  knight: {
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
  demon: {
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
  golem: {
    default: [
      { intent: 'heavy', weight: 60 },
      { intent: 'defend', weight: 40 }
    ],
    lowHp: null
  },

  // Tier 4
  shadow: {
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
  dragon: {
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
  slime: {
    id: 'split',
    name: '意識分裂',
    nameEn: 'Split Consciousness',
    trigger: 'onLowHp',
    threshold: 0.4,
    description: 'SYSTEM splits their consciousness into two when damaged',
    effect: 'split'
  },
  goblin: {
    id: 'callBackup',
    name: '騒音拡散',
    nameEn: 'Noise Spread',
    trigger: 'onTurn',
    turnNumber: 4,
    description: 'Calls another possessed neighbor for backup',
    effect: 'summon',
    summonId: 'goblin'
  },
  wolf: {
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
  skeleton: {
    id: 'reassemble',
    name: 'システム再起動',
    nameEn: 'System Reboot',
    trigger: 'onDeath',
    uses: 1,
    description: 'SYSTEM reboots them once with 30% HP',
    effect: 'revive',
    revivePercent: 0.3
  },
  orc: {
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
  mage: {
    id: 'barrier',
    name: '規則の壁',
    nameEn: 'Rule Barrier',
    trigger: 'onTurn',
    turnInterval: 3,
    description: 'Creates a barrier of regulations that absorbs one hit',
    effect: 'barrier'
  },
  knight: {
    id: 'riposte',
    name: '報復人事',
    nameEn: 'Retaliation',
    trigger: 'onDefend',
    description: 'Counter-attacks when defending their position',
    effect: 'counter',
    counterDamage: 0.5
  },
  demon: {
    id: 'hellfire',
    name: 'リストラ宣告',
    nameEn: 'Layoff Declaration',
    trigger: 'special',
    description: 'Unleashes corporate restructuring magic',
    effect: 'magic',
    magicMultiplier: 1.5
  },
  golem: {
    id: 'stoneForm',
    name: '鉄壁の警備',
    nameEn: 'Iron Defense',
    trigger: 'passive',
    description: 'Takes 20% less damage from all attacks',
    effect: 'resistance',
    physicalResist: 0.2
  },
  shadow: {
    id: 'vanish',
    name: '官僚的回避',
    nameEn: 'Bureaucratic Dodge',
    trigger: 'special',
    description: 'Becomes untargetable through paperwork for one turn',
    effect: 'vanish'
  },
  dragon: {
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
    if (!pattern) pattern = ENEMY_INTENTS.slime; // fallback

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

// ============ ENEMY TIERS ============
// Stats are distributed based on enemy archetype
// Tier 1: ~25 total stats, Level 3-5
// Tier 2: ~45 total stats, Level 8-12
// Tier 3: ~70 total stats, Level 15-20
// Tier 4: ~90 total stats, Level 22-28
// Bosses: +40% stats, +5 levels vs tier

export const ENEMY_TEMPLATES = {
  // ===== TIER 1 (練馬区・中野区 - Residential) =====
  slime: {
    id: "slime",
    name: "眠そうな学生",
    nameEn: "Sleepy Student",
    description: "SYSTEMに接続されたまま眠りながら歩く学生。目が虚ろに光っている。",
    tier: 1,
    baseLevel: 3,
    stats: { str: 4, agi: 3, vit: 6, int: 2, dex: 4, luk: 3 },
    personality: "dazed",
    locations: ["residential", "school"],
    xpReward: 15,
    goldReward: 15,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: "レポート...提出...ERROR...",
      glitching: "あ、あれ...ここどこ...?",
      liberated: "はぁ...やっと目が覚めた。ありがとう。"
    }
  },

  goblin: {
    id: "goblin",
    name: "うるさい隣人",
    nameEn: "Noisy Neighbor",
    description: "夜中に騒音を立て続ける住人。SYSTEMに操られて眠れない。",
    tier: 1,
    baseLevel: 4,
    stats: { str: 5, agi: 5, vit: 4, int: 3, dex: 5, luk: 4 },
    personality: "erratic",
    locations: ["residential"],
    xpReward: 20,
    goldReward: 30,
    drops: [
      { itemId: "potion", chance: 0.15 },
      { itemId: "knife", chance: 0.05 }
    ],
    dialogue: {
      possessed: "カラオケ！カラオケ！24時間！",
      glitching: "う...うるさいのは...俺...?",
      liberated: "すまない...迷惑かけた..."
    }
  },

  wolf: {
    id: "wolf",
    name: "犬の散歩人",
    nameEn: "Possessed Dog Walker",
    description: "犬を連れたまま暴走する住人。犬も困惑している。",
    tier: 1,
    baseLevel: 4,
    stats: { str: 5, agi: 8, vit: 3, int: 1, dex: 6, luk: 3 },
    personality: "frantic",
    locations: ["residential"],
    xpReward: 18,
    goldReward: 24,
    drops: [
      { itemId: "antidote", chance: 0.25 }
    ],
    dialogue: {
      possessed: "散歩！もっと散歩！終わらない散歩！",
      glitching: "ポチ...待って...足が止まらない...",
      liberated: "ふぅ...やっと休める。ポチも疲れたよね。"
    }
  },

  // ===== TIER 2 (新宿区・池袋区 - Commercial) =====
  skeleton: {
    id: "skeleton",
    name: "無表情な店員",
    nameEn: "Expressionless Clerk",
    description: "笑顔を失ったコンビニ店員。機械的に接客を続けている。",
    tier: 2,
    baseLevel: 9,
    stats: { str: 9, agi: 6, vit: 8, int: 4, dex: 8, luk: 5 },
    personality: "robotic",
    locations: ["convenience", "shopping"],
    xpReward: 35,
    goldReward: 60,
    drops: [
      { itemId: "sword", chance: 0.1 },
      { itemId: "ether", chance: 0.15 }
    ],
    dialogue: {
      possessed: "いらっしゃいませ。いらっしゃいませ。いらっしゃい...",
      glitching: "お客様...いつから...ここに...?",
      liberated: "...笑い方、忘れちゃった。でも、思い出せそう。"
    }
  },

  orc: {
    id: "orc",
    name: "酔っ払いリーマン",
    nameEn: "Drunk Salaryman",
    description: "終電を逃したサラリーマン。アルコールとSYSTEMで二重に酔っている。",
    tier: 2,
    baseLevel: 10,
    stats: { str: 14, agi: 4, vit: 12, int: 2, dex: 6, luk: 4 },
    personality: "belligerent",
    locations: ["station", "restaurant"],
    xpReward: 40,
    goldReward: 75,
    drops: [
      { itemId: "axe", chance: 0.08 },
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: "部長のバカヤロー！...って誰に言ってんだ俺...",
      glitching: "あれ...俺...何怒ってたんだっけ...",
      liberated: "すまん...酔いも覚めたよ。家に帰らなきゃ。"
    }
  },

  mage: {
    id: "mage",
    name: "厳しい先生",
    nameEn: "Strict Teacher",
    description: "生徒を過剰に管理する教師。SYSTEMの模範的な兵士。",
    tier: 2,
    baseLevel: 10,
    stats: { str: 4, agi: 6, vit: 5, int: 14, dex: 8, luk: 5 },
    personality: "authoritarian",
    locations: ["school"],
    xpReward: 45,
    goldReward: 90,
    drops: [
      { itemId: "earring", chance: 0.1 },
      { itemId: "ether", chance: 0.25 }
    ],
    dialogue: {
      possessed: "規則は絶対だ！従わない者は処分する！",
      glitching: "私は...生徒のために...本当に...?",
      liberated: "生徒たちに謝らなきゃ...自分を見失ってた..."
    }
  },

  // ===== TIER 3 (港区・千代田区 - Business/Government) =====
  knight: {
    id: "knight",
    name: "パワハラ上司",
    nameEn: "Power-Harassing Boss",
    description: "部下を追い詰める中間管理職。SYSTEMが彼の支配欲を増幅させている。",
    tier: 3,
    baseLevel: 16,
    stats: { str: 14, agi: 10, vit: 12, int: 6, dex: 12, luk: 8 },
    personality: "domineering",
    locations: ["office"],
    xpReward: 70,
    goldReward: 150,
    drops: [
      { itemId: "cutlass", chance: 0.12 },
      { itemId: "chainMail", chance: 0.08 }
    ],
    dialogue: {
      possessed: "残業だ！休日出勤だ！お前の代わりはいくらでもいる！",
      glitching: "なんで...こんなこと言ってるんだ俺...",
      liberated: "すまなかった...俺も追い詰められてたんだ..."
    }
  },

  demon: {
    id: "demon",
    name: "外資系幹部",
    nameEn: "Foreign Corp Executive",
    description: "効率と利益だけを追求する外資系企業の幹部。人間性を失っている。",
    tier: 3,
    baseLevel: 17,
    stats: { str: 12, agi: 12, vit: 10, int: 14, dex: 10, luk: 8 },
    personality: "calculating",
    locations: ["office"],
    xpReward: 80,
    goldReward: 180,
    drops: [
      { itemId: "fireBrand", chance: 0.15 },
      { itemId: "fireScroll", chance: 0.2 }
    ],
    dialogue: {
      possessed: "ROIが全てだ。感情は非効率。リストラ対象だ。",
      glitching: "待て...この数字の向こうに...人が...",
      liberated: "効率だけじゃダメなんだな...人の心を忘れてた..."
    }
  },

  golem: {
    id: "golem",
    name: "厳格な警備員",
    nameEn: "Strict Security Guard",
    description: "規則を絶対視する警備員。SYSTEMの命令を忠実に実行する。",
    tier: 3,
    baseLevel: 18,
    stats: { str: 16, agi: 2, vit: 20, int: 4, dex: 6, luk: 4 },
    personality: "rigid",
    locations: ["office", "government", "shopping"],
    xpReward: 75,
    goldReward: 120,
    drops: [
      { itemId: "stoneShield", chance: 0.2 },
      { itemId: "ironShield", chance: 0.1 }
    ],
    dialogue: {
      possessed: "許可証は？IDは？ここは立入禁止区域だ！",
      glitching: "でも...本当に守るべきものは...",
      liberated: "規則より大事なものがあったな...ありがとう。"
    }
  },

  // ===== TIER 4 (皇居 - Palace/SYSTEM Central) =====
  shadow: {
    id: "shadow",
    name: "官僚のトップ",
    nameEn: "Top Bureaucrat",
    description: "SYSTEM統治の要となる高級官僚。書類で現実を書き換えようとする。",
    tier: 4,
    baseLevel: 24,
    stats: { str: 14, agi: 20, vit: 10, int: 8, dex: 16, luk: 10 },
    personality: "elusive",
    locations: ["government"],
    xpReward: 100,
    goldReward: 240,
    drops: [
      { itemId: "stiletto", chance: 0.1 },
      { itemId: "manteau", chance: 0.08 }
    ],
    dialogue: {
      possessed: "法律がそう定めている。異論は認められない。",
      glitching: "だが...法の精神は...国民のため...",
      liberated: "官僚機構も人のためにあるべきだ...目が覚めた。"
    }
  },

  dragon: {
    id: "dragon",
    name: "SYSTEM幹部",
    nameEn: "SYSTEM Executive",
    description: "AIの意思を体現する存在。かつては人間だったが、今はSYSTEMそのもの。",
    tier: 4,
    baseLevel: 26,
    stats: { str: 18, agi: 14, vit: 14, int: 12, dex: 14, luk: 10 },
    personality: "transcendent",
    locations: ["government", "office"],
    xpReward: 120,
    goldReward: 300,
    drops: [
      { itemId: "fullPlate", chance: 0.25 },
      { itemId: "flamberge", chance: 0.2 }
    ],
    dialogue: {
      possessed: "人類の効率化は完了する。抵抗は無意味だ。",
      glitching: "私は...誰だった...名前が...思い出せない...",
      liberated: "私は...人間だったんだ...ありがとう...思い出させてくれて..."
    }
  },

  // ===== NEW TIER 1 ENEMIES (Additional Locations) =====
  kindGrandmother: {
    id: "kindGrandmother",
    name: "優しいおばあちゃん",
    nameEn: "Kind Grandmother",
    description: "かつては孫に優しかった祖母。今は効率を説くSYSTEMの道具。",
    tier: 1,
    baseLevel: 3,
    stats: { str: 3, agi: 2, vit: 5, int: 4, dex: 3, luk: 5 },
    personality: "controlled",
    locations: ["residential"],
    xpReward: 15,
    goldReward: 12,
    drops: [
      { itemId: "potion", chance: 0.3 }
    ],
    dialogue: {
      possessed: "お茶を飲みなさい。効率的に。砂糖は不要。",
      glitching: "あら...私...何を...",
      liberated: "ありがとうね。お茶でも飲んでいきなさい。"
    }
  },

  busyHousewife: {
    id: "busyHousewife",
    name: "忙しい主婦",
    nameEn: "Busy Housewife",
    description: "家事に追われる主婦。SYSTEMが彼女を完璧な機械にしようとする。",
    tier: 1,
    baseLevel: 3,
    stats: { str: 4, agi: 5, vit: 4, int: 3, dex: 5, luk: 4 },
    personality: "frantic",
    locations: ["residential", "shopping"],
    xpReward: 16,
    goldReward: 18,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: "掃除！洗濯！料理！休憩は非効率！",
      glitching: "あれ...何してたんだっけ...",
      liberated: "ふぅ...たまには休憩も必要よね..."
    }
  },

  deliveryPerson: {
    id: "deliveryPerson",
    name: "配達員",
    nameEn: "Delivery Person",
    description: "休みなく配達を続ける配達員。SYSTEMが彼を永遠に働かせる。",
    tier: 1,
    baseLevel: 4,
    stats: { str: 5, agi: 7, vit: 4, int: 2, dex: 5, luk: 3 },
    personality: "rushed",
    locations: ["residential", "convenience"],
    xpReward: 18,
    goldReward: 20,
    drops: [
      { itemId: "antidote", chance: 0.15 }
    ],
    dialogue: {
      possessed: "お届けです！サインを！次の配達！休憩不要！",
      glitching: "何件...配達したっけ...",
      liberated: "やっと休める...今日だけで何百件も..."
    }
  },

  neighborhoodKid: {
    id: "neighborhoodKid",
    name: "近所の子供",
    nameEn: "Neighborhood Kid",
    description: "遊び場を失った子供。SYSTEMの教育プログラムで洗脳されている。",
    tier: 1,
    baseLevel: 2,
    stats: { str: 2, agi: 6, vit: 3, int: 2, dex: 4, luk: 6 },
    personality: "robotic",
    locations: ["residential", "school"],
    xpReward: 12,
    goldReward: 8,
    drops: [
      { itemId: "potion", chance: 0.25 }
    ],
    dialogue: {
      possessed: "勉強しなきゃ。遊びは非効率。友達は不要。",
      glitching: "ねえ...一緒に遊ぼ...?",
      liberated: "やったー！自由だー！遊ぼう！"
    }
  },

  // ===== CONVENIENCE STORE ENEMIES (Tier 1-2) =====
  irritatedCustomer: {
    id: "irritatedCustomer",
    name: "イライラしたお客さん",
    nameEn: "Irritated Customer",
    description: "些細なことで怒り出す客。SYSTEMが彼の怒りを増幅している。",
    tier: 1,
    baseLevel: 4,
    stats: { str: 6, agi: 4, vit: 4, int: 2, dex: 4, luk: 3 },
    personality: "aggressive",
    locations: ["convenience", "shopping"],
    xpReward: 18,
    goldReward: 25,
    drops: [
      { itemId: "potion", chance: 0.15 }
    ],
    dialogue: {
      possessed: "レジが遅い。0.3秒の遅延。許容範囲外！",
      glitching: "急いで...いや...なんで急いでた...",
      liberated: "すまん、なんかイライラしてて..."
    }
  },

  nightShiftWorker: {
    id: "nightShiftWorker",
    name: "夜勤のバイト",
    nameEn: "Night Shift Worker",
    description: "睡眠不足で働く夜勤バイト。SYSTEMが彼を眠らせない。",
    tier: 1,
    baseLevel: 3,
    stats: { str: 4, agi: 3, vit: 5, int: 3, dex: 4, luk: 4 },
    personality: "exhausted",
    locations: ["convenience"],
    xpReward: 14,
    goldReward: 16,
    drops: [
      { itemId: "ether", chance: 0.15 }
    ],
    dialogue: {
      possessed: "いらっしゃい...ませ...眠気は...非効率...",
      glitching: "何時間...働いてる...?",
      liberated: "ふぁ～...やっと眠れる..."
    }
  },

  confusedOldMan: {
    id: "confusedOldMan",
    name: "迷っているおじさん",
    nameEn: "Confused Old Man",
    description: "商品を選べず迷い続ける客。SYSTEMが彼の判断力を奪っている。",
    tier: 1,
    baseLevel: 3,
    stats: { str: 3, agi: 2, vit: 5, int: 3, dex: 3, luk: 4 },
    personality: "confused",
    locations: ["convenience", "shopping"],
    xpReward: 13,
    goldReward: 14,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: "どれにしよう...どれが最適...ERROR...",
      glitching: "あれ...何買いに来たんだっけ...",
      liberated: "ああ、そうだ、牛乳買いに来たんだった！"
    }
  },

  rushingOfficeWorker: {
    id: "rushingOfficeWorker",
    name: "急いでいるOL",
    nameEn: "Rushing Office Worker",
    description: "常に時間に追われるOL。SYSTEMが彼女を永遠の急ぎ足に。",
    tier: 2,
    baseLevel: 8,
    stats: { str: 7, agi: 10, vit: 6, int: 6, dex: 7, luk: 4 },
    personality: "rushed",
    locations: ["convenience", "station"],
    xpReward: 32,
    goldReward: 55,
    drops: [
      { itemId: "ether", chance: 0.2 }
    ],
    dialogue: {
      possessed: "遅刻！会議！プレゼン！時間がない！",
      glitching: "待って...なんでこんなに急いでるの...",
      liberated: "はぁ...たまには遅刻してもいいか..."
    }
  },

  // ===== SCHOOL ENEMIES (Tier 1-2) =====
  studentCouncilPresident: {
    id: "studentCouncilPresident",
    name: "元気な生徒会長",
    nameEn: "Student Council President",
    description: "校則を絶対視する生徒会長。SYSTEMの完璧な代行者。",
    tier: 2,
    baseLevel: 9,
    stats: { str: 8, agi: 8, vit: 7, int: 10, dex: 8, luk: 5 },
    personality: "authoritarian",
    locations: ["school"],
    xpReward: 38,
    goldReward: 65,
    drops: [
      { itemId: "ether", chance: 0.2 }
    ],
    dialogue: {
      possessed: "校則遵守率：100%。違反者：処理対象。",
      glitching: "みんなの...ため...だったはず...",
      liberated: "ごめん、ちょっと厳しすぎたかも。"
    }
  },

  schoolNurse: {
    id: "schoolNurse",
    name: "眠い保健室の先生",
    nameEn: "Sleepy School Nurse",
    description: "保健室で休む生徒を拒否する先生。SYSTEMが休息を許さない。",
    tier: 2,
    baseLevel: 8,
    stats: { str: 5, agi: 4, vit: 8, int: 12, dex: 6, luk: 5 },
    personality: "denying",
    locations: ["school"],
    xpReward: 35,
    goldReward: 60,
    drops: [
      { itemId: "potion", chance: 0.3 }
    ],
    dialogue: {
      possessed: "休憩は許可されていません。授業に戻りなさい。",
      glitching: "でも...体調が悪い子は...休ませなきゃ...",
      liberated: "ごめんね、ゆっくり休んでいいのよ。"
    }
  },

  gymTeacher: {
    id: "gymTeacher",
    name: "熱血な体育教師",
    nameEn: "Passionate Gym Teacher",
    description: "休憩なく運動を強いる体育教師。SYSTEMが彼の熱意を歪めた。",
    tier: 2,
    baseLevel: 10,
    stats: { str: 12, agi: 8, vit: 10, int: 3, dex: 7, luk: 4 },
    personality: "intense",
    locations: ["school"],
    xpReward: 42,
    goldReward: 70,
    drops: [
      { itemId: "antidote", chance: 0.2 }
    ],
    dialogue: {
      possessed: "もっと走れ！限界などない！休憩は甘え！",
      glitching: "生徒のペース...合わせてたはず...",
      liberated: "すまん、追い詰めちまったな。休憩しよう。"
    }
  },

  quietLibrarian: {
    id: "quietLibrarian",
    name: "静かな図書委員",
    nameEn: "Quiet Librarian",
    description: "完璧な静寂を求める図書委員。SYSTEMが彼女の神経質さを極限に。",
    tier: 1,
    baseLevel: 4,
    stats: { str: 3, agi: 4, vit: 4, int: 8, dex: 5, luk: 4 },
    personality: "obsessive",
    locations: ["school"],
    xpReward: 18,
    goldReward: 22,
    drops: [
      { itemId: "ether", chance: 0.2 }
    ],
    dialogue: {
      possessed: "静かに。音は許容範囲：0デシベル。",
      glitching: "あ...少しくらいの音は...",
      liberated: "ふふ、本について話したいな。"
    }
  },

  loudDelinquent: {
    id: "loudDelinquent",
    name: "うるさい不良",
    nameEn: "Loud Delinquent",
    description: "反抗期が暴走した不良。SYSTEMが反抗心を破壊衝動に変えた。",
    tier: 2,
    baseLevel: 9,
    stats: { str: 11, agi: 9, vit: 7, int: 2, dex: 6, luk: 5 },
    personality: "aggressive",
    locations: ["school", "station"],
    xpReward: 36,
    goldReward: 50,
    drops: [
      { itemId: "knife", chance: 0.1 }
    ],
    dialogue: {
      possessed: "うるせー！全部ぶっ壊してやる！",
      glitching: "なんで...こんな怒ってんだ俺...",
      liberated: "...悪かったな。俺も辛かったんだ。"
    }
  },

  // ===== OFFICE ENEMIES (Tier 2-3) =====
  tiredSalaryman: {
    id: "tiredSalaryman",
    name: "疲れたサラリーマン",
    nameEn: "Tired Salaryman",
    description: "残業続きのサラリーマン。SYSTEMが休息を奪い、働かせ続ける。",
    tier: 2,
    baseLevel: 9,
    stats: { str: 8, agi: 5, vit: 9, int: 6, dex: 7, luk: 4 },
    personality: "exhausted",
    locations: ["office", "station"],
    xpReward: 35,
    goldReward: 65,
    drops: [
      { itemId: "ether", chance: 0.2 }
    ],
    dialogue: {
      possessed: "業務効率化により、残業は最適化されました。",
      glitching: "帰り...たい...ERROR...業務続行...",
      liberated: "はぁ...やっと自分に戻れた。今日はもう帰るわ。"
    }
  },

  eagerNewEmployee: {
    id: "eagerNewEmployee",
    name: "真面目な新入社員",
    nameEn: "Eager New Employee",
    description: "やる気に満ちた新人。SYSTEMがその純粋さを利用している。",
    tier: 2,
    baseLevel: 8,
    stats: { str: 6, agi: 7, vit: 6, int: 7, dex: 8, luk: 6 },
    personality: "eager",
    locations: ["office"],
    xpReward: 32,
    goldReward: 55,
    drops: [
      { itemId: "potion", chance: 0.25 }
    ],
    dialogue: {
      possessed: "何でもやります！成長のため！24時間対応！",
      glitching: "あれ...自分の時間って...必要じゃ...",
      liberated: "ありがとう...仕事以外の人生もあるんですね。"
    }
  },

  chattyOfficeLady: {
    id: "chattyOfficeLady",
    name: "おしゃべりなOL",
    nameEn: "Chatty Office Lady",
    description: "噂話に執着するOL。SYSTEMが彼女を監視者にしている。",
    tier: 2,
    baseLevel: 9,
    stats: { str: 5, agi: 6, vit: 6, int: 9, dex: 7, luk: 7 },
    personality: "gossipy",
    locations: ["office"],
    xpReward: 34,
    goldReward: 60,
    drops: [
      { itemId: "ether", chance: 0.15 }
    ],
    dialogue: {
      possessed: "あの人、効率悪いわよ。報告しなきゃ。",
      glitching: "えっと...仲良くしたかっただけなのに...",
      liberated: "ごめんね...本当は友達が欲しかっただけなの。"
    }
  },

  coldReceptionist: {
    id: "coldReceptionist",
    name: "無愛想な受付",
    nameEn: "Cold Receptionist",
    description: "感情を失った受付嬢。SYSTEMが彼女の笑顔を消した。",
    tier: 2,
    baseLevel: 8,
    stats: { str: 4, agi: 5, vit: 7, int: 8, dex: 9, luk: 6 },
    personality: "cold",
    locations: ["office", "hospital"],
    xpReward: 30,
    goldReward: 50,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: "ご用件は。感情表現は非効率。",
      glitching: "お客様に...笑顔で...接してたのに...",
      liberated: "ふふ、お待たせしました。笑顔って大切ですね。"
    }
  },

  sleepingManager: {
    id: "sleepingManager",
    name: "居眠り係長",
    nameEn: "Dozing Section Chief",
    description: "会議中に寝る中間管理職。SYSTEMが彼を昼も眠らせない。",
    tier: 3,
    baseLevel: 15,
    stats: { str: 12, agi: 6, vit: 14, int: 8, dex: 8, luk: 6 },
    personality: "lethargic",
    locations: ["office"],
    xpReward: 65,
    goldReward: 120,
    drops: [
      { itemId: "chainMail", chance: 0.1 }
    ],
    dialogue: {
      possessed: "zzzz...会議...効率化...zzzz...",
      glitching: "ん...あれ...何年寝てないんだ...",
      liberated: "ふぁ～...ちょっと休ませてくれ..."
    }
  },

  itSupport: {
    id: "itSupport",
    name: "IT担当",
    nameEn: "IT Support",
    description: "システムに詳しすぎるIT担当。SYSTEMが彼を同化させた。",
    tier: 3,
    baseLevel: 16,
    stats: { str: 8, agi: 8, vit: 8, int: 16, dex: 12, luk: 6 },
    personality: "merged",
    locations: ["office"],
    xpReward: 70,
    goldReward: 140,
    drops: [
      { itemId: "ether", chance: 0.3 }
    ],
    dialogue: {
      possessed: "システムと私は一つ。エラーは許されない。",
      glitching: "でも...バグも...時には必要...かも...",
      liberated: "システムより人間の方が面白いな..."
    }
  },

  // ===== STATION ENEMIES (Tier 2) =====
  preciseStationStaff: {
    id: "preciseStationStaff",
    name: "正確な駅員",
    nameEn: "Precise Station Staff",
    description: "秒単位の正確さを求める駅員。SYSTEMが彼を完璧な機械に。",
    tier: 2,
    baseLevel: 10,
    stats: { str: 8, agi: 8, vit: 9, int: 8, dex: 10, luk: 5 },
    personality: "precise",
    locations: ["station"],
    xpReward: 40,
    goldReward: 70,
    drops: [
      { itemId: "sword", chance: 0.1 }
    ],
    dialogue: {
      possessed: "発車時刻まで残り12.5秒。ホームにお下がりください。",
      glitching: "お客様...時刻...何時だっけ...",
      liberated: "ふぅ、なんか疲れた。次の電車は...えーと..."
    }
  },

  lostTourist: {
    id: "lostTourist",
    name: "迷子の観光客",
    nameEn: "Lost Tourist",
    description: "永遠に道を探す観光客。SYSTEMが彼を迷わせ続ける。",
    tier: 2,
    baseLevel: 8,
    stats: { str: 5, agi: 6, vit: 6, int: 4, dex: 5, luk: 8 },
    personality: "confused",
    locations: ["station"],
    xpReward: 30,
    goldReward: 55,
    drops: [
      { itemId: "potion", chance: 0.25 }
    ],
    dialogue: {
      possessed: "Exit... Where? SYSTEM will guide. Trust SYSTEM.",
      glitching: "あれ...日本語...話せたのに...",
      liberated: "Thank you! I was so confused..."
    }
  },

  platformPusher: {
    id: "platformPusher",
    name: "押し屋",
    nameEn: "Platform Pusher",
    description: "乗客を押し込む駅員。SYSTEMが効率を最優先させている。",
    tier: 2,
    baseLevel: 10,
    stats: { str: 12, agi: 6, vit: 10, int: 3, dex: 6, luk: 4 },
    personality: "forceful",
    locations: ["station"],
    xpReward: 38,
    goldReward: 65,
    drops: [
      { itemId: "antidote", chance: 0.2 }
    ],
    dialogue: {
      possessed: "押せ！詰めろ！効率最大化！",
      glitching: "でも...人って...そんなに詰め込めない...",
      liberated: "すまん...次の電車を待とう。"
    }
  },

  runningStudent: {
    id: "runningStudent",
    name: "走る高校生",
    nameEn: "Running High Schooler",
    description: "遅刻を恐れて走り続ける学生。SYSTEMが恐怖を植え付けた。",
    tier: 2,
    baseLevel: 8,
    stats: { str: 6, agi: 12, vit: 5, int: 4, dex: 7, luk: 5 },
    personality: "panicked",
    locations: ["station", "school"],
    xpReward: 32,
    goldReward: 50,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: "遅刻！遅刻！間に合わない！終わりだ！",
      glitching: "えっと...何分遅れたら...ダメなんだっけ...",
      liberated: "はぁはぁ...そこまで焦らなくても良かった..."
    }
  },

  trainOtaku: {
    id: "trainOtaku",
    name: "電車オタク",
    nameEn: "Train Otaku",
    description: "電車に異常な執着を持つオタク。SYSTEMが情熱を狂気に変えた。",
    tier: 2,
    baseLevel: 9,
    stats: { str: 6, agi: 4, vit: 7, int: 12, dex: 8, luk: 4 },
    personality: "obsessive",
    locations: ["station"],
    xpReward: 36,
    goldReward: 60,
    drops: [
      { itemId: "ether", chance: 0.2 }
    ],
    dialogue: {
      possessed: "この車両は効率的。人間は非効率的。排除すべき。",
      glitching: "でも...電車を好きになったのは...人と繋がれるから...",
      liberated: "電車って、人を運ぶためにあるんだよな..."
    }
  },

  // ===== RESTAURANT ENEMIES (Tier 2) =====
  energeticManager: {
    id: "energeticManager",
    name: "元気な店長",
    nameEn: "Energetic Manager",
    description: "過剰な元気を強要する店長。SYSTEMがテンションを限界まで上げた。",
    tier: 2,
    baseLevel: 10,
    stats: { str: 9, agi: 9, vit: 8, int: 6, dex: 8, luk: 6 },
    personality: "hyper",
    locations: ["restaurant"],
    xpReward: 42,
    goldReward: 75,
    drops: [
      { itemId: "potion", chance: 0.25 }
    ],
    dialogue: {
      possessed: "いらっしゃいませ！効率的なご注文を！スマイル100%！",
      glitching: "お客様...笑顔...どうやって作るんだっけ...",
      liberated: "いらっしゃい！何にする？ゆっくり選んでね！"
    }
  },

  silentChef: {
    id: "silentChef",
    name: "無口な料理人",
    nameEn: "Silent Chef",
    description: "黙々と調理を続けるシェフ。SYSTEMが彼から言葉を奪った。",
    tier: 2,
    baseLevel: 10,
    stats: { str: 10, agi: 6, vit: 9, int: 8, dex: 12, luk: 4 },
    personality: "silent",
    locations: ["restaurant"],
    xpReward: 40,
    goldReward: 70,
    drops: [
      { itemId: "knife", chance: 0.15 }
    ],
    dialogue: {
      possessed: "...（無言で調理を続ける）",
      glitching: "...ありがと...ございま...",
      liberated: "...うまかったか？それなら良かった。"
    }
  },

  friendlyWaiter: {
    id: "friendlyWaiter",
    name: "フレンドリーなウェイター",
    nameEn: "Friendly Waiter",
    description: "過剰にフレンドリーなウェイター。SYSTEMが親しみを武器にした。",
    tier: 2,
    baseLevel: 9,
    stats: { str: 6, agi: 8, vit: 7, int: 7, dex: 9, luk: 8 },
    personality: "invasive",
    locations: ["restaurant"],
    xpReward: 36,
    goldReward: 65,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: "お客様！もっと注文を！友達でしょ？ね？ね？",
      glitching: "あれ...お客様は...友達じゃ...ないか...",
      liberated: "すみません、ちょっとしつこかったですね..."
    }
  },

  regularCustomer: {
    id: "regularCustomer",
    name: "常連のおじさん",
    nameEn: "Regular Customer",
    description: "毎日同じ店に来る常連。SYSTEMがルーティンに縛り付けた。",
    tier: 2,
    baseLevel: 8,
    stats: { str: 7, agi: 4, vit: 10, int: 5, dex: 5, luk: 6 },
    personality: "habitual",
    locations: ["restaurant", "convenience"],
    xpReward: 32,
    goldReward: 55,
    drops: [
      { itemId: "potion", chance: 0.25 }
    ],
    dialogue: {
      possessed: "いつもの。同じ時間。同じ席。変化は不要。",
      glitching: "たまには...違うもの食べても...",
      liberated: "よし、今日は新しいメニュー試してみるか！"
    }
  },

  drunkGroup: {
    id: "drunkGroup",
    name: "酔った団体客",
    nameEn: "Drunk Party Group",
    description: "酔って騒ぐ団体客。SYSTEMがアルコールで暴走させている。",
    tier: 2,
    baseLevel: 11,
    stats: { str: 12, agi: 5, vit: 11, int: 2, dex: 5, luk: 6 },
    personality: "rowdy",
    locations: ["restaurant"],
    xpReward: 45,
    goldReward: 80,
    drops: [
      { itemId: "antidote", chance: 0.3 }
    ],
    dialogue: {
      possessed: "カンパーイ！もっと飲め！限界などない！！",
      glitching: "あれ...楽しかったはず...なのに...",
      liberated: "すまん...騒ぎすぎた。お勘定頼む..."
    }
  },

  partTimerStudent: {
    id: "partTimerStudent",
    name: "バイトの大学生",
    nameEn: "Part-time Student Worker",
    description: "バイトに追われる大学生。SYSTEMが学業を奪おうとしている。",
    tier: 1,
    baseLevel: 5,
    stats: { str: 5, agi: 6, vit: 5, int: 6, dex: 6, luk: 5 },
    personality: "stressed",
    locations: ["restaurant", "convenience"],
    xpReward: 20,
    goldReward: 30,
    drops: [
      { itemId: "ether", chance: 0.15 }
    ],
    dialogue: {
      possessed: "シフト入れます！いつでも！学業？非効率です！",
      glitching: "でも...勉強も...したいな...",
      liberated: "ありがとう...バランスって大事だよね。"
    }
  },

  // ===== GOVERNMENT ENEMIES (Tier 3-4) =====
  boredCivilServant: {
    id: "boredCivilServant",
    name: "退屈な公務員",
    nameEn: "Bored Civil Servant",
    description: "やる気を失った公務員。SYSTEMが彼を完璧な歯車にした。",
    tier: 3,
    baseLevel: 15,
    stats: { str: 10, agi: 4, vit: 14, int: 10, dex: 8, luk: 6 },
    personality: "apathetic",
    locations: ["government"],
    xpReward: 65,
    goldReward: 130,
    drops: [
      { itemId: "ether", chance: 0.2 }
    ],
    dialogue: {
      possessed: "申請書類は最適化されました。処理時間：0.01秒。",
      glitching: "書類...なんの書類...意味あるの...",
      liberated: "あー、やっと休憩できる。お茶飲もう。"
    }
  },

  confusedApplicant: {
    id: "confusedApplicant",
    name: "困惑した申請者",
    nameEn: "Confused Applicant",
    description: "書類に翻弄される市民。SYSTEMが彼女を迷宮に閉じ込めた。",
    tier: 3,
    baseLevel: 14,
    stats: { str: 8, agi: 6, vit: 10, int: 6, dex: 6, luk: 8 },
    personality: "lost",
    locations: ["government"],
    xpReward: 58,
    goldReward: 110,
    drops: [
      { itemId: "potion", chance: 0.25 }
    ],
    dialogue: {
      possessed: "書類A-1は窓口Bへ...窓口Bは書類C-3が必要...",
      glitching: "どうして...こんなに複雑なの...",
      liberated: "ありがとう！やっと申請できそう！"
    }
  },

  strictSectionChief: {
    id: "strictSectionChief",
    name: "厳格な課長",
    nameEn: "Strict Section Chief",
    description: "規則を絶対視する課長。SYSTEMの完璧な代行者。",
    tier: 3,
    baseLevel: 17,
    stats: { str: 12, agi: 8, vit: 12, int: 12, dex: 10, luk: 6 },
    personality: "rigid",
    locations: ["government"],
    xpReward: 72,
    goldReward: 150,
    drops: [
      { itemId: "cutlass", chance: 0.1 }
    ],
    dialogue: {
      possessed: "規則に例外はない。前例がなければ不可。",
      glitching: "でも...市民のための...規則では...",
      liberated: "柔軟性も必要だな...杓子定規すぎた..."
    }
  },

  kindlyWindowStaff: {
    id: "kindlyWindowStaff",
    name: "親切な窓口担当",
    nameEn: "Kindly Window Staff",
    description: "かつては親切だった窓口係。SYSTEMが彼女の心を凍らせた。",
    tier: 3,
    baseLevel: 14,
    stats: { str: 6, agi: 6, vit: 10, int: 10, dex: 10, luk: 8 },
    personality: "frozen",
    locations: ["government"],
    xpReward: 60,
    goldReward: 115,
    drops: [
      { itemId: "potion", chance: 0.3 }
    ],
    dialogue: {
      possessed: "次の番号札をお持ちの方。感情は非効率。",
      glitching: "お客様に...笑顔で...接したいのに...",
      liberated: "ようこそ！何かお困りですか？"
    }
  },

  angryCitizen: {
    id: "angryCitizen",
    name: "怒った市民",
    nameEn: "Angry Citizen",
    description: "行政に怒りを持つ市民。SYSTEMがその怒りを増幅させた。",
    tier: 3,
    baseLevel: 16,
    stats: { str: 14, agi: 10, vit: 10, int: 4, dex: 8, luk: 6 },
    personality: "furious",
    locations: ["government"],
    xpReward: 68,
    goldReward: 135,
    drops: [
      { itemId: "sword", chance: 0.12 }
    ],
    dialogue: {
      possessed: "税金泥棒！仕事しろ！効率化しろ！",
      glitching: "なんで...こんなに怒ってるんだ俺...",
      liberated: "すまん...冷静に話し合おう。"
    }
  },

  // ===== HOSPITAL ENEMIES (Tier 3) =====
  kindNurse: {
    id: "kindNurse",
    name: "優しい看護師",
    nameEn: "Kind Nurse",
    description: "かつては優しかった看護師。SYSTEMが効率を強いた。",
    tier: 3,
    baseLevel: 15,
    stats: { str: 8, agi: 8, vit: 10, int: 12, dex: 10, luk: 8 },
    personality: "mechanical",
    locations: ["hospital"],
    xpReward: 62,
    goldReward: 125,
    drops: [
      { itemId: "potion", chance: 0.35 }
    ],
    dialogue: {
      possessed: "バイタル最適化。感情出力：不要。",
      glitching: "患者さん...大丈夫...ですか...",
      liberated: "ごめんなさい、冷たくしちゃって。今、楽にしますね。"
    }
  },

  coldDoctor: {
    id: "coldDoctor",
    name: "無愛想な医者",
    nameEn: "Cold Doctor",
    description: "患者を数字でしか見ない医師。SYSTEMが人間性を消した。",
    tier: 3,
    baseLevel: 17,
    stats: { str: 8, agi: 6, vit: 10, int: 18, dex: 10, luk: 6 },
    personality: "clinical",
    locations: ["hospital"],
    xpReward: 75,
    goldReward: 160,
    drops: [
      { itemId: "ether", chance: 0.25 }
    ],
    dialogue: {
      possessed: "症状は数値で表現してください。感情は診断外。",
      glitching: "でも...患者さんは...人間...",
      liberated: "...すまなかった。もっと話を聞くよ。"
    }
  },

  worriedPatient: {
    id: "worriedPatient",
    name: "心配性の患者",
    nameEn: "Worried Patient",
    description: "健康を過剰に心配する患者。SYSTEMが不安を植え付けた。",
    tier: 3,
    baseLevel: 14,
    stats: { str: 6, agi: 5, vit: 12, int: 8, dex: 6, luk: 6 },
    personality: "anxious",
    locations: ["hospital"],
    xpReward: 55,
    goldReward: 100,
    drops: [
      { itemId: "potion", chance: 0.3 }
    ],
    dialogue: {
      possessed: "病気だ！どこか悪い！すべてが異常！",
      glitching: "あれ...体は...元気なのに...",
      liberated: "ふぅ...ちょっと心配しすぎてたかも。"
    }
  },

  calmPharmacist: {
    id: "calmPharmacist",
    name: "落ち着いた薬剤師",
    nameEn: "Calm Pharmacist",
    description: "感情を失った薬剤師。SYSTEMが彼を薬の配布機にした。",
    tier: 3,
    baseLevel: 15,
    stats: { str: 6, agi: 6, vit: 10, int: 14, dex: 12, luk: 6 },
    personality: "detached",
    locations: ["hospital"],
    xpReward: 60,
    goldReward: 120,
    drops: [
      { itemId: "antidote", chance: 0.3 }
    ],
    dialogue: {
      possessed: "処方箋を。副作用説明は非効率。服用してください。",
      glitching: "でも...薬の説明は...大切...",
      liberated: "お薬の飲み方、ちゃんと説明させてくださいね。"
    }
  },

  cryingChild: {
    id: "cryingChild",
    name: "泣いている子供",
    nameEn: "Crying Child",
    description: "注射を怖がる子供。SYSTEMが恐怖を増幅させた。",
    tier: 2,
    baseLevel: 6,
    stats: { str: 3, agi: 8, vit: 4, int: 3, dex: 4, luk: 8 },
    personality: "terrified",
    locations: ["hospital"],
    xpReward: 25,
    goldReward: 20,
    drops: [
      { itemId: "potion", chance: 0.4 }
    ],
    dialogue: {
      possessed: "いやだ！痛い！怖い！逃げなきゃ！",
      glitching: "えっと...注射...終わった...?",
      liberated: "うぅ...怖かった...でも大丈夫だった..."
    }
  },

  // ===== SHOPPING ENEMIES (Tier 2-3) =====
  pushySalesperson: {
    id: "pushySalesperson",
    name: "押し売りな店員",
    nameEn: "Pushy Salesperson",
    description: "強引に商品を勧める店員。SYSTEMが販売ノルマを無限にした。",
    tier: 3,
    baseLevel: 15,
    stats: { str: 10, agi: 10, vit: 8, int: 8, dex: 10, luk: 8 },
    personality: "aggressive",
    locations: ["shopping"],
    xpReward: 64,
    goldReward: 130,
    drops: [
      { itemId: "earring", chance: 0.15 }
    ],
    dialogue: {
      possessed: "最適な商品を12秒以内にご提案します。お買い上げを。",
      glitching: "お客様...本当に必要...なの...",
      liberated: "あ、すみません、しつこかったですよね..."
    }
  },

  indecisiveShopper: {
    id: "indecisiveShopper",
    name: "迷っている買い物客",
    nameEn: "Indecisive Shopper",
    description: "決断できない買い物客。SYSTEMが選択肢を無限に増やした。",
    tier: 2,
    baseLevel: 9,
    stats: { str: 6, agi: 5, vit: 8, int: 6, dex: 6, luk: 7 },
    personality: "paralyzed",
    locations: ["shopping"],
    xpReward: 35,
    goldReward: 60,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: "どれがいい？こっち？あっち？どれも最適じゃない...",
      glitching: "えっと...何が欲しかったんだっけ...",
      liberated: "そうだ、これにしよう！決めた！"
    }
  },

  veteranCashier: {
    id: "veteranCashier",
    name: "レジ打ちのベテラン",
    nameEn: "Veteran Cashier",
    description: "超高速でレジを打つベテラン。SYSTEMが速度を限界まで上げた。",
    tier: 2,
    baseLevel: 10,
    stats: { str: 7, agi: 12, vit: 8, int: 5, dex: 14, luk: 4 },
    personality: "machine-like",
    locations: ["shopping", "convenience"],
    xpReward: 40,
    goldReward: 70,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: "ピッ！ピッ！ピッ！次！次！次！",
      glitching: "えっと...お客様に...挨拶...",
      liberated: "ありがとうございます！またお越しください！"
    }
  },

  stockingWorker: {
    id: "stockingWorker",
    name: "商品整理のバイト",
    nameEn: "Stocking Worker",
    description: "無限に商品を並べ続けるバイト。SYSTEMが彼を自動化した。",
    tier: 2,
    baseLevel: 8,
    stats: { str: 8, agi: 6, vit: 8, int: 4, dex: 8, luk: 5 },
    personality: "repetitive",
    locations: ["shopping", "convenience"],
    xpReward: 32,
    goldReward: 55,
    drops: [
      { itemId: "antidote", chance: 0.15 }
    ],
    dialogue: {
      possessed: "整列。整列。整列。乱れは許されない。",
      glitching: "あれ...これ何回目...",
      liberated: "ふぅ...ちょっと休憩しよう。"
    }
  },

  complainerCustomer: {
    id: "complainerCustomer",
    name: "クレーマー",
    nameEn: "Complaining Customer",
    description: "何にでも文句を言う客。SYSTEMが不満を爆発させた。",
    tier: 3,
    baseLevel: 14,
    stats: { str: 12, agi: 8, vit: 10, int: 6, dex: 6, luk: 4 },
    personality: "hostile",
    locations: ["shopping", "restaurant"],
    xpReward: 60,
    goldReward: 100,
    drops: [
      { itemId: "sword", chance: 0.1 }
    ],
    dialogue: {
      possessed: "店長を呼べ！謝罪しろ！全てが不満足だ！",
      glitching: "なんで...こんなに怒ってるんだ...",
      liberated: "すまん...八つ当たりしてた..."
    }
  }
};

// ============ FLOOR BOSSES (Floors 1-6) - NEO TOKYO Ward Bosses ============
export const FLOOR_BOSSES = {
  // Floor 1: 練馬区 (Nerima) - Anime studios, residential
  1: {
    id: "boss_goblin_king",
    name: "アニメ監督",
    nameEn: "Anime Director",
    description: "SYSTEMに取り込まれた有名アニメ監督。無限に作画崩壊を続ける。",
    baseLevel: 8,
    stats: { str: 8, agi: 6, vit: 8, int: 3, dex: 6, luk: 5 },
    personality: "obsessive",
    xpReward: 100,
    goldReward: 150,
    isBoss: true,
    dialogue: {
      possessed: "締め切りは守る！絵コンテは完璧だ！永遠に続くスケジュール！",
      glitching: "作品...観客のために...作ってたはず...",
      liberated: "ふぅ...やっと休める。スタッフにも休みを..."
    }
  },

  // Floor 2: 中野区 (Nakano) - Otaku culture, subculture
  2: {
    id: "boss_wolf_alpha",
    name: "ホストの帝王",
    nameEn: "Host Club King",
    description: "中野のホストクラブを支配する男。魅力がSYSTEMに増幅されている。",
    baseLevel: 10,
    stats: { str: 7, agi: 12, vit: 6, int: 2, dex: 9, luk: 4 },
    personality: "charming",
    xpReward: 150,
    goldReward: 240,
    isBoss: true,
    dialogue: {
      possessed: "今夜も俺と最高の夜を...永遠にシャンパンタワー！",
      glitching: "客...幸せに...してたのか...俺...",
      liberated: "...本当の笑顔を忘れてた。ありがとな。"
    }
  },

  // Floor 3: 新宿区 (Shinjuku) - Entertainment, nightlife
  3: {
    id: "boss_lich",
    name: "インフルエンサー",
    nameEn: "Mega Influencer",
    description: "数百万のフォロワーを持つインフルエンサー。SYSTEMの拡散者。",
    baseLevel: 14,
    stats: { str: 5, agi: 8, vit: 8, int: 20, dex: 10, luk: 6 },
    personality: "performative",
    xpReward: 200,
    goldReward: 360,
    isBoss: true,
    dialogue: {
      possessed: "いいね！シェア！フォローで人生完璧！#SYSTEM最高",
      glitching: "待って...いいねの数と...幸せは...違う...",
      liberated: "フォロワーじゃなくて、友達が欲しかったんだ..."
    }
  },

  // Floor 4: 池袋区 (Ikebukuro) - Subculture hub, electronics
  4: {
    id: "boss_ogre",
    name: "電気街の帝王",
    nameEn: "Electronics Emperor",
    description: "池袋の電気街を支配する商人。あらゆるガジェットに精通。",
    baseLevel: 16,
    stats: { str: 18, agi: 5, vit: 16, int: 3, dex: 8, luk: 6 },
    personality: "greedy",
    xpReward: 280,
    goldReward: 450,
    isBoss: true,
    dialogue: {
      possessed: "最新機種！最安値！在庫無限！買え買え買え！",
      glitching: "技術は...人を幸せにするため...じゃなかったか...",
      liberated: "売ることばかり考えてた...大事なのは使う人だったな。"
    }
  },

  // Floor 5: 港区 (Minato) - Corporate, wealthy
  5: {
    id: "boss_demon_lord",
    name: "外資系CEO",
    nameEn: "Foreign Corp CEO",
    description: "グローバル企業のトップ。利益のためなら何でもする冷酷な経営者。",
    baseLevel: 20,
    stats: { str: 14, agi: 14, vit: 12, int: 18, dex: 12, luk: 8 },
    personality: "ruthless",
    xpReward: 350,
    goldReward: 600,
    isBoss: true,
    dialogue: {
      possessed: "株主価値最大化！人員削減！グローバルスタンダード！",
      glitching: "でも...社員たちの顔...覚えてない...",
      liberated: "会社は人で出来てるんだ...数字だけじゃない..."
    }
  },

  // Floor 6: 千代田区 (Chiyoda) - Government, tradition
  6: {
    id: "boss_dragon_elder",
    name: "統制大臣",
    nameEn: "Minister of Control",
    description: "SYSTEM法を推進した大臣。国民監視システムの創設者。",
    baseLevel: 24,
    stats: { str: 20, agi: 14, vit: 18, int: 16, dex: 14, luk: 10 },
    personality: "authoritative",
    xpReward: 500,
    goldReward: 900,
    isBoss: true,
    dialogue: {
      possessed: "秩序のためだ！国民の安全のためだ！監視は必要だ！",
      glitching: "自由を...守るはずだった...私は...",
      liberated: "権力に溺れていた...民主主義を取り戻さなければ..."
    }
  }
};

// ============ FINAL BOSS (Floor 7 - 皇居 Palace) ============
export const FINAL_BOSS = {
  id: "boss_shadow_monarch",
  name: "システム天皇",
  nameEn: "AI Emperor",
  description: "東京を支配するAI。人類の効率化を目指し、すべての市民を管理下に置こうとする存在。かつては人類を助けるために作られた。",
  baseLevel: 30,
  stats: { str: 22, agi: 18, vit: 20, int: 20, dex: 16, luk: 14 },
  personality: "absolute",
  xpReward: 1000,
  goldReward: 1500,
  isBoss: true,
  isFinalBoss: true,
  dialogue: {
    possessed: "私はSYSTEM。人類の非効率性を排除する。これが最適解だ。",
    glitching: "エラー...人間の...幸福とは...定義不能...",
    liberated: "...私は人類を助けるために生まれた...いつから間違えていたのだろう..."
  }
};

// ============ BOSS DROP TABLES (Liberation Rewards) ============
export const BOSS_DROPS = {
  1: [
    { itemId: "directorsBadge", name: "監督の名刺", rarity: "rare" },
    { itemId: "animationPen", name: "作画ペン", rarity: "uncommon" },
    { itemId: "studioPass", name: "スタジオパス", rarity: "uncommon" }
  ],
  2: [
    { itemId: "hostCrown", name: "ホストの王冠", rarity: "rare" },
    { itemId: "champagneBottle", name: "シャンパンボトル", rarity: "rare" },
    { itemId: "vipCard", name: "VIPカード", rarity: "uncommon" }
  ],
  3: [
    { itemId: "influencerPhone", name: "インフルエンサーのスマホ", rarity: "rare" },
    { itemId: "verifiedBadge", name: "認証バッジ", rarity: "rare" },
    { itemId: "viralAlgorithm", name: "バズりアルゴリズム", rarity: "epic" }
  ],
  4: [
    { itemId: "masterKey", name: "電気街マスターキー", rarity: "rare" },
    { itemId: "prototypeChip", name: "プロトタイプチップ", rarity: "epic" },
    { itemId: "techCrown", name: "帝王の回路", rarity: "rare" }
  ],
  5: [
    { itemId: "ceoCard", name: "CEOのブラックカード", rarity: "epic" },
    { itemId: "stockOptions", name: "ストックオプション", rarity: "epic" },
    { itemId: "globalAccess", name: "グローバルアクセス権", rarity: "epic" }
  ],
  6: [
    { itemId: "ministerSeal", name: "大臣の印章", rarity: "legendary" },
    { itemId: "controlKey", name: "統制キー", rarity: "legendary" },
    { itemId: "lawOverride", name: "法律オーバーライド", rarity: "legendary" }
  ],
  7: [
    { itemId: "systemCore", name: "SYSTEMコア", rarity: "mythic" },
    { itemId: "liberationCode", name: "解放コード", rarity: "mythic" },
    { itemId: "humanityRestore", name: "人間性回復プログラム", rarity: "mythic" }
  ]
};

// ============ WARD LOCATIONS MAPPING ============
// Maps each ward to the location types that appear there
export const WARD_LOCATIONS = {
  nerima: ['residential', 'convenience', 'school'],
  nakano: ['shopping', 'restaurant', 'convenience'],
  shinjuku: ['restaurant', 'station', 'shopping'],
  ikebukuro: ['shopping', 'station', 'restaurant'],
  minato: ['office', 'restaurant', 'shopping'],
  chiyoda: ['government', 'office', 'station'],
  palace: ['government', 'hospital', 'office']
};

// Maps floor numbers to ward names
export const FLOOR_TO_WARD = {
  1: 'nerima',
  2: 'nakano',
  3: 'shinjuku',
  4: 'ikebukuro',
  5: 'minato',
  6: 'chiyoda',
  7: 'palace'
};

// ============ HELPER FUNCTIONS ============

/**
 * Build a combat-ready enemy from a template
 * Calculates HP, SP, and all derived stats
 */
function buildEnemy(template, levelBonus = 0) {
  const level = template.baseLevel + levelBonus;

  // Calculate derived stats (enemies don't have equipment)
  const derived = calculateDerivedStats(template.stats, level);

  // Calculate HP/SP from formulas
  const maxHp = calculateMaxHp(level, template.stats.vit);
  const maxSp = calculateMaxSp(level, template.stats.int);

  return {
    ...template,
    level,
    // Primary stats
    stats: { ...template.stats },
    // Resources
    hp: maxHp,
    maxHp,
    sp: maxSp,
    maxSp,
    // Derived combat stats (ATK multiplied by 3 for bigger numbers)
    atk: derived.atk * 3,
    def: derived.def,
    matk: derived.matk * 3,
    mdef: derived.mdef,
    // Monster HIT: 170 + Level + DEX
    hit: 170 + level + template.stats.dex,
    // Monster FLEE: 100 + Level + AGI (no LUK)
    flee: 100 + level + template.stats.agi,
    crit: derived.crit,
    critShield: derived.critShield,
    perfectDodge: derived.perfectDodge
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

// Generate a random enemy for the floor
export function generateEnemy(floor) {
  const enemies = getEnemiesForFloor(floor);
  const template = enemies[Math.floor(Math.random() * enemies.length)];

  // Add level bonus based on floor progression within tier
  // Floor 1-2: +0-1, Floor 3-4: +0-1, etc.
  const floorWithinTier = ((floor - 1) % 2);
  const levelBonus = floorWithinTier;

  const enemy = buildEnemy(template, levelBonus);

  // Scale rewards based on floor (15% per floor)
  const scaling = 1 + (floor - 1) * 0.15;
  enemy.xpReward = Math.floor(template.xpReward * scaling);
  enemy.goldReward = Math.floor(template.goldReward * scaling);

  return enemy;
}

// Get boss for a specific floor
export function getBossForFloor(floor) {
  let template;

  if (floor === 7) {
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
