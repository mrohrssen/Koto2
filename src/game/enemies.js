// Enemy and Boss Definitions
// iRO-based 6-stat system with derived combat stats
// Enhanced with intent system for strategic combat

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
  }
};

// ============ ENEMY ABILITIES ============
// Unique abilities that trigger under certain conditions
export const ENEMY_ABILITIES = {
  slime: {
    id: 'split',
    name: '分裂',
    nameEn: 'Split',
    trigger: 'onLowHp',
    threshold: 0.4,
    description: 'Splits into two smaller slimes when HP falls below 40%',
    effect: 'split'
  },
  goblin: {
    id: 'callBackup',
    name: '仲間を呼ぶ',
    nameEn: 'Call Backup',
    trigger: 'onTurn',
    turnNumber: 4,
    description: 'Calls another goblin for backup on turn 4',
    effect: 'summon',
    summonId: 'goblin'
  },
  wolf: {
    id: 'cornered',
    name: '窮鼠',
    nameEn: 'Cornered',
    trigger: 'onLowHp',
    threshold: 0.3,
    description: 'When cornered, gains +50% ATK',
    effect: 'buff',
    buffType: 'atk',
    buffAmount: 0.5
  },
  skeleton: {
    id: 'reassemble',
    name: '再構成',
    nameEn: 'Reassemble',
    trigger: 'onDeath',
    uses: 1,
    description: 'Revives once with 30% HP',
    effect: 'revive',
    revivePercent: 0.3
  },
  orc: {
    id: 'berserk',
    name: '狂戦士',
    nameEn: 'Berserk',
    trigger: 'onLowHp',
    threshold: 0.5,
    description: 'Goes berserk, doubling attack but halving defense',
    effect: 'berserk',
    atkMultiplier: 2.0,
    defMultiplier: 0.5
  },
  mage: {
    id: 'barrier',
    name: '魔法障壁',
    nameEn: 'Barrier',
    trigger: 'onTurn',
    turnInterval: 3,
    description: 'Creates a magic barrier that absorbs the next hit',
    effect: 'barrier'
  },
  knight: {
    id: 'riposte',
    name: '反撃',
    nameEn: 'Riposte',
    trigger: 'onDefend',
    description: 'Counter-attacks when defending',
    effect: 'counter',
    counterDamage: 0.5
  },
  demon: {
    id: 'hellfire',
    name: '業火',
    nameEn: 'Hellfire',
    trigger: 'special',
    description: 'Unleashes hellfire magic',
    effect: 'magic',
    magicMultiplier: 1.5
  },
  golem: {
    id: 'stoneForm',
    name: '岩の体',
    nameEn: 'Stone Form',
    trigger: 'passive',
    description: 'Takes 20% less damage from physical attacks',
    effect: 'resistance',
    physicalResist: 0.2
  },
  shadow: {
    id: 'vanish',
    name: '消失',
    nameEn: 'Vanish',
    trigger: 'special',
    description: 'Becomes untargetable for one turn, then strikes',
    effect: 'vanish'
  },
  dragon: {
    id: 'dragonBreath',
    name: '竜の息',
    nameEn: 'Dragon Breath',
    trigger: 'special',
    description: 'Breathes fire dealing magic damage',
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
  // ===== TIER 1 (Floor 1-2) =====
  slime: {
    id: "slime",
    name: "スライム",
    nameEn: "Slime",
    description: "青くて弱いモンスター。初心者ハンターの最初の敵。",
    tier: 1,
    baseLevel: 3,
    stats: { str: 4, agi: 3, vit: 6, int: 2, dex: 4, luk: 3 },
    personality: "wild",
    xpReward: 15,
    goldReward: 15,
    drops: [
      { itemId: "potion", chance: 0.2 }
    ]
  },

  goblin: {
    id: "goblin",
    name: "ゴブリン",
    nameEn: "Goblin",
    description: "小さくて緑色の魔物。数で攻めてくる。",
    tier: 1,
    baseLevel: 4,
    stats: { str: 5, agi: 5, vit: 4, int: 3, dex: 5, luk: 4 },
    personality: "cunning",
    xpReward: 20,
    goldReward: 30,
    drops: [
      { itemId: "potion", chance: 0.15 },
      { itemId: "knife", chance: 0.05 }
    ]
  },

  wolf: {
    id: "wolf",
    name: "魔狼",
    nameEn: "Dire Wolf",
    description: "鋭い牙を持つ狼。素早い攻撃が得意。",
    tier: 1,
    baseLevel: 4,
    stats: { str: 5, agi: 8, vit: 3, int: 1, dex: 6, luk: 3 },
    personality: "aggressive",
    xpReward: 18,
    goldReward: 24,
    drops: [
      { itemId: "antidote", chance: 0.25 }
    ]
  },

  // ===== TIER 2 (Floor 3-4) =====
  skeleton: {
    id: "skeleton",
    name: "スケルトン",
    nameEn: "Skeleton",
    description: "古い骨から蘇った戦士。武器を使う。",
    tier: 2,
    baseLevel: 9,
    stats: { str: 9, agi: 6, vit: 8, int: 4, dex: 8, luk: 5 },
    personality: "methodical",
    xpReward: 35,
    goldReward: 60,
    drops: [
      { itemId: "sword", chance: 0.1 },
      { itemId: "ether", chance: 0.15 }
    ]
  },

  orc: {
    id: "orc",
    name: "オーク",
    nameEn: "Orc",
    description: "筋肉質の大きな魔物。力が強い。",
    tier: 2,
    baseLevel: 10,
    stats: { str: 14, agi: 4, vit: 12, int: 2, dex: 6, luk: 4 },
    personality: "aggressive",
    xpReward: 40,
    goldReward: 75,
    drops: [
      { itemId: "axe", chance: 0.08 },
      { itemId: "potion", chance: 0.2 }
    ]
  },

  mage: {
    id: "mage",
    name: "闇魔術師",
    nameEn: "Dark Mage",
    description: "闇の魔法を使う魔術師。魔法攻撃に注意。",
    tier: 2,
    baseLevel: 10,
    stats: { str: 4, agi: 6, vit: 5, int: 14, dex: 8, luk: 5 },
    personality: "cunning",
    xpReward: 45,
    goldReward: 90,
    drops: [
      { itemId: "earring", chance: 0.1 },
      { itemId: "ether", chance: 0.25 }
    ]
  },

  // ===== TIER 3 (Floor 5-6) =====
  knight: {
    id: "knight",
    name: "亡霊騎士",
    nameEn: "Phantom Knight",
    description: "かつて偉大だった騎士の亡霊。強い剣技を持つ。",
    tier: 3,
    baseLevel: 16,
    stats: { str: 14, agi: 10, vit: 12, int: 6, dex: 12, luk: 8 },
    personality: "honorable",
    xpReward: 70,
    goldReward: 150,
    drops: [
      { itemId: "cutlass", chance: 0.12 },
      { itemId: "chainMail", chance: 0.08 }
    ]
  },

  demon: {
    id: "demon",
    name: "下級悪魔",
    nameEn: "Lesser Demon",
    description: "地獄から来た悪魔。炎の魔法を使う。",
    tier: 3,
    baseLevel: 17,
    stats: { str: 12, agi: 12, vit: 10, int: 14, dex: 10, luk: 8 },
    personality: "cruel",
    xpReward: 80,
    goldReward: 180,
    drops: [
      { itemId: "fireBrand", chance: 0.15 },
      { itemId: "fireScroll", chance: 0.2 }
    ]
  },

  golem: {
    id: "golem",
    name: "ストーンゴーレム",
    nameEn: "Stone Golem",
    description: "岩で作られた巨人。動きは遅いが硬い。",
    tier: 3,
    baseLevel: 18,
    stats: { str: 16, agi: 2, vit: 20, int: 4, dex: 6, luk: 4 },
    personality: "slow",
    xpReward: 75,
    goldReward: 120,
    drops: [
      { itemId: "stoneShield", chance: 0.2 },
      { itemId: "ironShield", chance: 0.1 }
    ]
  },

  // ===== TIER 4 (Floor 7 - pre-boss) =====
  shadow: {
    id: "shadow",
    name: "影の兵士",
    nameEn: "Shadow Soldier",
    description: "闇から生まれた戦士。実体がないように見える。",
    tier: 4,
    baseLevel: 24,
    stats: { str: 14, agi: 20, vit: 10, int: 8, dex: 16, luk: 10 },
    personality: "silent",
    xpReward: 100,
    goldReward: 240,
    drops: [
      { itemId: "stiletto", chance: 0.1 },
      { itemId: "manteau", chance: 0.08 }
    ]
  },

  dragon: {
    id: "dragon",
    name: "若竜",
    nameEn: "Young Dragon",
    description: "まだ若い竜だが、その力は侮れない。",
    tier: 4,
    baseLevel: 26,
    stats: { str: 18, agi: 14, vit: 14, int: 12, dex: 14, luk: 10 },
    personality: "proud",
    xpReward: 120,
    goldReward: 300,
    drops: [
      { itemId: "fullPlate", chance: 0.25 },
      { itemId: "flamberge", chance: 0.2 }
    ]
  }
};

// ============ FLOOR BOSSES (Floors 1-6) ============
export const FLOOR_BOSSES = {
  1: {
    id: "boss_goblin_king",
    name: "ゴブリンの王",
    nameEn: "Goblin King",
    description: "ゴブリンたちを率いる巨大な王。冠をかぶっている。",
    baseLevel: 8,
    stats: { str: 8, agi: 6, vit: 8, int: 3, dex: 6, luk: 5 },
    personality: "arrogant",
    xpReward: 100,
    goldReward: 150,
    isBoss: true
  },

  2: {
    id: "boss_wolf_alpha",
    name: "群れの長",
    nameEn: "Alpha Fenrir",
    description: "魔狼の群れを率いる巨大な白い狼。",
    baseLevel: 10,
    stats: { str: 7, agi: 12, vit: 6, int: 2, dex: 9, luk: 4 },
    personality: "fierce",
    xpReward: 150,
    goldReward: 240,
    isBoss: true
  },

  3: {
    id: "boss_lich",
    name: "リッチ",
    nameEn: "Lich",
    description: "死を超越した魔術師。強力な闇魔法を操る。",
    baseLevel: 14,
    stats: { str: 5, agi: 8, vit: 8, int: 20, dex: 10, luk: 6 },
    personality: "calculating",
    xpReward: 200,
    goldReward: 360,
    isBoss: true
  },

  4: {
    id: "boss_ogre",
    name: "オーガ将軍",
    nameEn: "Ogre General",
    description: "オークたちを率いる巨大な将軍。巨大な棍棒を持つ。",
    baseLevel: 16,
    stats: { str: 18, agi: 5, vit: 16, int: 3, dex: 8, luk: 6 },
    personality: "brutal",
    xpReward: 280,
    goldReward: 450,
    isBoss: true
  },

  5: {
    id: "boss_demon_lord",
    name: "魔王の使者",
    nameEn: "Demon Herald",
    description: "魔王に仕える強力な悪魔。地獄の炎を操る。",
    baseLevel: 20,
    stats: { str: 14, agi: 14, vit: 12, int: 18, dex: 12, luk: 8 },
    personality: "malevolent",
    xpReward: 350,
    goldReward: 600,
    isBoss: true
  },

  6: {
    id: "boss_dragon_elder",
    name: "古竜",
    nameEn: "Elder Dragon",
    description: "千年生きた竜。その息は全てを焼き尽くす。",
    baseLevel: 24,
    stats: { str: 20, agi: 14, vit: 18, int: 16, dex: 14, luk: 10 },
    personality: "ancient",
    xpReward: 500,
    goldReward: 900,
    isBoss: true
  }
};

// ============ FINAL BOSS (Floor 7) ============
export const FINAL_BOSS = {
  id: "boss_shadow_monarch",
  name: "影の君主",
  nameEn: "Shadow Monarch",
  description: "全ての影を支配する存在。ダンジョンの最深部で待ち構える絶対的な力。",
  baseLevel: 30,
  stats: { str: 22, agi: 18, vit: 20, int: 20, dex: 16, luk: 14 },
  personality: "absolute",
  xpReward: 1000,
  goldReward: 1500,
  isBoss: true,
  isFinalBoss: true
};

// ============ BOSS DROP TABLES ============
export const BOSS_DROPS = {
  1: [
    { itemId: "goblinCrown", name: "ゴブリンの王冠", rarity: "rare" },
    { itemId: "ironSword", name: "鉄の剣", rarity: "uncommon" },
    { itemId: "leatherArmor", name: "革の鎧", rarity: "uncommon" }
  ],
  2: [
    { itemId: "fenrirFang", name: "フェンリルの牙", rarity: "rare" },
    { itemId: "swiftBoots", name: "疾風のブーツ", rarity: "rare" },
    { itemId: "huntersBow", name: "狩人の弓", rarity: "uncommon" }
  ],
  3: [
    { itemId: "lichStaff", name: "リッチの杖", rarity: "rare" },
    { itemId: "soulRobe", name: "魂のローブ", rarity: "rare" },
    { itemId: "darkGrimoire", name: "闇の魔導書", rarity: "epic" }
  ],
  4: [
    { itemId: "ogreClub", name: "オーガの棍棒", rarity: "rare" },
    { itemId: "titanArmor", name: "巨人の鎧", rarity: "epic" },
    { itemId: "strengthRing", name: "力の指輪", rarity: "rare" }
  ],
  5: [
    { itemId: "demonBlade", name: "悪魔の剣", rarity: "epic" },
    { itemId: "infernalArmor", name: "業火の鎧", rarity: "epic" },
    { itemId: "hellfire", name: "ヘルファイア", rarity: "epic" }
  ],
  6: [
    { itemId: "dragonSlayer", name: "竜殺しの剣", rarity: "legendary" },
    { itemId: "dragonMail", name: "竜鱗の鎧", rarity: "legendary" },
    { itemId: "dragonHeart", name: "竜の心臓", rarity: "legendary" }
  ],
  7: [
    { itemId: "shadowMonarchBlade", name: "影の君主の剣", rarity: "mythic" },
    { itemId: "monarchCrown", name: "君主の王冠", rarity: "mythic" },
    { itemId: "absolutePower", name: "絶対的な力", rarity: "mythic" }
  ]
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

// Get enemies for a specific floor
export function getEnemiesForFloor(floor) {
  let tier;
  if (floor <= 2) tier = 1;
  else if (floor <= 4) tier = 2;
  else if (floor <= 6) tier = 3;
  else tier = 4;

  return getEnemiesByTier(tier);
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
