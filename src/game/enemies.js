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

// Enemy template data extracted to JSON for maintainability
import enemyTemplatesData from '../../data/enemies.json' with { type: 'json' };

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


// Re-export the imported JSON data
export const ENEMY_TEMPLATES = enemyTemplatesData;

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
