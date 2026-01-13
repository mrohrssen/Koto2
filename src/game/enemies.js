// Enemy and Boss Definitions - NEO TOKYO: System Liberation
// Citizens possessed by the SYSTEM AI, awaiting liberation
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
