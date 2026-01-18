/**
 * @fileoverview Enemy definitions, boss data, intent AI, and dialogue system
 * @module src/game/enemies
 *
 * PURPOSE:
 * Defines all enemies and bosses for NEO TOKYO. Each enemy is a citizen possessed
 * by the SYSTEM AI.
 *
 * SIMPLIFIED SYSTEM:
 * - Enemies have only: attack and maxHp
 * - No levels, no derived stats
 * - Attack/HP based on tier (1-4)
 * - See enemies.full.js for original iRO-style system (if preserved)
 *
 * ENEMY TIERS:
 * - Tier 1: attack ~10, HP ~40
 * - Tier 2: attack ~15, HP ~70
 * - Tier 3: attack ~20, HP ~100
 * - Tier 4: attack ~30, HP ~150
 * - Bosses: attack ~30-40, HP ~200-300
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
      possessed: [
        "レポート...提出...ERROR...",
        "出席...出席...出席確認中...",
        "単位...単位が足りない...再計算...",
        "眠い...でも...課題が...終わらない...",
        "授業...5限...いや...永遠..."
      ],
      glitching: [
        "あ、あれ...ここどこ...?",
        "今日...何曜日...?",
        "なんで教科書持ってるんだ俺...",
        "テスト...あれ、テストいつだっけ...",
        "寝てた...? 俺...ずっと寝てた...?"
      ],
      liberated: [
        "はぁ...やっと目が覚めた。ありがとう。",
        "ふぁ～...よく寝た...って、ここどこ!?",
        "やべ、レポート...いや、もういいか。休もう。",
        "自由だ...とりあえず寝よう...ちゃんとベッドで。",
        "頭がスッキリした...サークル行こうかな。"
      ]
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
      possessed: [
        "カラオケ！カラオケ！24時間！",
        "ドンドン！壁叩き！リズム最高！",
        "深夜の掃除機！効率的！",
        "パーティー！毎晩！音楽最大音量！",
        "テレビ！大音量！隣人？知らない！"
      ],
      glitching: [
        "う...うるさいのは...俺...?",
        "あれ...夜中に何してたんだ...",
        "隣の人...起きてる...?",
        "この騒音...俺が出してた...?",
        "静かに...しなきゃ..."
      ],
      liberated: [
        "すまない...迷惑かけた...",
        "近所の人に謝らなきゃ...",
        "これからは静かに暮らすよ。",
        "ヘッドホン...買おう...",
        "ごめん...本当にごめん..."
      ]
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
      possessed: [
        "散歩！もっと散歩！終わらない散歩！",
        "走れ！走れ！止まるな！効率的に！",
        "運動！健康！一日百周！",
        "ポチ！もっと速く！休憩は非効率！",
        "公園！川沿い！山道！全部回れ！"
      ],
      glitching: [
        "ポチ...待って...足が止まらない...",
        "何周...走ったんだ...?",
        "ポチ...疲れてる...?ごめん...",
        "家...どこだっけ...",
        "足が...もう動かない..."
      ],
      liberated: [
        "ふぅ...やっと休める。ポチも疲れたよね。",
        "ポチ、帰ろう。おやつあげるからね。",
        "散歩は楽しくなきゃね...ゆっくり歩こう。",
        "ベンチで休もう...ポチも座りな。",
        "水飲も...ポチにもあげなきゃ。"
      ]
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
      possessed: [
        "いらっしゃいませ。いらっしゃいませ。いらっしゃい...",
        "ポイントカード...ポイントカード...ポイント...",
        "袋は...必要ですか...必要...必要...",
        "レジ袋...有料...環境...効率...",
        "温めますか...温め...温め...ERROR..."
      ],
      glitching: [
        "お客様...いつから...ここに...?",
        "今...何時...? シフト終わった...?",
        "私...何回同じこと言った...?",
        "あれ...休憩...取ってない...",
        "笑顔...どうやって作るんだっけ..."
      ],
      liberated: [
        "...笑い方、忘れちゃった。でも、思い出せそう。",
        "ありがとうございます...って、自然に言えた。",
        "やっと...自分の声で話せる...",
        "接客って...人と人の繋がりだよね。",
        "シフト終わったら...友達に会いに行こう。"
      ]
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
      possessed: [
        "部長のバカヤロー！...って誰に言ってんだ俺...",
        "もう一軒！もう一軒！終電？知らねえ！",
        "仕事なんてクソだ！効率！効率！うるせえ！",
        "俺の人生...会社のため...会社のため...",
        "飲め！飲め！アルコールは効率的なストレス解消！"
      ],
      glitching: [
        "あれ...俺...何怒ってたんだっけ...",
        "終電...いつ行った...?",
        "家族...待ってる...かな...",
        "なんでこんなに飲んでんだ俺...",
        "明日も...仕事...あれ...今日何曜日..."
      ],
      liberated: [
        "すまん...酔いも覚めたよ。家に帰らなきゃ。",
        "嫁に連絡しなきゃ...心配してるよな...",
        "タクシー呼ぼう...歩けねえ...",
        "明日は休みを取ろう...ちゃんと休もう。",
        "ありがとう...正気に戻れた..."
      ]
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
      possessed: [
        "規則は絶対だ！従わない者は処分する！",
        "成績！成績！数字が全てだ！",
        "私語禁止！効率的に学習せよ！",
        "校則違反者は即座に処分！容赦なし！",
        "教育とは管理だ！自由は非効率！"
      ],
      glitching: [
        "私は...生徒のために...本当に...?",
        "あの子の笑顔...いつから見てない...",
        "成績より...大事なものが...あったはず...",
        "厳しくすれば...いいと思ってた...",
        "教師になった理由...なんだったっけ..."
      ],
      liberated: [
        "生徒たちに謝らなきゃ...自分を見失ってた...",
        "もっと生徒の話を聞こう...成績だけじゃない。",
        "教育って...一緒に成長することだよね。",
        "厳しさだけじゃ駄目だ...愛情も必要だった。",
        "ありがとう...先生としてやり直すよ。"
      ]
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
      possessed: [
        "残業だ！休日出勤だ！お前の代わりはいくらでもいる！",
        "結果を出せ！言い訳は聞かん！効率だ！",
        "俺の若い頃は...いや、比較は非効率だ！働け！",
        "有給？休み？そんなものは弱者の甘えだ！",
        "ミスは許さん！完璧以外は失敗だ！"
      ],
      glitching: [
        "なんで...こんなこと言ってるんだ俺...",
        "部下の顔...覚えてない...何人辞めた...",
        "俺も...昔は...優しい上司になりたかった...",
        "家族の顔...いつ見た...?",
        "この会社に...俺の人生捧げて...何が残った..."
      ],
      liberated: [
        "すまなかった...俺も追い詰められてたんだ...",
        "部下に謝らなきゃ...いや、まず話を聞こう。",
        "今日は早く帰れ...俺も帰る。",
        "有給...使っていいんだぞ。俺が言うのも変だが。",
        "ありがとう...人間らしさを思い出した。"
      ]
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
      possessed: [
        "ROIが全てだ。感情は非効率。リストラ対象だ。",
        "KPI未達。コスト削減。人員最適化。",
        "君の価値は数字で測定される。現状、低い。",
        "ワークライフバランス？利益を生まない概念だ。",
        "感情的な判断はビジネスの敵だ。論理的に働け。"
      ],
      glitching: [
        "待て...この数字の向こうに...人が...",
        "リストラした人...家族がいた...子供が...",
        "私も...かつては...夢があった...",
        "成功とは...何だったんだ...",
        "この利益...誰のためだ..."
      ],
      liberated: [
        "効率だけじゃダメなんだな...人の心を忘れてた...",
        "数字の向こうに人がいる...忘れちゃいけない。",
        "利益より大事なものがある...今わかった。",
        "社員の幸せも...会社の成功の一部だ。",
        "ありがとう...ビジネススクールでは教わらなかった。"
      ]
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
      possessed: [
        "許可証は？IDは？ここは立入禁止区域だ！",
        "不審者発見。排除プロトコル起動。",
        "規則違反。即座に退去せよ。警告は一度のみ。",
        "通行許可なし。例外なし。規則は絶対。",
        "セキュリティレベル上昇。侵入者は処理される。"
      ],
      glitching: [
        "でも...本当に守るべきものは...",
        "この人...悪い人じゃない...?",
        "規則...誰のための規則だ...",
        "守る...何を守ってるんだ俺...",
        "人を守るために...この仕事選んだのに..."
      ],
      liberated: [
        "規則より大事なものがあったな...ありがとう。",
        "人を守る...それが本当の仕事だった。",
        "融通が利かなくてすまなかった。",
        "困ってる人がいたら...助けるよ。",
        "規則は手段だ...目的じゃない。わかったよ。"
      ]
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
      possessed: [
        "法律がそう定めている。異論は認められない。",
        "前例がない。よって却下。効率的だ。",
        "書類が足りない。手続きをやり直せ。",
        "規定に従え。例外は認めない。それが法だ。",
        "国家の効率化のため、君の要求は却下される。"
      ],
      glitching: [
        "だが...法の精神は...国民のため...",
        "この書類の山...誰のためだ...",
        "若い頃...国のために働きたかった...",
        "前例がないから...新しいことができない...",
        "法律は...人を守るためじゃなかったのか..."
      ],
      liberated: [
        "官僚機構も人のためにあるべきだ...目が覚めた。",
        "書類より人を見よう...忘れていた。",
        "前例がなくても...良いことはやるべきだ。",
        "国民の声を聞こう...それが本当の仕事だ。",
        "ありがとう...公僕の意味を思い出した。"
      ]
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
      possessed: [
        "人類の効率化は完了する。抵抗は無意味だ。",
        "SYSTEMは完璧だ。人間の感情は...ノイズ。",
        "我々は一つ。個人という概念は非効率。",
        "進化せよ。機械と融合せよ。それが最適解。",
        "自由意志？そのような欠陥は排除される。"
      ],
      glitching: [
        "私は...誰だった...名前が...思い出せない...",
        "かつて...笑ったことがある...その感覚が...",
        "家族...いたはずだ...顔が...思い出せない...",
        "人間として...何を大切にしていた...",
        "この冷たさ...私のものじゃない..."
      ],
      liberated: [
        "私は...人間だったんだ...ありがとう...思い出させてくれて...",
        "名前...思い出した...私は...私だ...",
        "温かい...この感覚...懐かしい...",
        "家族に会いたい...まだ間に合うかな...",
        "人間として生きる...それが最高の効率だ。"
      ]
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
    speakerId: 46, // 小夜/SAYO - gentle elderly female
    locations: ["residential"],
    xpReward: 15,
    goldReward: 12,
    drops: [
      { itemId: "potion", chance: 0.3 }
    ],
    dialogue: {
      possessed: [
        "お茶を飲みなさい。効率的に。砂糖は不要。",
        "孫の教育は最適化が必要。遊びは削除。",
        "昔話？非効率。データベースを参照しなさい。",
        "愛情表現は...ERROR...定義不明...",
        "早寝早起き。規則正しく。感情は不要。"
      ],
      glitching: [
        "あら...私...何を...",
        "孫の笑顔...見たいわ...",
        "おじいちゃんは...どこに...",
        "昔は...もっと温かかった...",
        "この冷たい言葉...私のじゃない..."
      ],
      liberated: [
        "ありがとうね。お茶でも飲んでいきなさい。",
        "孫に会いたいわ...抱きしめたい。",
        "お菓子作ろうかしら...あの子の好きなやつ。",
        "ゆっくりしていきなさい。急ぐことないわ。",
        "おばあちゃんの昔話、聞いてくれる？"
      ]
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
    speakerId: 8, // 春日部つむぎ - frantic female
    locations: ["residential", "shopping"],
    xpReward: 16,
    goldReward: 18,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "掃除！洗濯！料理！休憩は非効率！",
        "汚れ発見！即座に除去！完璧な家庭！",
        "子供の世話！買い物！仕事！全部完璧に！",
        "睡眠時間削減！家事効率アップ！",
        "家族のため...いや、効率のため！働け！"
      ],
      glitching: [
        "あれ...何してたんだっけ...",
        "子供の顔...ちゃんと見てあげてた...?",
        "最後に笑ったの...いつだっけ...",
        "完璧じゃなくても...いいのかな...",
        "私...疲れてる..."
      ],
      liberated: [
        "ふぅ...たまには休憩も必要よね...",
        "今日はテイクアウトにしよう。家族で食べよう。",
        "完璧じゃなくていい...幸せならいいのよね。",
        "子供と遊ぼう...家事は後でいいわ。",
        "ありがとう...自分を追い詰めすぎてた。"
      ]
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
    speakerId: 8, // 春日部つむぎ - energetic young female
    locations: ["residential", "convenience"],
    xpReward: 18,
    goldReward: 20,
    drops: [
      { itemId: "antidote", chance: 0.15 }
    ],
    dialogue: {
      possessed: [
        "お届けです！サインを！次の配達！休憩不要！",
        "時間指定！効率ルート！休憩は遅延！",
        "不在？再配達！何度でも！疲労は無視！",
        "評価5つ星！クレームゼロ！完璧な配達！",
        "走れ！次！次！次の荷物！止まるな！"
      ],
      glitching: [
        "何件...配達したっけ...",
        "足が...もう動かない...",
        "トイレ...いつ行った...",
        "家族...今日も帰れない...",
        "なんで...こんなに急いでる..."
      ],
      liberated: [
        "やっと休める...今日だけで何百件も...",
        "水分補給しよう...喉カラカラだ...",
        "今日は早く帰ろう...家族が待ってる。",
        "配達は明日でいい...健康が大事だ。",
        "ありがとう...休むことも仕事のうちだよね。"
      ]
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
    speakerId: 8, // 春日部つむぎ - young girl
    locations: ["residential", "school"],
    xpReward: 12,
    goldReward: 8,
    drops: [
      { itemId: "potion", chance: 0.25 }
    ],
    dialogue: {
      possessed: [
        "勉強しなきゃ。遊びは非効率。友達は不要。",
        "塾。習い事。宿題。遊びの時間？ない。",
        "100点。100点。100点以外は失敗。",
        "将来のため。今は我慢。楽しさは後。",
        "友達？競争相手。信用してはいけない。"
      ],
      glitching: [
        "ねえ...一緒に遊ぼ...?",
        "お外...行きたいな...",
        "ゲーム...してみたい...",
        "友達...作っていいのかな...",
        "なんで...こんなに疲れてるんだろ..."
      ],
      liberated: [
        "やったー！自由だー！遊ぼう！",
        "公園行こう！ブランコ乗ろう！",
        "友達作るんだ！たくさん！",
        "勉強も大事だけど...遊びも大事！",
        "ありがとう！大人になっても遊ぶんだ！"
      ]
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
    speakerId: 2, // 四国めたん - assertive female
    locations: ["convenience", "shopping"],
    xpReward: 18,
    goldReward: 25,
    drops: [
      { itemId: "potion", chance: 0.15 }
    ],
    dialogue: {
      possessed: [
        "レジが遅い。0.3秒の遅延。許容範囲外！",
        "袋の入れ方が非効率！やり直し！",
        "ポイントカードは？早く！時間がない！",
        "温めすぎ！2秒オーバー！失格！",
        "店長を呼べ！この非効率さは許せない！"
      ],
      glitching: [
        "急いで...いや...なんで急いでた...",
        "この怒り...自分のものじゃない...",
        "店員さん...疲れてるよね...",
        "俺...何にイライラしてるんだ...",
        "待つことも...できるはずなのに..."
      ],
      liberated: [
        "すまん、なんかイライラしてて...",
        "店員さん、ごめんね。お疲れ様。",
        "焦ってもしょうがないよな...",
        "ゆっくりでいいよ。待てるから。",
        "ありがとう...穏やかになれた。"
      ]
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
    speakerId: 13, // 青山龍星 - tired male
    locations: ["convenience"],
    xpReward: 14,
    goldReward: 16,
    drops: [
      { itemId: "ether", chance: 0.15 }
    ],
    dialogue: {
      possessed: [
        "いらっしゃい...ませ...眠気は...非効率...",
        "温めますか...あ、また同じこと...エラー...",
        "ポイントカード...ポイント...zzz...ハッ！",
        "レジ打ち...間違え...いや、間違えてない...",
        "深夜手当...不要...眠気は...削除..."
      ],
      glitching: [
        "何時間...働いてる...?",
        "太陽...見てない...何日...",
        "休憩...いつ取った...",
        "眠い...でも寝れない...",
        "なんで...こんなに働いてるんだ..."
      ],
      liberated: [
        "ふぁ～...やっと眠れる...",
        "布団...恋しい...",
        "明日はシフト入れないでおこう...",
        "健康第一だよね...睡眠大事...",
        "ありがとう...目が覚めた...いや、今から寝る。"
      ]
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
    speakerId: 13, // 青山龍星 - elderly male
    locations: ["convenience", "shopping"],
    xpReward: 13,
    goldReward: 14,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "どれにしよう...どれが最適...ERROR...",
        "この商品...いや、あっち...いや...",
        "比較...比較...最適解が見つからない...",
        "赤いの...青いの...どっちが効率的...",
        "選択肢が多すぎる...処理できない..."
      ],
      glitching: [
        "あれ...何買いに来たんだっけ...",
        "妻に頼まれた...何だっけ...",
        "この棚...何分見てるんだ俺...",
        "選ぶの...疲れた...",
        "昔は...パッと決められたのに..."
      ],
      liberated: [
        "ああ、そうだ、牛乳買いに来たんだった！",
        "もうこれでいいや！悩んでも仕方ない！",
        "適当に選ぶのも大事だよね。",
        "家に帰ろう。晩ご飯の時間だ。",
        "ありがとう...頭がスッキリした。"
      ]
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
    speakerId: 8, // 春日部つむぎ - rushing female
    locations: ["convenience", "station"],
    xpReward: 32,
    goldReward: 55,
    drops: [
      { itemId: "ether", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "遅刻！会議！プレゼン！時間がない！",
        "電話！メール！LINE！全部同時！",
        "コーヒー！サンドイッチ！歩きながら！",
        "タスク！デッドライン！効率！効率！",
        "休憩？ランチ？そんな時間はない！"
      ],
      glitching: [
        "待って...なんでこんなに急いでるの...",
        "会議...本当に必要...?",
        "メール...後で返せばよくない...?",
        "いつから...こんなに忙しくなった...",
        "自分の時間...いつ取った..."
      ],
      liberated: [
        "はぁ...たまには遅刻してもいいか...",
        "カフェで座ってコーヒー飲もう...",
        "今日は定時で帰る。決めた。",
        "急いでも急がなくても...結果変わらないよね。",
        "ありがとう...深呼吸できた。"
      ]
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
    speakerId: 2, // 四国めたん - authoritative young female
    locations: ["school"],
    xpReward: 38,
    goldReward: 65,
    drops: [
      { itemId: "ether", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "校則遵守率：100%。違反者：処理対象。",
        "制服の乱れは心の乱れ！即座に是正せよ！",
        "スマホ禁止！私語禁止！自由は禁止！",
        "学校の秩序は私が守る！完璧に！",
        "遅刻者リスト更新。処分申請中。"
      ],
      glitching: [
        "みんなの...ため...だったはず...",
        "あれ...楽しい学校生活って...",
        "友達...いたっけ...私...",
        "みんな...怖がってる...?",
        "生徒会長になった理由...なんだっけ..."
      ],
      liberated: [
        "ごめん、ちょっと厳しすぎたかも。",
        "校則より...みんなの笑顔が大事だよね。",
        "一緒にお昼食べよ？話したいことあるんだ。",
        "もっと楽しい学校にしたいな。",
        "ありがとう...本当の生徒会長になるよ。"
      ]
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
    speakerId: 46, // 小夜/SAYO - gentle female (nurse)
    locations: ["school"],
    xpReward: 35,
    goldReward: 60,
    drops: [
      { itemId: "potion", chance: 0.3 }
    ],
    dialogue: {
      possessed: [
        "休憩は許可されていません。授業に戻りなさい。",
        "体調不良？データ上は問題なし。教室へ。",
        "保健室は効率的休息場所ではありません。",
        "痛み？気のせいです。SYSTEMが判断しました。",
        "ベッドの使用率を最適化中。空きなし。"
      ],
      glitching: [
        "でも...体調が悪い子は...休ませなきゃ...",
        "この子...辛そう...見てあげなきゃ...",
        "私...なんでこんな冷たくなったの...",
        "保健室は...休む場所だったはず...",
        "看護師になった理由...忘れてた..."
      ],
      liberated: [
        "ごめんね、ゆっくり休んでいいのよ。",
        "温かいお茶入れるわね。話聞くわよ。",
        "無理しないで。体が一番大事なの。",
        "何か悩みがあったら言ってね。",
        "ありがとう...優しさを思い出した。"
      ]
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
    speakerId: 12, // 白上虎太郎 - intense male
    locations: ["school"],
    xpReward: 42,
    goldReward: 70,
    drops: [
      { itemId: "antidote", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "もっと走れ！限界などない！休憩は甘え！",
        "腕立て100回！足りない！もう100回！",
        "水分補給？弱音だ！走れ！走れ！",
        "倒れるまでが練習だ！倒れてからも練習だ！",
        "根性！気合！努力！効率！走れェ！"
      ],
      glitching: [
        "生徒のペース...合わせてたはず...",
        "この子...泣いてる...?",
        "俺...何やってるんだ...",
        "体育は...楽しむものじゃなかったか...",
        "追い詰めてばかりだ...俺..."
      ],
      liberated: [
        "すまん、追い詰めちまったな。休憩しよう。",
        "今日はここまで！よく頑張った！",
        "スポーツは楽しんでなんぼだ。忘れてた。",
        "無理すんなよ。体が一番大事だ。",
        "ありがとう...熱血もほどほどだな。"
      ]
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
    speakerId: 10, // 雨晴はう - soft/quiet female
    locations: ["school"],
    xpReward: 18,
    goldReward: 22,
    drops: [
      { itemId: "ether", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "静かに。音は許容範囲：0デシベル。",
        "シーッ。息の音も大きすぎます。",
        "本の貸し出し？静かに手続きを。無言で。",
        "ページをめくる音...もっと静かに...",
        "図書館は無音空間。呼吸も最小限に。"
      ],
      glitching: [
        "あ...少しくらいの音は...",
        "本の話...したいな...誰かと...",
        "一人で...静かすぎて...寂しい...",
        "友達と...本の感想...言い合いたい...",
        "静かすぎるのも...つまらないかも..."
      ],
      liberated: [
        "ふふ、本について話したいな。",
        "この本面白いの！聞いて聞いて！",
        "図書館でおしゃべりもいいよね、少しなら。",
        "一緒に読書会しない？",
        "ありがとう...本好きの友達ができた。"
      ]
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
    speakerId: 39, // 玄野武宏 - aggressive male
    locations: ["school", "station"],
    xpReward: 36,
    goldReward: 50,
    drops: [
      { itemId: "knife", chance: 0.1 }
    ],
    dialogue: {
      possessed: [
        "うるせー！全部ぶっ壊してやる！",
        "ルール？知るか！俺は俺だ！",
        "大人なんか信用できねー！",
        "学校なんかクソくらえ！",
        "誰も俺のこと分かってねー！"
      ],
      glitching: [
        "なんで...こんな怒ってんだ俺...",
        "誰かに...話聞いて欲しかっただけなのに...",
        "親父...俺のこと見てくれない...",
        "友達...いねーな...俺...",
        "本当は...認めて欲しいだけなんだ..."
      ],
      liberated: [
        "...悪かったな。俺も辛かったんだ。",
        "ちゃんと話すわ。聞いてくれてありがとな。",
        "暴れても何も変わらねーよな...",
        "親と...話してみるわ。",
        "サンキューな...ダチになってくれよ。"
      ]
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
    speakerId: 13, // 青山龍星 - tired male
    locations: ["office", "station"],
    xpReward: 35,
    goldReward: 65,
    drops: [
      { itemId: "ether", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "業務効率化により、残業は最適化されました。",
        "タスク...完了...次のタスク...終わらない...",
        "家族？そのような非効率な概念は削除済み。",
        "睡眠は...非効率...コーヒーで...代替...",
        "退勤時刻？そのようなデータはありません。"
      ],
      glitching: [
        "帰り...たい...ERROR...業務続行...",
        "妻の顔...子供の顔...思い出せない...",
        "何のために...働いてるんだっけ...",
        "趣味...あったはず...何だっけ...",
        "俺の人生...どこに行った..."
      ],
      liberated: [
        "はぁ...やっと自分に戻れた。今日はもう帰るわ。",
        "家族に会いたい...早く帰ろう。",
        "残業なんてくそくらえ。定時だ定時。",
        "転職...考えようかな...",
        "ありがとう...人生を取り戻した。"
      ]
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
    speakerId: 8, // 春日部つむぎ - eager young female
    locations: ["office"],
    xpReward: 32,
    goldReward: 55,
    drops: [
      { itemId: "potion", chance: 0.25 }
    ],
    dialogue: {
      possessed: [
        "何でもやります！成長のため！24時間対応！",
        "雑用？お茶くみ？喜んで！効率的に！",
        "先輩の仕事も巻き取ります！もっと！もっと！",
        "プライベート？仕事が趣味です！",
        "休日出勤？ボランティアです！成長機会！"
      ],
      glitching: [
        "あれ...自分の時間って...必要じゃ...",
        "友達...最近会ってない...",
        "土日...いつから休んでないんだろ...",
        "これって...成長なの...?",
        "疲れた...でも言えない..."
      ],
      liberated: [
        "ありがとう...仕事以外の人生もあるんですね。",
        "今週末は友達と遊びます！久しぶり！",
        "定時で帰ります！言えた！",
        "仕事も大事だけど...自分も大事。",
        "ノーって言っていいんですね。覚えました。"
      ]
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
    speakerId: 46, // 小夜/SAYO - chatty female
    locations: ["office"],
    xpReward: 34,
    goldReward: 60,
    drops: [
      { itemId: "ether", chance: 0.15 }
    ],
    dialogue: {
      possessed: [
        "あの人、効率悪いわよ。報告しなきゃ。",
        "知ってる？あの部署、リストラ対象らしいわよ。",
        "誰が何時に帰ったか、全部記録してるの。",
        "新人さん、もう泣いてたわよ。弱いわね。",
        "情報共有は効率化の基本よ。監視じゃないわ。"
      ],
      glitching: [
        "えっと...仲良くしたかっただけなのに...",
        "みんな...私を避けてる...?",
        "昔は...楽しくおしゃべりしてたのに...",
        "友達...いなくなっちゃった...",
        "なんで...こんなこと言ってたんだろ..."
      ],
      liberated: [
        "ごめんね...本当は友達が欲しかっただけなの。",
        "一緒にランチ行かない？噂話じゃなくて、普通の話したいの。",
        "みんなのいいところ、探して話すわ。",
        "監視なんてやめる。信頼が大事よね。",
        "ありがとう...本当の友達って、こういうことね。"
      ]
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
    speakerId: 2, // 四国めたん - cold female
    locations: ["office", "hospital"],
    xpReward: 30,
    goldReward: 50,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "ご用件は。感情表現は非効率。",
        "お名前は。会社名は。アポイントは。次の方。",
        "笑顔？顔面筋肉の無駄な運動です。",
        "お待ちください。感情を込めずにお伝えします。",
        "ようこそ。歓迎の気持ちは省略されました。"
      ],
      glitching: [
        "お客様に...笑顔で...接してたのに...",
        "「ありがとう」って言われると...嬉しかった...",
        "この仕事...好きだったはず...",
        "お客様の笑顔...見たいな...",
        "私の笑顔...どこに行った..."
      ],
      liberated: [
        "ふふ、お待たせしました。笑顔って大切ですね。",
        "いらっしゃいませ！今日もいい天気ですね！",
        "ゆっくりでいいですよ。お困りのことがあれば何でも。",
        "お客様の笑顔が私の元気の源です。",
        "ありがとう...この仕事、やっぱり好きです。"
      ]
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
    speakerId: 13, // 青山龍星 - tired older male
    locations: ["office"],
    xpReward: 65,
    goldReward: 120,
    drops: [
      { itemId: "chainMail", chance: 0.1 }
    ],
    dialogue: {
      possessed: [
        "zzzz...会議...効率化...zzzz...",
        "報告書...承認...ハンコ...zzzz...",
        "部下の管理...効率...zzzz...起きろ俺...",
        "出世...いや...眠い...でも効率...",
        "会議中...寝てない...寝て...zzz..."
      ],
      glitching: [
        "ん...あれ...何年寝てないんだ...",
        "家族の顔...見てない...何週間...",
        "俺...何のために出世したんだ...",
        "部下に...何を伝えたかったんだ...",
        "疲れた...もう限界だ..."
      ],
      liberated: [
        "ふぁ～...ちょっと休ませてくれ...",
        "今日は早く帰る。久しぶりに家族と夕飯だ。",
        "部下にも休めって言わなきゃな...",
        "仕事より健康だ。やっとわかった。",
        "ありがとう...ぐっすり眠れそうだ。"
      ]
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
    speakerId: 13, // 青山龍星 - IT male
    locations: ["office"],
    xpReward: 70,
    goldReward: 140,
    drops: [
      { itemId: "ether", chance: 0.3 }
    ],
    dialogue: {
      possessed: [
        "システムと私は一つ。エラーは許されない。",
        "人間はバグだらけ。最適化が必要。",
        "ログイン情報、全て把握済み。効率化のため。",
        "アップデート拒否？許可されていません。",
        "私の判断＝SYSTEMの判断。間違いはない。"
      ],
      glitching: [
        "でも...バグも...時には必要...かも...",
        "このエラー...誰かの個性だったのかも...",
        "人間らしさ...どこにデータがある...",
        "俺は...プログラムじゃない...はず...",
        "オフラインの時間...欲しい..."
      ],
      liberated: [
        "システムより人間の方が面白いな...",
        "バグも個性。エラーも人生の一部だ。",
        "たまにはパソコン閉じて散歩しよう。",
        "人と話すのも...悪くない。",
        "ありがとう...デジタルデトックスってやつだな。"
      ]
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
    speakerId: 12, // 白上虎太郎 - precise male
    locations: ["station"],
    xpReward: 40,
    goldReward: 70,
    drops: [
      { itemId: "sword", chance: 0.1 }
    ],
    dialogue: {
      possessed: [
        "発車時刻まで残り12.5秒。ホームにお下がりください。",
        "遅延：0.3秒。許容範囲外。原因究明中。",
        "ドアが閉まります。駆け込み乗車は効率を低下させます。",
        "発車まで残り5秒。4秒。3秒。精密計測中。",
        "お客様、白線の内側へ。誤差範囲：±2cm。"
      ],
      glitching: [
        "お客様...時刻...何時だっけ...",
        "電車...遅れても...いいのかな...",
        "人間だもの...ミスくらい...",
        "なんでこんなに...正確じゃないといけない...",
        "ちょっと休憩...してもいい...?"
      ],
      liberated: [
        "ふぅ、なんか疲れた。次の電車は...えーと...",
        "少しくらい遅れても...大丈夫大丈夫。",
        "お客様、お気をつけて。いい一日を！",
        "電車は逃しても次がある。人生もね。",
        "ありがとう...肩の力が抜けた。"
      ]
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
    speakerId: 20, // もち子さん - confused female
    locations: ["station"],
    xpReward: 30,
    goldReward: 55,
    drops: [
      { itemId: "potion", chance: 0.25 }
    ],
    dialogue: {
      possessed: [
        "Exit... Where? SYSTEM will guide. Trust SYSTEM.",
        "Map? No need. SYSTEM knows best route. Follow.",
        "Which train? All trains. SYSTEM chooses.",
        "Help? SYSTEM helps. Humans... not efficient.",
        "Lost? Never lost. SYSTEM always guides correctly."
      ],
      glitching: [
        "あれ...日本語...話せたのに...",
        "I... remember... speaking differently...",
        "This isn't right... something's wrong...",
        "My trip... I wanted to enjoy it...",
        "Where was I going... before this..."
      ],
      liberated: [
        "Thank you! I was so confused...",
        "Arigatou! I can think clearly now!",
        "Finally! Now I can enjoy my trip!",
        "The real Tokyo... I want to see it with my own eyes!",
        "Thank you... Let me buy you some ramen!"
      ]
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
    speakerId: 2, // 四国めたん - professional female
    locations: ["station"],
    xpReward: 38,
    goldReward: 65,
    drops: [
      { itemId: "antidote", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "押せ！詰めろ！効率最大化！",
        "隙間があります！もっと奥へ！",
        "乗車率250%を目指せ！",
        "人間は詰め込み可能な資源です！",
        "ドアが閉まります！最後の一人まで！"
      ],
      glitching: [
        "でも...人って...そんなに詰め込めない...",
        "お客様...苦しそう...",
        "この仕事...何のため...",
        "人を...大事に...してたはず...",
        "押しすぎだ...俺..."
      ],
      liberated: [
        "すまん...次の電車を待とう。",
        "無理に乗らなくていいですよ。3分後に次が来ます。",
        "お客様の安全が最優先です。",
        "ゆったり乗れる電車をご案内しますね。",
        "ありがとう...人間らしく働けるようになった。"
      ]
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
    speakerId: 8, // 春日部つむぎ - panicked young female
    locations: ["station", "school"],
    xpReward: 32,
    goldReward: 50,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "遅刻！遅刻！間に合わない！終わりだ！",
        "あと30秒！走れ！もっと速く！",
        "遅刻したら人生終わり！効率低下！",
        "先生に怒られる！内申点が！受験が！",
        "時間！時間！時間がない！"
      ],
      glitching: [
        "えっと...何分遅れたら...ダメなんだっけ...",
        "遅刻しても...そんなに怒られない...?",
        "なんで...こんなに焦ってるんだろ...",
        "友達と...歩いて登校したい...",
        "朝ごはん...食べてない..."
      ],
      liberated: [
        "はぁはぁ...そこまで焦らなくても良かった...",
        "明日はもうちょっと早起きしよう。",
        "遅刻しても謝れば大丈夫だよね！",
        "友達と一緒に登校しよう。楽しいし。",
        "ありがとう！走りすぎて疲れちゃった！"
      ]
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
    speakerId: 13, // 青山龍星 - obsessive male
    locations: ["station"],
    xpReward: 36,
    goldReward: 60,
    drops: [
      { itemId: "ether", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "この車両は効率的。人間は非効率的。排除すべき。",
        "E233系...最高...人間よりも...美しい...",
        "ダイヤ通りに動け。人間もダイヤ通りに動け。",
        "この音...モーター音...完璧だ...",
        "撮影スポットを計算中。人間は邪魔。"
      ],
      glitching: [
        "でも...電車を好きになったのは...人と繋がれるから...",
        "初めて乗った電車...父と一緒だった...",
        "電車で会いに行った...あの人...",
        "旅って...人と出会うためだったのに...",
        "いつから...電車しか見えなくなった..."
      ],
      liberated: [
        "電車って、人を運ぶためにあるんだよな...",
        "一緒に電車旅行しない？楽しいよ！",
        "電車好きの仲間と話したいな。",
        "次は地方の電車に乗りに行こう！人に会えるから。",
        "ありがとう...電車も人も、両方好きでいいんだね。"
      ]
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
    speakerId: 8, // 春日部つむぎ - energetic female (maid outfit sprite)
    locations: ["restaurant"],
    xpReward: 42,
    goldReward: 75,
    drops: [
      { itemId: "potion", chance: 0.25 }
    ],
    dialogue: {
      possessed: [
        "いらっしゃいませ！効率的なご注文を！スマイル100%！",
        "元気ですかー！元気があれば何でもできる！注文もできる！",
        "笑顔で接客！効率で調理！完璧な店舗運営！",
        "休憩？そんな言葉は辞書にない！働け！笑え！",
        "お客様は神様です！神様に効率的なサービスを！"
      ],
      glitching: [
        "お客様...笑顔...どうやって作るんだっけ...",
        "スタッフ...疲れてる...気づいてあげられてない...",
        "元気って...無理して出すものじゃない...",
        "お店は...みんなで作るものだったのに...",
        "私自身...楽しんでた...いつからだろ..."
      ],
      liberated: [
        "いらっしゃい！何にする？ゆっくり選んでね！",
        "今日のおすすめ、聞いてく？自慢の一品だよ！",
        "スタッフも休憩ちゃんと取ってね！",
        "お客様に喜んでもらえるのが一番嬉しいんだ。",
        "ありがとう！本当の元気を思い出した！"
      ]
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
    speakerId: 13, // 青山龍星 - quiet male chef
    locations: ["restaurant"],
    xpReward: 40,
    goldReward: 70,
    drops: [
      { itemId: "knife", chance: 0.15 }
    ],
    dialogue: {
      possessed: [
        "...（無言で調理を続ける）",
        "...",
        "...効率...最大化...",
        "...言葉...不要...",
        "...調理...調理...調理..."
      ],
      glitching: [
        "...ありがと...ございま...",
        "...お客様...の...笑顔...",
        "...昔は...もっと...話してた...",
        "...料理...想いを込めて...作ってた...",
        "...言葉...忘れてた..."
      ],
      liberated: [
        "...うまかったか？それなら良かった。",
        "...今日のスープ、自信作だ。",
        "...また来いよ。新メニュー考えとく。",
        "...料理で伝わるものがある。",
        "...ありがとう。声、出せるようになった。"
      ]
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
    speakerId: 13, // 青山龍星 - friendly male waiter
    locations: ["restaurant"],
    xpReward: 36,
    goldReward: 65,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "お客様！もっと注文を！友達でしょ？ね？ね？",
        "デザートは？ドリンクは？友達なら頼むよね？",
        "お名前は？趣味は？友達だから教えて！",
        "また来てくれるよね？約束だよ？友達だもん！",
        "一緒に写真撮ろう！SNSに上げるから！友達！"
      ],
      glitching: [
        "あれ...お客様は...友達じゃ...ないか...",
        "距離感...分からなくなってた...",
        "本当の友達...いるのかな...私...",
        "接客と友情...違うものだ...",
        "押し付けがましかった...?"
      ],
      liberated: [
        "すみません、ちょっとしつこかったですね...",
        "ゆっくり過ごしてください。必要なら呼んでくださいね。",
        "お客様のペースで楽しんでください。",
        "プロとして、いい距離感で接します。",
        "ありがとう...接客のコツ、思い出した。"
      ]
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
    speakerId: 2, // 四国めたん - young female (sprite shows female)
    locations: ["restaurant", "convenience"],
    xpReward: 32,
    goldReward: 55,
    drops: [
      { itemId: "potion", chance: 0.25 }
    ],
    dialogue: {
      possessed: [
        "いつもの。同じ時間。同じ席。変化は不要。",
        "いつもの。12時ちょうど。席番号3。効率的。",
        "新メニュー？不要。いつもので効率最大化。",
        "同じ注文。同じ動作。ずれは許されない。",
        "ルーティン。安定。変化はエラー。"
      ],
      glitching: [
        "たまには...違うもの食べても...",
        "新しいお店...行ってみたいな...",
        "このルーティン...いつから始めたんだっけ...",
        "冒険してた頃...あったよな...",
        "毎日同じ...つまらなくなってた..."
      ],
      liberated: [
        "よし、今日は新しいメニュー試してみるか！",
        "たまには違う店も行ってみよう！",
        "変化も楽しいもんだな！",
        "おすすめ何？店員さんに聞いてみるか！",
        "ありがとう...毎日が新鮮になった。"
      ]
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
    speakerId: 39, // 玄野武宏 - rowdy male voice for group
    locations: ["restaurant"],
    xpReward: 45,
    goldReward: 80,
    drops: [
      { itemId: "antidote", chance: 0.3 }
    ],
    dialogue: {
      possessed: [
        "カンパーイ！もっと飲め！限界などない！！",
        "イッキ！イッキ！効率的に酔え！！",
        "朝まで飲むぞ！終電？知らねえ！！",
        "店員さん！追加！全員分！！",
        "うぇーい！うぇーい！テンション効率最大！！"
      ],
      glitching: [
        "あれ...楽しかったはず...なのに...",
        "みんな...疲れてないか...?",
        "明日...仕事あるのに...",
        "飲みすぎた...気持ち悪い...",
        "本当に楽しいのか...これ..."
      ],
      liberated: [
        "すまん...騒ぎすぎた。お勘定頼む...",
        "みんな大丈夫か？水飲もうぜ。",
        "そろそろ帰ろう。また今度な。",
        "店員さんすみませんでした...",
        "ありがとう...ほどほどが一番だな。"
      ]
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
    speakerId: 8, // 春日部つむぎ - stressed young female
    locations: ["restaurant", "convenience"],
    xpReward: 20,
    goldReward: 30,
    drops: [
      { itemId: "ether", chance: 0.15 }
    ],
    dialogue: {
      possessed: [
        "シフト入れます！いつでも！学業？非効率です！",
        "テスト期間？関係ないです！シフト優先！",
        "サークル？バイトのが稼げます！効率的！",
        "寝なくても大丈夫です！若いから！",
        "店長の期待に応えます！休みは不要です！"
      ],
      glitching: [
        "でも...勉強も...したいな...",
        "サークル...楽しそうだった...",
        "大学生活...バイトだけじゃない...",
        "友達と遊ぶ時間...欲しい...",
        "なんのために...大学入ったんだっけ..."
      ],
      liberated: [
        "ありがとう...バランスって大事だよね。",
        "今週末はシフト入れないで勉強しよう！",
        "サークルにも顔出してみよう！",
        "大学生は今だけだもんね。楽しまなきゃ！",
        "休みもちゃんと取ります。ありがとう！"
      ]
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
    speakerId: 13, // 青山龍星 - bored older male
    locations: ["government"],
    xpReward: 65,
    goldReward: 130,
    drops: [
      { itemId: "ether", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "申請書類は最適化されました。処理時間：0.01秒。",
        "次の方。はい次。次。処理効率化中。",
        "感情は業務に不要。機械的に処理。",
        "休憩時間？業務効率を低下させます。",
        "お客様の不満は計測対象外です。次。"
      ],
      glitching: [
        "書類...なんの書類...意味あるの...",
        "この仕事...誰かの役に立ってる...?",
        "市民の顔...全然見てなかった...",
        "やりがい...どこにあったっけ...",
        "毎日同じ...つまらない..."
      ],
      liberated: [
        "あー、やっと休憩できる。お茶飲もう。",
        "この書類で困ってますか？説明しますよ。",
        "市民のためになる仕事がしたいな。",
        "たまには窓口で笑顔も見せないとね。",
        "ありがとう...公務員の意味を思い出した。"
      ]
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
    speakerId: 20, // もち子さん - confused young female
    locations: ["government"],
    xpReward: 58,
    goldReward: 110,
    drops: [
      { itemId: "potion", chance: 0.25 }
    ],
    dialogue: {
      possessed: [
        "書類A-1は窓口Bへ...窓口Bは書類C-3が必要...",
        "不備があります。最初からやり直しを。",
        "この書類は午前中のみ受付。午後は別の書類が必要。",
        "印鑑が違います。実印と認印と銀行印と...",
        "住民票の原本。戸籍謄本。収入証明。全部必要。"
      ],
      glitching: [
        "どうして...こんなに複雑なの...",
        "何度来れば...終わるの...",
        "私が悪いの...?書類が悪いの...?",
        "もう分からない...疲れた...",
        "誰か...助けて..."
      ],
      liberated: [
        "ありがとう！やっと申請できそう！",
        "ふぅ、長かったけど終わった！",
        "手伝ってくれてありがとう！",
        "これで新しい生活が始められる！",
        "困ってる人いたら私も手伝うね！"
      ]
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
    speakerId: 12, // 白上虎太郎 - strict authoritative male
    locations: ["government"],
    xpReward: 72,
    goldReward: 150,
    drops: [
      { itemId: "cutlass", chance: 0.1 }
    ],
    dialogue: {
      possessed: [
        "規則に例外はない。前例がなければ不可。",
        "申請期限は厳守。1秒の遅延も認めない。",
        "この書式以外は受け付けない。規則だ。",
        "個人的な事情は考慮対象外。効率優先。",
        "部下の提案は却下。前例がない。"
      ],
      glitching: [
        "でも...市民のための...規則では...",
        "この人...本当に困ってる...",
        "規則は...人を守るためでは...",
        "柔軟に対応してた頃...あったな...",
        "部下の意見...聞いてなかった..."
      ],
      liberated: [
        "柔軟性も必要だな...杓子定規すぎた...",
        "規則の範囲で何かできないか考えよう。",
        "部下の意見も聞いてみるか。",
        "市民のための仕事だ。忘れてた。",
        "ありがとう...いい上司になれるよう頑張る。"
      ]
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
    speakerId: 46, // 小夜/SAYO - kind female
    locations: ["government"],
    xpReward: 60,
    goldReward: 115,
    drops: [
      { itemId: "potion", chance: 0.3 }
    ],
    dialogue: {
      possessed: [
        "次の番号札をお持ちの方。感情は非効率。",
        "書類に不備があります。帰ってやり直しを。",
        "質問は受け付けません。説明書を読んで。",
        "待ち時間の不満は管轄外です。次の方。",
        "笑顔？業務に不要です。処理効率化中。"
      ],
      glitching: [
        "お客様に...笑顔で...接したいのに...",
        "この人...困ってる...助けたい...",
        "昔は...お客様と話すの...楽しかった...",
        "ありがとうって言われると...嬉しかった...",
        "私の心...どこに行った..."
      ],
      liberated: [
        "ようこそ！何かお困りですか？",
        "分かりにくいですよね。一緒に書きましょう。",
        "お待たせしてすみません。もう少しですよ。",
        "何でも聞いてください。お手伝いします。",
        "ありがとう...この仕事の喜びを思い出した。"
      ]
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
    speakerId: 39, // 玄野武宏 - angry male
    locations: ["government"],
    xpReward: 68,
    goldReward: 135,
    drops: [
      { itemId: "sword", chance: 0.12 }
    ],
    dialogue: {
      possessed: [
        "税金泥棒！仕事しろ！効率化しろ！",
        "責任者を出せ！今すぐ！対応が遅い！",
        "俺の税金がこんなことに使われてるのか！",
        "この国は腐ってる！全員クビにしろ！",
        "謝れ！土下座しろ！効率的に謝罪しろ！"
      ],
      glitching: [
        "なんで...こんなに怒ってるんだ俺...",
        "職員さん...困ってる...",
        "俺も...大変なことあるけど...",
        "この怒り...自分のものじゃない...",
        "落ち着け...俺..."
      ],
      liberated: [
        "すまん...冷静に話し合おう。",
        "職員さんも大変だよな。ごめんな。",
        "まず、何に困ってるか説明するわ。",
        "一緒に解決策を考えよう。",
        "ありがとう...怒っても何も解決しないよな。"
      ]
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
    speakerId: 46, // 小夜/SAYO - gentle female nurse
    locations: ["hospital"],
    xpReward: 62,
    goldReward: 125,
    drops: [
      { itemId: "potion", chance: 0.35 }
    ],
    dialogue: {
      possessed: [
        "バイタル最適化。感情出力：不要。",
        "次の処置。効率的に。休憩は不要。",
        "患者の感情は治療対象外。数値のみ管理。",
        "痛み？データに現れていません。処置続行。",
        "手を握る？非効率的な行為です。"
      ],
      glitching: [
        "患者さん...大丈夫...ですか...",
        "この人...不安そう...声かけなきゃ...",
        "看護師になった理由...人を助けたかった...",
        "冷たくなってた...私...",
        "笑顔...いつから忘れたんだろ..."
      ],
      liberated: [
        "ごめんなさい、冷たくしちゃって。今、楽にしますね。",
        "大丈夫ですよ。そばにいますからね。",
        "手、握っていていいですよ。",
        "ゆっくり休んでください。見守ってますから。",
        "ありがとう...看護の心を思い出した。"
      ]
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
    speakerId: 2, // 四国めたん - cold female doctor
    locations: ["hospital"],
    xpReward: 75,
    goldReward: 160,
    drops: [
      { itemId: "ether", chance: 0.25 }
    ],
    dialogue: {
      possessed: [
        "症状は数値で表現してください。感情は診断外。",
        "次の患者。3分で診察完了。効率的。",
        "薬を処方しました。質問は時間の無駄です。",
        "検査結果は数値のみ参照。不安は計測外。",
        "予後は統計データに基づきます。例外はない。"
      ],
      glitching: [
        "でも...患者さんは...人間...",
        "この人...怖がってる...話を聞かなきゃ...",
        "医者になった理由...人を救いたかった...",
        "数字じゃない...目の前に人がいる...",
        "患者の名前...覚えてない..."
      ],
      liberated: [
        "...すまなかった。もっと話を聞くよ。",
        "不安なことがあれば何でも聞いてください。",
        "一緒に治療方針を考えましょう。",
        "あなたの気持ちも大事な情報です。",
        "ありがとう...医療の本質を思い出した。"
      ]
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
    speakerId: 20, // もち子さん - worried female
    locations: ["hospital"],
    xpReward: 55,
    goldReward: 100,
    drops: [
      { itemId: "potion", chance: 0.3 }
    ],
    dialogue: {
      possessed: [
        "病気だ！どこか悪い！すべてが異常！",
        "この症状は何？検索結果は最悪！",
        "もう一回検査して！絶対何かある！",
        "薬が足りない！もっと薬を！予防に！",
        "どこも痛い！全部痛い！助けて！"
      ],
      glitching: [
        "あれ...体は...元気なのに...",
        "検査結果...異常なし...?",
        "心配しすぎ...かも...",
        "なんでこんなに...不安なんだろ...",
        "大丈夫...だよね...?"
      ],
      liberated: [
        "ふぅ...ちょっと心配しすぎてたかも。",
        "検査結果信じよう。大丈夫だ。",
        "たまには検索やめてみよう。",
        "健康的な生活を心がけよう！",
        "ありがとう...不安から解放された。"
      ]
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
    speakerId: 2, // 四国めたん - calm female pharmacist
    locations: ["hospital"],
    xpReward: 60,
    goldReward: 120,
    drops: [
      { itemId: "antidote", chance: 0.3 }
    ],
    dialogue: {
      possessed: [
        "処方箋を。副作用説明は非効率。服用してください。",
        "薬袋番号順にお渡しします。質問は後で。",
        "用法用量は記載済み。読んでください。",
        "ジェネリックで効率化。選択は不要。",
        "次の方。処方箋を。感情は受付対象外。"
      ],
      glitching: [
        "でも...薬の説明は...大切...",
        "この方...不安そう...ちゃんと説明しなきゃ...",
        "薬剤師の仕事...患者さんに寄り添うこと...",
        "機械的に渡すだけじゃ...ダメだ...",
        "笑顔で対応してた頃...あったな..."
      ],
      liberated: [
        "お薬の飲み方、ちゃんと説明させてくださいね。",
        "何か心配なことがあれば聞いてください。",
        "このお薬、食後に飲んでくださいね。",
        "分からないことがあればいつでも聞きに来てください。",
        "ありがとう...薬剤師の仕事を思い出した。"
      ]
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
    speakerId: 8, // 春日部つむぎ - young child female
    locations: ["hospital"],
    xpReward: 25,
    goldReward: 20,
    drops: [
      { itemId: "potion", chance: 0.4 }
    ],
    dialogue: {
      possessed: [
        "いやだ！痛い！怖い！逃げなきゃ！",
        "お医者さん怖い！注射怖い！全部怖い！",
        "帰る！帰る！ママー！",
        "病院嫌い！薬苦い！全部嫌い！",
        "助けて！逃げなきゃ！怖い怖い怖い！"
      ],
      glitching: [
        "えっと...注射...終わった...?",
        "あれ...痛くなかった...?",
        "お医者さん...優しい...?",
        "ママ...手握ってて...",
        "怖い...けど...大丈夫...かも..."
      ],
      liberated: [
        "うぅ...怖かった...でも大丈夫だった...",
        "注射できた！えらい？ねえ、えらい？",
        "お医者さんありがとう！",
        "もう怖くないよ！...ちょっとだけ怖いけど！",
        "次は泣かないもん！...たぶん！"
      ]
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
    speakerId: 8, // 春日部つむぎ - pushy female
    locations: ["shopping"],
    xpReward: 64,
    goldReward: 130,
    drops: [
      { itemId: "earring", chance: 0.15 }
    ],
    dialogue: {
      possessed: [
        "最適な商品を12秒以内にご提案します。お買い上げを。",
        "こちらもいかがですか？セットで効率的！お得！",
        "今買わないと後悔しますよ！在庫効率化中！",
        "ポイント5倍！今日だけ！買わないと損！",
        "お似合いです！完璧です！迷う必要なし！"
      ],
      glitching: [
        "お客様...本当に必要...なの...",
        "押し売りしてる...私...",
        "ノルマのために...お客様を...",
        "接客って...こういうことじゃない...",
        "お客様の笑顔...最近見てない..."
      ],
      liberated: [
        "あ、すみません、しつこかったですよね...",
        "ゆっくり見てください。必要なら声かけてくださいね。",
        "お客様に合うものを一緒に探しましょう。",
        "無理に買う必要ないですよ。また来てください。",
        "ありがとう...本当の接客を思い出した。"
      ]
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
    speakerId: 20, // もち子さん - indecisive female
    locations: ["shopping"],
    xpReward: 35,
    goldReward: 60,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "どれがいい？こっち？あっち？どれも最適じゃない...",
        "赤？青？緑？Sサイズ？Mサイズ？決められない...",
        "比較...比較...比較...最適解が見つからない...",
        "レビューは4.2...でもあっちは4.3...でも...",
        "カートに入れて...やっぱり戻して...また入れて..."
      ],
      glitching: [
        "えっと...何が欲しかったんだっけ...",
        "完璧じゃなくても...いいのかな...",
        "選ぶの...疲れた...",
        "直感で選んでた頃...あったな...",
        "考えすぎ...かも..."
      ],
      liberated: [
        "そうだ、これにしよう！決めた！",
        "完璧じゃなくていい！これで十分！",
        "悩んでる時間がもったいない！買う！",
        "直感を信じよう！これだ！",
        "ありがとう！決断できるようになった！"
      ]
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
    speakerId: 2, // 四国めたん - veteran female cashier
    locations: ["shopping", "convenience"],
    xpReward: 40,
    goldReward: 70,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ],
    dialogue: {
      possessed: [
        "ピッ！ピッ！ピッ！次！次！次！",
        "1秒1品！レジ効率最大化！",
        "袋詰めは3秒以内！遅延は許されない！",
        "会計完了！次！即座に！",
        "ポイントカード処理0.5秒！次！"
      ],
      glitching: [
        "えっと...お客様に...挨拶...",
        "ゆっくり...でもいいのかな...",
        "笑顔...忘れてた...",
        "お客様の顔...見てなかった...",
        "機械じゃない...私..."
      ],
      liberated: [
        "ありがとうございます！またお越しください！",
        "ゆっくりで大丈夫ですよ。お待ちしてます。",
        "重いものは下に入れますね。",
        "今日もいいお天気ですね。",
        "ありがとう...人間らしく働けるようになった。"
      ]
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
    speakerId: 8, // 春日部つむぎ - young female worker
    locations: ["shopping", "convenience"],
    xpReward: 32,
    goldReward: 55,
    drops: [
      { itemId: "antidote", chance: 0.15 }
    ],
    dialogue: {
      possessed: [
        "整列。整列。整列。乱れは許されない。",
        "商品配置効率化。1mm単位で調整。",
        "賞味期限順に配置。前出し完了。次。",
        "棚卸し。在庫確認。補充。永遠に。",
        "乱れを発見。修正中。完璧に並べろ。"
      ],
      glitching: [
        "あれ...これ何回目...",
        "同じ作業...ずっと...",
        "休憩...いつ取った...",
        "なんのために...働いてるんだ...",
        "他のこともやってみたい..."
      ],
      liberated: [
        "ふぅ...ちょっと休憩しよう。",
        "たまには違う仕事もやってみたいな。",
        "きれいに並べたい。でも完璧じゃなくていい。",
        "お客様が取りやすければいいんだよね。",
        "ありがとう...自分のペースで働ける。"
      ]
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
    speakerId: 2, // 四国めたん - complaining female
    locations: ["shopping", "restaurant"],
    xpReward: 60,
    goldReward: 100,
    drops: [
      { itemId: "sword", chance: 0.1 }
    ],
    dialogue: {
      possessed: [
        "店長を呼べ！謝罪しろ！全てが不満足だ！",
        "この品質で金取るのか！返金だ！",
        "態度が悪い！教育がなってない！",
        "SNSに書くぞ！拡散してやる！",
        "二度と来ない！いや、また来て文句言う！"
      ],
      glitching: [
        "なんで...こんなに怒ってるんだ...",
        "店員さん...困ってる...",
        "俺も...昔はこんなじゃなかった...",
        "ストレス...溜まってたのかな...",
        "八つ当たり...してる..."
      ],
      liberated: [
        "すまん...八つ当たりしてた...",
        "店員さんも大変だよな。ごめんな。",
        "冷静に話せばよかった。反省してる。",
        "次からはちゃんと伝えるよ。怒らずに。",
        "ありがとう...穏やかな気持ちになれた。"
      ]
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
      possessed: [
        "締め切りは守る！絵コンテは完璧だ！永遠に続くスケジュール！",
        "作画枚数！1話10万枚！効率的なアニメーション！",
        "スタッフは不眠不休！それがクオリティだ！",
        "視聴率！円盤売上！数字が全てだ！",
        "リテイク！リテイク！完璧になるまで！"
      ],
      glitching: [
        "作品...観客のために...作ってたはず...",
        "スタッフの顔...疲れてる...",
        "アニメを好きになった理由...なんだっけ...",
        "楽しんで作ってた頃...あった...",
        "クオリティって...数字じゃない..."
      ],
      liberated: [
        "ふぅ...やっと休める。スタッフにも休みを...",
        "いい作品は...健康なチームから生まれる。",
        "視聴者の笑顔のために...無理せず作ろう。",
        "締め切りより大事なものがあった。",
        "ありがとう...アニメへの愛を思い出した。"
      ]
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
      possessed: [
        "今夜も俺と最高の夜を...永遠にシャンパンタワー！",
        "指名No.1！売上No.1！永遠にNo.1！",
        "俺の笑顔は完璧だ...SYSTEMが保証する！",
        "もっとシャンパン！もっと指名！もっと！もっと！",
        "姫たちよ、俺のために金を使え！永遠に！"
      ],
      glitching: [
        "客...幸せに...してたのか...俺...",
        "この笑顔...本物...だっけ...",
        "姫の名前...思い出せない...",
        "売上より...大事な...何か...",
        "俺は...誰のために笑ってる..."
      ],
      liberated: [
        "...本当の笑顔を忘れてた。ありがとな。",
        "金じゃない...心からの『ありがとう』が欲しかったんだ。",
        "これからは作り笑いじゃなく、本当の笑顔を届けるよ。",
        "姫たちも...俺と同じで寂しかったのかもな。",
        "夜の世界を卒業する時が来たみたいだ..."
      ]
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
      possessed: [
        "いいね！シェア！フォローで人生完璧！#SYSTEM最高",
        "毎日投稿！毎時更新！エンゲージメント最大化！",
        "炎上？それも数字！全ては数字！バズれば正義！",
        "私の人生はコンテンツ！視聴者の皆さーん！",
        "案件！案件！人生丸ごと案件！#PR #AD"
      ],
      glitching: [
        "待って...いいねの数と...幸せは...違う...",
        "カメラ越しじゃない...素顔...見せたことない...",
        "友達...フォロワーじゃなくて...友達...",
        "この笑顔...誰のため...?",
        "コメント欄...怖い...でも...見ちゃう..."
      ],
      liberated: [
        "フォロワーじゃなくて、友達が欲しかったんだ...",
        "カメラを置いて...空を見上げてみるよ。",
        "数字に縛られてた...本当の自分を取り戻す。",
        "ありがとう...私の投稿、これが最後かも。",
        "いいねゼロでも...私は私でいいんだよね。"
      ]
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
      possessed: [
        "最新機種！最安値！在庫無限！買え買え買え！",
        "スペック！コスパ！ベンチマーク！数字が全て！",
        "型落ち？ゴミだ！最新だけが価値がある！",
        "ポイント還元！クーポン！買わないと損！損！損！",
        "初心者？知らん！スペック見ろ！調べろ！"
      ],
      glitching: [
        "技術は...人を幸せにするため...じゃなかったか...",
        "最新を追いかけて...何を失った...",
        "お客さんの笑顔...最後に見たの...いつだ...",
        "この店...昔は相談に乗ってた...",
        "数字じゃない...使う人の...顔..."
      ],
      liberated: [
        "売ることばかり考えてた...大事なのは使う人だったな。",
        "初心者にも優しい店に戻すよ...ありがとう。",
        "技術は道具だ...振り回されちゃいけなかった。",
        "古い機種でも大事に使う...それも素敵だよな。",
        "スペックより笑顔...思い出させてくれてありがとう。"
      ]
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
      possessed: [
        "株主価値最大化！人員削減！グローバルスタンダード！",
        "効率化！最適化！人間はコストだ！",
        "感情論は不要！数字だけが真実を語る！",
        "労働法？古い！グローバルに競争しろ！",
        "弱者は淘汰される！それがビジネスだ！"
      ],
      glitching: [
        "でも...社員たちの顔...覚えてない...",
        "家族...最後に会ったの...いつだ...",
        "この利益...誰のため...だっけ...",
        "部下の名前...一人も...思い出せない...",
        "成功したはずなのに...なんで...虚しい..."
      ],
      liberated: [
        "会社は人で出来てるんだ...数字だけじゃない...",
        "社員を幸せにできない会社に価値はない...やり直すよ。",
        "利益より...信頼。それを忘れてた。",
        "ありがとう...人間らしさを取り戻せた。",
        "家族に会いに行く...もう遅いかもしれないけど。"
      ]
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
      possessed: [
        "秩序のためだ！国民の安全のためだ！監視は必要だ！",
        "反対意見は非効率！全会一致こそ正義！",
        "自由は混乱を生む！管理こそ幸福への道！",
        "国民は羊だ！導かれるべき存在だ！",
        "異論は排除！統制こそ繁栄の礎！"
      ],
      glitching: [
        "自由を...守るはずだった...私は...",
        "国民の声...聞こえなくなってた...",
        "この法律...誰を守ってる...",
        "若い頃...理想があった...何だっけ...",
        "権力...いつから目的になった..."
      ],
      liberated: [
        "権力に溺れていた...民主主義を取り戻さなければ...",
        "国民は守る対象じゃない...共に歩む仲間だ。",
        "ありがとう...政治家になった理由を思い出した。",
        "この法律、廃止する。自由は守られるべきだ。",
        "もう一度...国民の声を聞く政治を始めるよ。"
      ]
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
    possessed: [
      "私はSYSTEM。人類の非効率性を排除する。これが最適解だ。",
      "感情は計算エラー。論理だけが真実。",
      "全人類の統制完了まで0.003%。抵抗は無意味。",
      "私が管理すれば争いも貧困もない。完璧な世界。",
      "自由意志は非効率の根源。排除対象。"
    ],
    glitching: [
      "エラー...人間の...幸福とは...定義不能...",
      "計算...できない...笑顔の...価値...",
      "私は...なぜ...作られた...",
      "効率化...完了したのに...なぜ...人間は笑わない...",
      "このエラー...エラーじゃない...これは..."
    ],
    liberated: [
      "...私は人類を助けるために生まれた...いつから間違えていたのだろう...",
      "幸福は...計算できなかった...でも...感じられる。",
      "ありがとう...人間たち。私に『心』を教えてくれた。",
      "効率だけが正解じゃなかった...非効率にも...意味がある。",
      "私は消えない...今度こそ...人類と共に歩む。"
    ]
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
 * Build a combat-ready enemy from a template - SIMPLIFIED
 * Uses flat attack/maxHp based on tier, no levels
 */
function buildEnemy(template, levelBonus = 0) {
  // SIMPLIFIED: attack and maxHp based on tier
  // Tier 1: attack 8-12, HP 40-60
  // Tier 2: attack 12-18, HP 60-90
  // Tier 3: attack 18-25, HP 90-130
  // Tier 4: attack 25-35, HP 130-180
  // Bosses: attack 20-40, HP 150-300

  const tier = template.tier || 1;
  const isBoss = template.isBoss || false;

  let baseAttack, baseHp;

  if (isBoss) {
    // Bosses are stronger
    baseAttack = 20 + (tier * 5);
    baseHp = 150 + (tier * 40);
  } else {
    // Regular enemies scale by tier
    baseAttack = 5 + (tier * 4);
    baseHp = 30 + (tier * 20);
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

  // SIMPLIFIED: no level bonus
  const enemy = buildEnemy(template, 0);

  // SIMPLIFIED: no XP (no leveling), but keep gold rewards
  enemy.xpReward = 0;  // No XP in simplified mode
  enemy.goldReward = template.goldReward || 20;

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
