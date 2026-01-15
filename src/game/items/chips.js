/**
 * @fileoverview Chip equipment system - passive augmentations for gear
 * @module src/game/items/chips
 *
 * PURPOSE:
 * Implements the chip system where players buy and equip passive augmentations
 * to their equipment. Chips provide stat bonuses, on-hit effects, conditional
 * triggers, and scaling bonuses. Each equipment slot has limited chip capacity.
 * Chips have 5 rarities affecting their power and cost.
 *
 * KEY EXPORTS:
 * Constants:
 * - CHIP_CATEGORIES - Stat, OnHit, OnEffect, Counter categories
 * - CHIP_RARITIES - Common, Uncommon, Rare, Epic, Legendary with multipliers
 * - CHIPS - All chip definitions (100+ chips with effects)
 *
 * Functions:
 * - getChip(chipId) - Get chip definition by ID
 * - getChipsByCategory(category) - Filter chips by category
 * - getChipsByRarity(rarity) - Filter chips by rarity
 * - getChipPrice(chipId) - Calculate chip purchase price
 * - generateShopChips(floor, owned, count) - Generate shop inventory
 * - calculateChipStatBonuses(chips) - Sum stat bonuses from equipped chips
 * - processOnHitChips(chips, target) - Execute on-hit effects
 * - processOnKillChips(chips) - Execute on-kill effects
 * - processOnDamageChips(chips, damage) - Execute damage-triggered effects
 * - updateCounterStacks(stacks, chips, trigger, context) - Track counter chips
 * - calculateCounterBonuses(chips, runStats) - Calculate counter-based bonuses
 * - getEquippedChips(player) - Get all chips equipped on player
 * - equipChip(player, slot, chipId, maxSlots) - Equip chip to equipment slot
 *
 * DEPENDENCIES:
 * - None (self-contained data module)
 *
 * CHIP CATEGORIES:
 * - STAT: Flat bonuses (+5 ATK, +10 HP, etc.)
 * - ON_HIT: Chance effects when attacking (poison, lifesteal, etc.)
 * - ON_EFFECT: Conditional triggers (on kill, on crit, on low HP)
 * - COUNTER: Scaling bonuses (damage per kill, crit per dodge, etc.)
 *
 * CHIP RARITIES:
 * - Common (gray): 1.0x stats, 1.0x price
 * - Uncommon (green): 1.5x stats, 2.5x price
 * - Rare (blue): 2.0x stats, 5.0x price
 * - Epic (purple): 2.5x stats, 10.0x price
 * - Legendary (orange): 3.0x stats, 20.0x price
 *
 * DATA STRUCTURES:
 * - Chip: { id, name, category, rarity, basePrice, description,
 *          effects: { stat?, chance?, trigger?, scaling? } }
 * - EquippedChip: { chipId, slotCost } stored in equipment.equippedChips[]
 *
 * SLOT SYSTEM:
 * - Each equipment piece has chip slots (default 5)
 * - Chips cost 1-3 slots based on power
 * - Legendary chips cost more slots than common
 *
 * ARCHITECTURE NOTES:
 * - Chip effects applied via calculateChipStatBonuses() at combat start
 * - On-hit/on-kill effects processed during combat in combat/mechanics.js
 * - Counter stacks tracked in run.runStats and reset each run
 * - Shop chips generated with weighted random by floor and rarity
 * - Rarity generation uses floor-based weighted tables
 *
 * CLAUDE HINTS:
 * - For equipping chips, see equipChip() and game.js openChipModal()
 * - Counter chips reference run.runStats for their scaling
 * - Chip effects defined in effects{} object, vary by category
 * - Price calculation in getChipPrice() includes rarity multiplier
 * - Shop generation excludes already-owned chips
 */

// ============ CHIP CATEGORIES ============
export const CHIP_CATEGORIES = {
  STAT: {
    id: 'stat',
    name: 'ステータス',
    nameEn: 'Stat',
    description: 'Flat stat bonuses'
  },
  ON_HIT: {
    id: 'onHit',
    name: 'オンヒット',
    nameEn: 'On Hit',
    description: 'Chance to trigger effect when hitting enemy'
  },
  ON_EFFECT: {
    id: 'onEffect',
    name: 'オンエフェクト',
    nameEn: 'On Effect',
    description: 'Triggers on specific conditions'
  },
  COUNTER: {
    id: 'counter',
    name: 'カウンター',
    nameEn: 'Counter',
    description: 'Scales with accumulation during run'
  }
};

// ============ CHIP RARITIES ============
export const CHIP_RARITIES = {
  common: {
    id: 'common',
    name: 'ノーマル',
    nameEn: 'Common',
    color: '#9d9d9d',
    priceMultiplier: 1.0,
    statMultiplier: 1.0
  },
  uncommon: {
    id: 'uncommon',
    name: 'アンコモン',
    nameEn: 'Uncommon',
    color: '#1eff00',
    priceMultiplier: 2.5,
    statMultiplier: 1.5
  },
  rare: {
    id: 'rare',
    name: 'レア',
    nameEn: 'Rare',
    color: '#0070dd',
    priceMultiplier: 5.0,
    statMultiplier: 2.0
  },
  epic: {
    id: 'epic',
    name: 'エピック',
    nameEn: 'Epic',
    color: '#a335ee',
    priceMultiplier: 10.0,
    statMultiplier: 2.5
  },
  legendary: {
    id: 'legendary',
    name: 'レジェンダリー',
    nameEn: 'Legendary',
    color: '#ff8000',
    priceMultiplier: 20.0,
    statMultiplier: 3.0
  }
};

// Base price for chips
const BASE_CHIP_PRICE = 30;

// ============ CHIP UPGRADE CONFIG ============
export const CHIP_UPGRADE_CONFIG = {
  failureRates: {
    common: 0.05,      // 5% chance to fail
    uncommon: 0.10,    // 10% chance to fail
    rare: 0.15,        // 15% chance to fail
    epic: 0.25         // 25% chance to fail
    // legendary cannot be upgraded
  },
  rarityOrder: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
  // Cost to upgrade = purchase price of current rarity
  getUpgradeCost: (rarity) => Math.floor(BASE_CHIP_PRICE * CHIP_RARITIES[rarity].priceMultiplier)
};

// ============ CHIP DEFINITIONS ============
export const CHIPS = {
  // ========== STAT CHIPS (10) ==========
  ballpointPen: {
    id: 'ballpointPen',
    name: 'ボールペン',
    nameEn: 'Ballpoint Pen',
    description: '普通のボールペン。意外と便利。',
    descriptionEn: 'A regular ballpoint pen. Surprisingly useful.',
    category: 'stat',
    rarity: 'common',
    effects: {
      stats: { dex: 3 }
    }
  },
  kitchenKnife: {
    id: 'kitchenKnife',
    name: '包丁',
    nameEn: 'Kitchen Knife',
    description: '料理用の包丁。攻撃力アップ。',
    descriptionEn: 'A kitchen knife. Increases attack power.',
    category: 'stat',
    rarity: 'common',
    effects: {
      stats: { str: 5 }
    }
  },
  sneakers: {
    id: 'sneakers',
    name: 'スニーカー',
    nameEn: 'Sneakers',
    description: '履き慣れたスニーカー。素早く動ける。',
    descriptionEn: 'Well-worn sneakers. Move faster.',
    category: 'stat',
    rarity: 'common',
    effects: {
      stats: { agi: 4 }
    }
  },
  pot: {
    id: 'pot',
    name: '鍋',
    nameEn: 'Pot',
    description: '頑丈な鍋。盾代わりになる。',
    descriptionEn: 'A sturdy pot. Works as a shield.',
    category: 'stat',
    rarity: 'common',
    effects: {
      stats: { vit: 4 }
    }
  },
  smartphone: {
    id: 'smartphone',
    name: 'スマホ',
    nameEn: 'Smartphone',
    description: 'ハッキング用にカスタマイズされたスマホ。',
    descriptionEn: 'A smartphone customized for hacking.',
    category: 'stat',
    rarity: 'common',
    effects: {
      stats: { int: 4 }
    }
  },
  wallet: {
    id: 'wallet',
    name: '財布',
    nameEn: 'Wallet',
    description: '幸運のお守りが入った財布。',
    descriptionEn: 'A wallet with a lucky charm inside.',
    category: 'stat',
    rarity: 'uncommon',
    effects: {
      stats: { luk: 2, dex: 2 }
    }
  },
  broom: {
    id: 'broom',
    name: 'ほうき',
    nameEn: 'Broom',
    description: '掃除用のほうき。リーチが長い。',
    descriptionEn: 'A cleaning broom. Good reach.',
    category: 'stat',
    rarity: 'common',
    effects: {
      stats: { agi: 2, vit: 1 }
    }
  },
  calculator: {
    id: 'calculator',
    name: '電卓',
    nameEn: 'Calculator',
    description: '高性能電卓。計算が速くなる。',
    descriptionEn: 'A high-performance calculator. Faster calculations.',
    category: 'stat',
    rarity: 'uncommon',
    effects: {
      stats: { int: 5 }
    }
  },
  dumbbell: {
    id: 'dumbbell',
    name: 'ダンベル',
    nameEn: 'Dumbbell',
    description: '筋トレ用のダンベル。パワーアップ。',
    descriptionEn: 'A training dumbbell. Power up.',
    category: 'stat',
    rarity: 'uncommon',
    effects: {
      stats: { str: 3, vit: 1 }
    }
  },
  earrings: {
    id: 'earrings',
    name: 'イヤリング',
    nameEn: 'Earrings',
    description: '幸運を呼ぶイヤリング。',
    descriptionEn: 'Lucky earrings.',
    category: 'stat',
    rarity: 'uncommon',
    effects: {
      stats: { luk: 3 }
    }
  },

  // ========== ON_HIT CHIPS (10) ==========
  thumbtack: {
    id: 'thumbtack',
    name: '画鋲',
    nameEn: 'Thumbtack',
    description: '踏んだら痛い。データ破損を引き起こす。',
    descriptionEn: 'Painful to step on. Causes data corruption.',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: {
        chance: 0.08,
        status: 'defrag',
        duration: 3
      }
    }
  },
  icePack: {
    id: 'icePack',
    name: '保冷剤',
    nameEn: 'Ice Pack',
    description: '冷たい保冷剤。敵の動きを遅くする。',
    descriptionEn: 'A cold ice pack. Slows enemy movement.',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: {
        chance: 0.10,
        status: 'lag',
        duration: 2
      }
    }
  },
  hammer: {
    id: 'hammer',
    name: 'ハンマー',
    nameEn: 'Hammer',
    description: '重いハンマー。衝撃でシステムをフリーズ。',
    descriptionEn: 'A heavy hammer. Freezes systems on impact.',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: {
        chance: 0.10,
        status: 'bufferOverflow',
        duration: 1
      }
    }
  },
  sprayPaint: {
    id: 'sprayPaint',
    name: 'スプレー塗料',
    nameEn: 'Spray Paint',
    description: '視界を塞ぐスプレー。スキルを封じる。',
    descriptionEn: 'Blinding spray. Seals skills.',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: {
        chance: 0.10,
        status: 'corrupted',
        duration: 3
      }
    }
  },
  mirror: {
    id: 'mirror',
    name: '鏡',
    nameEn: 'Mirror',
    description: '割れた鏡。弱点を露出させる。',
    descriptionEn: 'A broken mirror. Exposes weaknesses.',
    category: 'onHit',
    rarity: 'rare',
    effects: {
      onHit: {
        chance: 0.10,
        status: 'exposed',
        duration: 3
      }
    }
  },
  lighter: {
    id: 'lighter',
    name: 'ライター',
    nameEn: 'Lighter',
    description: '100円ライター。オーバーヒートを誘発。',
    descriptionEn: 'A cheap lighter. Induces overheating.',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: {
        chance: 0.15,
        status: 'overheated',
        duration: 1
      }
    }
  },
  sewingNeedle: {
    id: 'sewingNeedle',
    name: '縫い針',
    nameEn: 'Sewing Needle',
    description: '細い針。データを断片化させる。',
    descriptionEn: 'A thin needle. Fragments data.',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: {
        chance: 0.10,
        status: 'defrag',
        duration: 2
      }
    }
  },
  frozenGyoza: {
    id: 'frozenGyoza',
    name: '冷凍餃子',
    nameEn: 'Frozen Gyoza',
    description: '凍った餃子。当たると痛い。',
    descriptionEn: 'Frozen dumplings. Hurts on impact.',
    category: 'onHit',
    rarity: 'rare',
    effects: {
      onHit: {
        chance: 0.10,
        status: 'lag',
        duration: 2,
        bonusDamage: 3
      }
    }
  },
  dictionary: {
    id: 'dictionary',
    name: '辞書',
    nameEn: 'Dictionary',
    description: '分厚い辞書。頭に当たるとスタン。',
    descriptionEn: 'A thick dictionary. Stuns on head impact.',
    category: 'onHit',
    rarity: 'rare',
    effects: {
      onHit: {
        chance: 0.08,
        status: 'bufferOverflow',
        duration: 2
      }
    }
  },
  soySauce: {
    id: 'soySauce',
    name: '醤油',
    nameEn: 'Soy Sauce',
    description: '目に入ると痛い。スキルを妨害。',
    descriptionEn: 'Painful in the eyes. Disrupts skills.',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: {
        chance: 0.10,
        status: 'corrupted',
        duration: 2
      }
    }
  },

  // ========== ON_EFFECT CHIPS (5) ==========
  onigiri: {
    id: 'onigiri',
    name: 'おにぎり',
    nameEn: 'Onigiri',
    description: 'お母さんのおにぎり。倒すと回復。',
    descriptionEn: "Mom's rice ball. Heals on kill.",
    category: 'onEffect',
    rarity: 'uncommon',
    effects: {
      onKill: {
        chance: 0.30,
        heal: 10
      }
    }
  },
  energyDrink: {
    id: 'energyDrink',
    name: 'エナジードリンク',
    nameEn: 'Energy Drink',
    description: 'カフェイン大量。倒すと加速。',
    descriptionEn: 'Loaded with caffeine. Speed boost on kill.',
    category: 'onEffect',
    rarity: 'rare',
    effects: {
      onKill: {
        chance: 0.20,
        aspdBoost: 0.10,
        duration: 5000 // 5 seconds in ms
      }
    }
  },
  fourLeafClover: {
    id: 'fourLeafClover',
    name: '四つ葉のクローバー',
    nameEn: 'Four-Leaf Clover',
    description: '幸運の象徴。報酬が倍になることも。',
    descriptionEn: 'Symbol of luck. May double rewards.',
    category: 'onEffect',
    rarity: 'epic',
    effects: {
      onKill: {
        chance: 0.15,
        doubleCredits: true
      }
    }
  },
  helmet: {
    id: 'helmet',
    name: 'ヘルメット',
    nameEn: 'Helmet',
    description: '工事現場のヘルメット。ダメージ軽減。',
    descriptionEn: 'Construction helmet. Reduces damage.',
    category: 'onEffect',
    rarity: 'rare',
    effects: {
      onDamage: {
        chance: 0.20,
        damageReduction: 0.50
      }
    }
  },
  firecracker: {
    id: 'firecracker',
    name: '爆竹',
    nameEn: 'Firecracker',
    description: '中国の爆竹。倒すと爆発。',
    descriptionEn: 'Chinese firecracker. Explodes on kill.',
    category: 'onEffect',
    rarity: 'epic',
    effects: {
      onKill: {
        chance: 0.30,
        aoeExplosion: true,
        aoeDamage: 15
      }
    }
  },

  // ========== COUNTER CHIPS (5) ==========
  businessCard: {
    id: 'businessCard',
    name: '名刺',
    nameEn: 'Business Card',
    description: '集めた名刺。倒すたびに強くなる。',
    descriptionEn: 'Collected business cards. Stronger with each kill.',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: {
        trigger: 'onKill',
        bonus: 'damagePercent',
        perStack: 0.5, // +0.5% per kill
        maxStacks: 50  // max 25% bonus
      }
    }
  },
  reportCard: {
    id: 'reportCard',
    name: '通知表',
    nameEn: 'Report Card',
    description: '成績表。状態異常の持続が延びる。',
    descriptionEn: 'A report card. Status effects last longer.',
    category: 'counter',
    rarity: 'epic',
    effects: {
      counter: {
        trigger: 'onStatusInflict',
        statusType: 'defrag',
        bonus: 'statusDuration',
        perStack: 2, // +2% per defrag inflicted
        maxStacks: 15 // max 30%
      }
    }
  },
  baseball: {
    id: 'baseball',
    name: '野球ボール',
    nameEn: 'Baseball',
    description: 'サイン入りボール。クリティカルが強化。',
    descriptionEn: 'Signed baseball. Critical hits get stronger.',
    category: 'counter',
    rarity: 'epic',
    effects: {
      counter: {
        trigger: 'onCrit',
        bonus: 'critDamage',
        perStack: 0.3, // +0.3% per crit
        maxStacks: 100 // max 30%
      }
    }
  },
  trainPass: {
    id: 'trainPass',
    name: '定期券',
    nameEn: 'Train Pass',
    description: '使い古した定期。移動速度アップ。',
    descriptionEn: 'A worn train pass. Movement speed increases.',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: {
        trigger: 'onRoomEnter',
        bonus: 'aspd',
        perStack: 2, // +2% per room
        maxStacks: 10 // max 20%
      }
    }
  },
  stampBook: {
    id: 'stampBook',
    name: 'スタンプ帳',
    nameEn: 'Stamp Book',
    description: '集めたスタンプ。チップが多いほど強化。',
    descriptionEn: 'Collected stamps. Stronger with more chips.',
    category: 'counter',
    rarity: 'legendary',
    effects: {
      counter: {
        trigger: 'onChipCount',
        chipCategory: 'stat',
        bonus: 'allStats',
        perStack: 3, // +3% per STAT chip owned
        maxStacks: 10 // max 30% (10 stat chips)
      }
    }
  },

  // ========== ADDITIONAL STAT CHIPS (40) ==========
  // Office Supplies - INT/DEX focused
  mechanicalPencil: {
    id: 'mechanicalPencil',
    name: 'シャーペン',
    nameEn: 'Mechanical Pencil',
    description: '精密な0.5mmのシャーペン。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { dex: 2, int: 1 } }
  },
  eraser: {
    id: 'eraser',
    name: '消しゴム',
    nameEn: 'Eraser',
    description: 'よく消える消しゴム。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { int: 2 } }
  },
  ruler: {
    id: 'ruler',
    name: '定規',
    nameEn: 'Ruler',
    description: '15cmの透明定規。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { dex: 3 } }
  },
  stapler: {
    id: 'stapler',
    name: 'ホッチキス',
    nameEn: 'Stapler',
    description: 'オフィス用ホッチキス。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { str: 2, dex: 1 } }
  },
  paperClips: {
    id: 'paperClips',
    name: 'クリップ',
    nameEn: 'Paper Clips',
    description: 'カラフルなクリップの束。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { dex: 1, luk: 1 } }
  },
  scissors: {
    id: 'scissors',
    name: 'はさみ',
    nameEn: 'Scissors',
    description: '事務用はさみ。切れ味抜群。',
    category: 'stat',
    rarity: 'uncommon',
    effects: { stats: { str: 2, dex: 2 } }
  },
  notebook: {
    id: 'notebook',
    name: 'ノート',
    nameEn: 'Notebook',
    description: '罫線入りのノート。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { int: 4 } }
  },
  highlighter: {
    id: 'highlighter',
    name: '蛍光ペン',
    nameEn: 'Highlighter',
    description: '黄色い蛍光ペン。重要な部分を強調。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { int: 2, dex: 1 } }
  },
  stickyNotes: {
    id: 'stickyNotes',
    name: '付箋',
    nameEn: 'Sticky Notes',
    description: 'カラフルな付箋。忘れない。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { int: 1, luk: 2 } }
  },
  binder: {
    id: 'binder',
    name: 'バインダー',
    nameEn: 'Binder',
    description: '整理整頓に便利なバインダー。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { int: 3 } }
  },

  // Kitchen Items - STR/VIT focused
  fryingPan: {
    id: 'fryingPan',
    name: 'フライパン',
    nameEn: 'Frying Pan',
    description: '鉄製の重いフライパン。武器にもなる。',
    category: 'stat',
    rarity: 'uncommon',
    effects: { stats: { str: 4, vit: 1 } }
  },
  ladle: {
    id: 'ladle',
    name: 'おたま',
    nameEn: 'Ladle',
    description: '大きなおたま。汁物に便利。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { str: 2, vit: 2 } }
  },
  chopsticks: {
    id: 'chopsticks',
    name: '箸',
    nameEn: 'Chopsticks',
    description: '塗り箸。器用さが上がる。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { dex: 2, agi: 1 } }
  },
  riceCooker: {
    id: 'riceCooker',
    name: '炊飯器',
    nameEn: 'Rice Cooker',
    description: '小型の炊飯器。ご飯で元気。',
    category: 'stat',
    rarity: 'uncommon',
    effects: { stats: { vit: 3, int: 1 } }
  },
  kettle: {
    id: 'kettle',
    name: 'やかん',
    nameEn: 'Kettle',
    description: 'お湯を沸かすやかん。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { vit: 2, int: 1 } }
  },
  cuttingBoard: {
    id: 'cuttingBoard',
    name: 'まな板',
    nameEn: 'Cutting Board',
    description: '木製のまな板。盾としても使える。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { vit: 3 } }
  },
  whisk: {
    id: 'whisk',
    name: '泡立て器',
    nameEn: 'Whisk',
    description: '金属製の泡立て器。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { agi: 2, dex: 1 } }
  },
  spatula: {
    id: 'spatula',
    name: 'フライ返し',
    nameEn: 'Spatula',
    description: 'ステンレスのフライ返し。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { str: 2, agi: 1 } }
  },
  grater: {
    id: 'grater',
    name: 'おろし金',
    nameEn: 'Grater',
    description: '大根おろしに使うおろし金。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { str: 3 } }
  },
  tongs: {
    id: 'tongs',
    name: 'トング',
    nameEn: 'Tongs',
    description: '料理用のトング。挟む力。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { dex: 2, str: 1 } }
  },

  // Cleaning Supplies - VIT/LUK focused
  dustpan: {
    id: 'dustpan',
    name: 'ちりとり',
    nameEn: 'Dustpan',
    description: 'プラスチックのちりとり。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { vit: 2 } }
  },
  mop: {
    id: 'mop',
    name: 'モップ',
    nameEn: 'Mop',
    description: '柄の長いモップ。リーチがある。',
    category: 'stat',
    rarity: 'uncommon',
    effects: { stats: { vit: 3, str: 1 } }
  },
  bucket: {
    id: 'bucket',
    name: 'バケツ',
    nameEn: 'Bucket',
    description: 'プラスチックのバケツ。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { vit: 3 } }
  },
  sponge: {
    id: 'sponge',
    name: 'スポンジ',
    nameEn: 'Sponge',
    description: '黄色いスポンジ。吸収力抜群。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { vit: 2, luk: 1 } }
  },
  sprayBottle: {
    id: 'sprayBottle',
    name: 'スプレー',
    nameEn: 'Spray Bottle',
    description: '霧吹きスプレー。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { dex: 2, agi: 1 } }
  },
  lintRoller: {
    id: 'lintRoller',
    name: 'コロコロ',
    nameEn: 'Lint Roller',
    description: '粘着ローラー。幸運を引き寄せる。',
    category: 'stat',
    rarity: 'uncommon',
    effects: { stats: { dex: 1, luk: 3 } }
  },
  rubberGloves: {
    id: 'rubberGloves',
    name: 'ゴム手袋',
    nameEn: 'Rubber Gloves',
    description: '黄色いゴム手袋。防御力アップ。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { vit: 2, str: 1 } }
  },

  // Fashion Items - AGI/LUK focused
  sunglasses: {
    id: 'sunglasses',
    name: 'サングラス',
    nameEn: 'Sunglasses',
    description: 'クールなサングラス。',
    category: 'stat',
    rarity: 'uncommon',
    effects: { stats: { luk: 2, dex: 1 } }
  },
  watch: {
    id: 'watch',
    name: '腕時計',
    nameEn: 'Wristwatch',
    description: 'デジタル腕時計。時間厳守。',
    category: 'stat',
    rarity: 'uncommon',
    effects: { stats: { dex: 2, int: 2 } }
  },
  belt: {
    id: 'belt',
    name: 'ベルト',
    nameEn: 'Belt',
    description: '革製のベルト。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { str: 2, vit: 1 } }
  },
  scarf: {
    id: 'scarf',
    name: 'マフラー',
    nameEn: 'Scarf',
    description: '暖かいマフラー。冬の必需品。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { vit: 2, luk: 1 } }
  },
  cap: {
    id: 'cap',
    name: 'キャップ',
    nameEn: 'Cap',
    description: '野球帽。日差しを避ける。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { agi: 2, luk: 1 } }
  },
  ring: {
    id: 'ring',
    name: '指輪',
    nameEn: 'Ring',
    description: 'シンプルな指輪。幸運の象徴。',
    category: 'stat',
    rarity: 'uncommon',
    effects: { stats: { luk: 2, int: 1 } }
  },
  bandana: {
    id: 'bandana',
    name: 'バンダナ',
    nameEn: 'Bandana',
    description: '赤いバンダナ。気合が入る。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { agi: 2 } }
  },
  gloves: {
    id: 'gloves',
    name: '手袋',
    nameEn: 'Gloves',
    description: '革の手袋。グリップ力アップ。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { dex: 2, vit: 1 } }
  },

  // Electronics - INT/DEX focused
  earphones: {
    id: 'earphones',
    name: 'イヤホン',
    nameEn: 'Earphones',
    description: 'ワイヤレスイヤホン。集中力アップ。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { int: 2, agi: 1 } }
  },
  powerBank: {
    id: 'powerBank',
    name: 'モバイルバッテリー',
    nameEn: 'Power Bank',
    description: '大容量バッテリー。持久力アップ。',
    category: 'stat',
    rarity: 'uncommon',
    effects: { stats: { vit: 3, int: 1 } }
  },
  usbCable: {
    id: 'usbCable',
    name: 'USBケーブル',
    nameEn: 'USB Cable',
    description: 'Type-Cケーブル。接続力。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { int: 2, dex: 1 } }
  },
  mouse: {
    id: 'mouse',
    name: 'マウス',
    nameEn: 'Mouse',
    description: 'ゲーミングマウス。精度が上がる。',
    category: 'stat',
    rarity: 'uncommon',
    effects: { stats: { dex: 3 } }
  },
  keyboard: {
    id: 'keyboard',
    name: 'キーボード',
    nameEn: 'Keyboard',
    description: 'メカニカルキーボード。入力速度アップ。',
    category: 'stat',
    rarity: 'rare',
    effects: { stats: { int: 3, dex: 2 } }
  },
  flashlight: {
    id: 'flashlight',
    name: '懐中電灯',
    nameEn: 'Flashlight',
    description: 'LEDライト。暗闘でも見える。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { dex: 2, int: 1 } }
  },
  remoteControl: {
    id: 'remoteControl',
    name: 'リモコン',
    nameEn: 'Remote Control',
    description: 'TVリモコン。遠隔操作。',
    category: 'stat',
    rarity: 'common',
    effects: { stats: { int: 2, luk: 1 } }
  },
  sdCard: {
    id: 'sdCard',
    name: 'SDカード',
    nameEn: 'SD Card',
    description: '64GBのSDカード。記憶力アップ。',
    category: 'stat',
    rarity: 'uncommon',
    effects: { stats: { int: 3 } }
  },

  // ========== ADDITIONAL ON_HIT CHIPS (30) ==========
  // Sharp Objects - Defrag
  toothpick: {
    id: 'toothpick',
    name: '爪楊枝',
    nameEn: 'Toothpick',
    description: '先の尖った爪楊枝。',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: { chance: 0.12, status: 'defrag', duration: 1 }
    }
  },
  safetyPin: {
    id: 'safetyPin',
    name: '安全ピン',
    nameEn: 'Safety Pin',
    description: '開いた安全ピン。意外と痛い。',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: { chance: 0.07, status: 'defrag', duration: 4 }
    }
  },
  compass: {
    id: 'compass',
    name: 'コンパス',
    nameEn: 'Drafting Compass',
    description: '製図用コンパス。鋭い先端。',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.15, status: 'defrag', duration: 2 }
    }
  },
  boxCutter: {
    id: 'boxCutter',
    name: 'カッター',
    nameEn: 'Box Cutter',
    description: '鋭いカッターナイフ。',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.10, status: 'defrag', duration: 3, bonusDamage: 5 }
    }
  },
  dart: {
    id: 'dart',
    name: 'ダーツ',
    nameEn: 'Dart',
    description: 'ダーツの矢。的確に刺さる。',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.20, status: 'defrag', duration: 1 }
    }
  },

  // Cold Objects - Lag
  frozenFood: {
    id: 'frozenFood',
    name: '冷凍食品',
    nameEn: 'Frozen Food',
    description: 'カチカチに凍った食品。',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: { chance: 0.08, status: 'lag', duration: 3 }
    }
  },
  iceCream: {
    id: 'iceCream',
    name: 'アイス',
    nameEn: 'Ice Cream',
    description: '溶けかけのアイスクリーム。',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: { chance: 0.12, status: 'lag', duration: 2 }
    }
  },
  coldDrink: {
    id: 'coldDrink',
    name: '冷たい飲み物',
    nameEn: 'Cold Drink',
    description: '氷入りの冷たいドリンク。',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: { chance: 0.07, status: 'lag', duration: 4 }
    }
  },
  popsicle: {
    id: 'popsicle',
    name: 'アイスキャンディー',
    nameEn: 'Popsicle',
    description: '棒付きのアイス。ガリガリ君。',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.15, status: 'lag', duration: 2 }
    }
  },

  // Heavy Objects - Buffer Overflow
  paperweight: {
    id: 'paperweight',
    name: '文鎮',
    nameEn: 'Paperweight',
    description: '重い文鎮。頭に当たると痛い。',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.05, status: 'bufferOverflow', duration: 1 }
    }
  },
  brick: {
    id: 'brick',
    name: 'レンガ',
    nameEn: 'Brick',
    description: '赤いレンガ。重くて硬い。',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.06, status: 'bufferOverflow', duration: 2 }
    }
  },
  castIronPan: {
    id: 'castIronPan',
    name: '鉄鍋',
    nameEn: 'Cast Iron Pan',
    description: '重い鋳鉄の鍋。一撃必殺。',
    category: 'onHit',
    rarity: 'rare',
    effects: {
      onHit: { chance: 0.07, status: 'bufferOverflow', duration: 2 }
    }
  },
  bowlingBall: {
    id: 'bowlingBall',
    name: 'ボウリング球',
    nameEn: 'Bowling Ball',
    description: '14ポンドのボウリング球。',
    category: 'onHit',
    rarity: 'rare',
    effects: {
      onHit: { chance: 0.12, status: 'bufferOverflow', duration: 1 }
    }
  },
  textbook: {
    id: 'textbook',
    name: '教科書',
    nameEn: 'Textbook',
    description: '分厚い数学の教科書。',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: { chance: 0.05, status: 'bufferOverflow', duration: 1 }
    }
  },

  // Liquid Objects - Corrupted
  perfume: {
    id: 'perfume',
    name: '香水',
    nameEn: 'Perfume',
    description: '強い香りの香水。感覚を狂わせる。',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.08, status: 'corrupted', duration: 4 }
    }
  },
  bugSpray: {
    id: 'bugSpray',
    name: '殺虫剤',
    nameEn: 'Bug Spray',
    description: '強力な殺虫スプレー。',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.12, status: 'corrupted', duration: 2 }
    }
  },
  deodorant: {
    id: 'deodorant',
    name: 'デオドラント',
    nameEn: 'Deodorant',
    description: '制汗スプレー。目にしみる。',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: { chance: 0.07, status: 'corrupted', duration: 3 }
    }
  },
  hairSpray: {
    id: 'hairSpray',
    name: 'ヘアスプレー',
    nameEn: 'Hair Spray',
    description: '髪型を固めるスプレー。',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.10, status: 'corrupted', duration: 2 }
    }
  },
  sauce: {
    id: 'sauce',
    name: 'ソース',
    nameEn: 'Sauce',
    description: 'ウスターソース。目に入ると痛い。',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: { chance: 0.15, status: 'corrupted', duration: 1 }
    }
  },

  // Reflective Objects - Exposed
  cameraFlash: {
    id: 'cameraFlash',
    name: 'カメラフラッシュ',
    nameEn: 'Camera Flash',
    description: '眩しいフラッシュ。目がくらむ。',
    category: 'onHit',
    rarity: 'rare',
    effects: {
      onHit: { chance: 0.15, status: 'exposed', duration: 2 }
    }
  },
  discoBall: {
    id: 'discoBall',
    name: 'ミラーボール',
    nameEn: 'Disco Ball',
    description: '小型のミラーボール。乱反射。',
    category: 'onHit',
    rarity: 'rare',
    effects: {
      onHit: { chance: 0.08, status: 'exposed', duration: 4 }
    }
  },
  aluminumFoil: {
    id: 'aluminumFoil',
    name: 'アルミホイル',
    nameEn: 'Aluminum Foil',
    description: '光を反射するアルミホイル。',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: { chance: 0.12, status: 'exposed', duration: 2 }
    }
  },
  cd: {
    id: 'cd',
    name: 'CD',
    nameEn: 'CD',
    description: '虹色に光るCD。投げると危険。',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.10, status: 'exposed', duration: 2 }
    }
  },
  phoneScreen: {
    id: 'phoneScreen',
    name: 'スマホ画面',
    nameEn: 'Phone Screen',
    description: '明るいスマホの画面。',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: { chance: 0.08, status: 'exposed', duration: 3 }
    }
  },

  // Hot Objects - Overheated (stacking)
  curlingIron: {
    id: 'curlingIron',
    name: 'ヘアアイロン',
    nameEn: 'Curling Iron',
    description: '熱いヘアアイロン。火傷注意。',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.10, status: 'overheated', duration: 1 }
    }
  },
  hotCoffee: {
    id: 'hotCoffee',
    name: '熱いコーヒー',
    nameEn: 'Hot Coffee',
    description: '淹れたてのコーヒー。熱々。',
    category: 'onHit',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.08, status: 'overheated', duration: 2 }
    }
  },
  handWarmer: {
    id: 'handWarmer',
    name: 'カイロ',
    nameEn: 'Hand Warmer',
    description: '使い捨てカイロ。じわじわ熱い。',
    category: 'onHit',
    rarity: 'common',
    effects: {
      onHit: { chance: 0.10, status: 'overheated', duration: 1 }
    }
  },
  solderingIron: {
    id: 'solderingIron',
    name: 'はんだごて',
    nameEn: 'Soldering Iron',
    description: '高温のはんだごて。触ると火傷。',
    category: 'onHit',
    rarity: 'rare',
    effects: {
      onHit: { chance: 0.12, status: 'overheated', duration: 2 }
    }
  },
  hotPot: {
    id: 'hotPot',
    name: '熱い鍋',
    nameEn: 'Hot Pot',
    description: '煮えたぎる鍋。中身をぶちまける。',
    category: 'onHit',
    rarity: 'rare',
    effects: {
      onHit: { chance: 0.07, status: 'overheated', duration: 3 }
    }
  },

  // ========== ADDITIONAL ON_EFFECT CHIPS (35) ==========
  // Food - Healing
  bento: {
    id: 'bento',
    name: '弁当',
    nameEn: 'Bento',
    description: '手作り弁当。倒すと大回復。',
    category: 'onEffect',
    rarity: 'rare',
    effects: {
      onKill: { chance: 0.20, heal: 25 }
    }
  },
  candy: {
    id: 'candy',
    name: '飴',
    nameEn: 'Candy',
    description: '甘い飴。クリティカルで回復。',
    category: 'onEffect',
    rarity: 'common',
    effects: {
      onCrit: { chance: 0.15, heal: 5 }
    }
  },
  bread: {
    id: 'bread',
    name: 'パン',
    nameEn: 'Bread',
    description: '食パン。ダメージを受けると回復。',
    category: 'onEffect',
    rarity: 'uncommon',
    effects: {
      onDamage: { chance: 0.10, heal: 8 }
    }
  },
  banana: {
    id: 'banana',
    name: 'バナナ',
    nameEn: 'Banana',
    description: '栄養満点のバナナ。',
    category: 'onEffect',
    rarity: 'uncommon',
    effects: {
      onStatusInflict: { chance: 0.25, heal: 15, statusType: 'defrag' }
    }
  },
  chocolate: {
    id: 'chocolate',
    name: 'チョコレート',
    nameEn: 'Chocolate',
    description: '甘いチョコ。スタンさせると回復。',
    category: 'onEffect',
    rarity: 'uncommon',
    effects: {
      onStatusInflict: { chance: 0.20, heal: 10, statusType: 'bufferOverflow' }
    }
  },
  mochi: {
    id: 'mochi',
    name: '餅',
    nameEn: 'Mochi',
    description: 'もちもちの餅。大回復の可能性。',
    category: 'onEffect',
    rarity: 'rare',
    effects: {
      onKill: { chance: 0.15, heal: 30 }
    }
  },
  apple: {
    id: 'apple',
    name: 'りんご',
    nameEn: 'Apple',
    description: '赤いりんご。部屋に入ると少し回復。',
    category: 'onEffect',
    rarity: 'common',
    effects: {
      onRoomEnter: { chance: 0.10, heal: 5 }
    }
  },
  cupRamen: {
    id: 'cupRamen',
    name: 'カップ麺',
    nameEn: 'Cup Ramen',
    description: '定番のカップ麺。回復効果アップ。',
    category: 'onEffect',
    rarity: 'uncommon',
    effects: {
      onHeal: { chance: 0.25, bonusHeal: 10 }
    }
  },

  // Drinks - Buffs
  coffee: {
    id: 'coffee',
    name: 'コーヒー',
    nameEn: 'Coffee',
    description: '濃いコーヒー。ダメージで攻撃力アップ。',
    category: 'onEffect',
    rarity: 'uncommon',
    effects: {
      onDamage: { chance: 0.15, buff: 'attack', value: 0.15, duration: 3000 }
    }
  },
  greenTea: {
    id: 'greenTea',
    name: '緑茶',
    nameEn: 'Green Tea',
    description: '落ち着く緑茶。クリティカル時に強化。',
    category: 'onEffect',
    rarity: 'rare',
    effects: {
      onCrit: { chance: 0.10, buff: 'critRate', value: 0.20, duration: 5000 }
    }
  },
  sportsDrink: {
    id: 'sportsDrink',
    name: 'スポーツドリンク',
    nameEn: 'Sports Drink',
    description: '電解質補給。回避時に加速。',
    category: 'onEffect',
    rarity: 'uncommon',
    effects: {
      onDodge: { chance: 0.25, buff: 'speed', value: 0.10, duration: 3000 }
    }
  },
  milk: {
    id: 'milk',
    name: '牛乳',
    nameEn: 'Milk',
    description: '新鮮な牛乳。回復時にVITアップ。',
    category: 'onEffect',
    rarity: 'uncommon',
    effects: {
      onHeal: { chance: 0.30, buff: 'vit', value: 10, duration: 10000 }
    }
  },
  sake: {
    id: 'sake',
    name: '日本酒',
    nameEn: 'Sake',
    description: '辛口の日本酒。攻撃力大幅アップ、命中ダウン。',
    category: 'onEffect',
    rarity: 'epic',
    effects: {
      onKill: { chance: 0.10, buff: 'damage', value: 0.25, duration: 5000 }
    }
  },
  ramune: {
    id: 'ramune',
    name: 'ラムネ',
    nameEn: 'Ramune',
    description: '夏の定番ラムネ。部屋全体で強化。',
    category: 'onEffect',
    rarity: 'rare',
    effects: {
      onRoomEnter: { chance: 0.15, buff: 'allStats', value: 0.05, duration: 30000 }
    }
  },

  // Lucky Items - Drops/Special
  lotteryTicket: {
    id: 'lotteryTicket',
    name: '宝くじ',
    nameEn: 'Lottery Ticket',
    description: 'まだ当選確認してない宝くじ。',
    category: 'onEffect',
    rarity: 'epic',
    effects: {
      onRoomEnter: { chance: 0.05, rareSpawn: true }
    }
  },
  fortuneSlip: {
    id: 'fortuneSlip',
    name: 'おみくじ',
    nameEn: 'Fortune Slip',
    description: '大吉のおみくじ。報酬アップ。',
    category: 'onEffect',
    rarity: 'uncommon',
    effects: {
      onKill: { chance: 0.10, bonusCurrency: 0.25 }
    }
  },
  daruma: {
    id: 'daruma',
    name: 'だるま',
    nameEn: 'Daruma',
    description: '目を入れただるま。ピンチで生き残る。',
    category: 'onEffect',
    rarity: 'legendary',
    effects: {
      onLowHp: { chance: 0.25, surviveWithOneHp: true }
    }
  },
  manekiNeko: {
    id: 'manekiNeko',
    name: '招き猫',
    nameEn: 'Lucky Cat',
    description: '福を呼ぶ招き猫。ドロップ率アップ。',
    category: 'onEffect',
    rarity: 'epic',
    effects: {
      onKill: { chance: 0.20, extraChipDrop: true }
    }
  },
  pachinkoBall: {
    id: 'pachinkoBall',
    name: 'パチンコ玉',
    nameEn: 'Pachinko Ball',
    description: '連続ヒットの可能性。',
    category: 'onEffect',
    rarity: 'rare',
    effects: {
      onHit: { chance: 0.05, cascade: true }
    }
  },
  dice: {
    id: 'dice',
    name: 'サイコロ',
    nameEn: 'Dice',
    description: 'ラッキーダイス。効果が再発動することも。',
    category: 'onEffect',
    rarity: 'epic',
    effects: {
      onEffectTrigger: { chance: 0.10, retrigger: true }
    }
  },

  // Protective Items
  kneePads: {
    id: 'kneePads',
    name: '膝パッド',
    nameEn: 'Knee Pads',
    description: '膝を守るパッド。回避時に反撃。',
    category: 'onEffect',
    rarity: 'rare',
    effects: {
      onDodge: { chance: 0.15, counterAttack: true }
    }
  },
  bubbleWrap: {
    id: 'bubbleWrap',
    name: 'プチプチ',
    nameEn: 'Bubble Wrap',
    description: '衝撃吸収材。ダメージ無効化の可能性。',
    category: 'onEffect',
    rarity: 'rare',
    effects: {
      onDamage: { chance: 0.10, negateDamage: true }
    }
  },
  cardboard: {
    id: 'cardboard',
    name: 'ダンボール',
    nameEn: 'Cardboard Box',
    description: '身を隠せるダンボール。ステルス効果。',
    category: 'onEffect',
    rarity: 'epic',
    effects: {
      onRoomEnter: { chance: 0.25, stealth: true }
    }
  },
  pillow: {
    id: 'pillow',
    name: '枕',
    nameEn: 'Pillow',
    description: 'ふかふかの枕。ダメージ軽減。',
    category: 'onEffect',
    rarity: 'uncommon',
    effects: {
      onDamage: { chance: 0.15, damageReduction: 0.30 }
    }
  },
  cushion: {
    id: 'cushion',
    name: 'クッション',
    nameEn: 'Cushion',
    description: '座布団クッション。ピンチでシールド。',
    category: 'onEffect',
    rarity: 'rare',
    effects: {
      onLowHp: { chance: 0.20, shield: 20 }
    }
  },

  // Offensive Items
  rubberBand: {
    id: 'rubberBand',
    name: '輪ゴム',
    nameEn: 'Rubber Band',
    description: '伸びる輪ゴム。クリティカルで追撃。',
    category: 'onEffect',
    rarity: 'uncommon',
    effects: {
      onCrit: { chance: 0.25, bonusHit: true }
    }
  },
  pepper: {
    id: 'pepper',
    name: 'コショウ',
    nameEn: 'Pepper',
    description: '黒コショウ。敵がくしゃみ。',
    category: 'onEffect',
    rarity: 'uncommon',
    effects: {
      onHit: { chance: 0.10, enemyMissNextTurn: true }
    }
  },
  wasabi: {
    id: 'wasabi',
    name: 'わさび',
    nameEn: 'Wasabi',
    description: '鼻にツーンとくるわさび。クリダメ倍。',
    category: 'onEffect',
    rarity: 'epic',
    effects: {
      onCrit: { chance: 0.15, doubleCritDamage: true }
    }
  },
  partyPopper: {
    id: 'partyPopper',
    name: 'クラッカー',
    nameEn: 'Party Popper',
    description: 'お祝いクラッカー。スタン延長。',
    category: 'onEffect',
    rarity: 'rare',
    effects: {
      onStatusInflict: { chance: 0.40, extendStun: 1000, statusType: 'bufferOverflow' }
    }
  },
  airHorn: {
    id: 'airHorn',
    name: 'エアホーン',
    nameEn: 'Air Horn',
    description: '大音量のエアホーン。全敵スタン。',
    category: 'onEffect',
    rarity: 'legendary',
    effects: {
      onRoomEnter: { chance: 0.05, stunAllEnemies: 1000 }
    }
  },

  // ========== ADDITIONAL COUNTER CHIPS (25) ==========
  // Work Items - Per Kill
  timecard: {
    id: 'timecard',
    name: 'タイムカード',
    nameEn: 'Time Card',
    description: '出勤記録。倒すたびに強くなる。',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: { trigger: 'onKill', bonus: 'str', perStack: 1, maxStacks: 10 }
    }
  },
  stamp: {
    id: 'stamp',
    name: '印鑑',
    nameEn: 'Stamp',
    description: '認印。クリティカル率アップ。',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: { trigger: 'onKill', bonus: 'critChance', perStack: 0.3, maxStacks: 50 }
    }
  },
  briefcase: {
    id: 'briefcase',
    name: 'ブリーフケース',
    nameEn: 'Briefcase',
    description: '革のブリーフケース。総合力アップ。',
    category: 'counter',
    rarity: 'epic',
    effects: {
      counter: { trigger: 'onKill', bonus: 'allStats', perStack: 0.2, maxStacks: 50 }
    }
  },
  necktie: {
    id: 'necktie',
    name: 'ネクタイ',
    nameEn: 'Necktie',
    description: 'シルクのネクタイ。攻撃速度アップ。',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: { trigger: 'onKill', bonus: 'aspd', perStack: 1, maxStacks: 15 }
    }
  },
  idBadge: {
    id: 'idBadge',
    name: '社員証',
    nameEn: 'ID Badge',
    description: '会社の社員証。DEXアップ。',
    category: 'counter',
    rarity: 'uncommon',
    effects: {
      counter: { trigger: 'onKill', bonus: 'dex', perStack: 1, maxStacks: 12 }
    }
  },
  coffeeMug: {
    id: 'coffeeMug',
    name: 'コーヒーマグ',
    nameEn: 'Coffee Mug',
    description: 'マイカップ。最大HPアップ。',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: { trigger: 'onKill', bonus: 'maxHp', perStack: 2, maxStacks: 50 }
    }
  },

  // School Items - Per Status
  homework: {
    id: 'homework',
    name: '宿題',
    nameEn: 'Homework',
    description: '終わらない宿題。状態異常確率アップ。',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: { trigger: 'onStatusInflict', bonus: 'statusChance', perStack: 1, maxStacks: 20 }
    }
  },
  schoolBadge: {
    id: 'schoolBadge',
    name: '校章',
    nameEn: 'School Badge',
    description: '学校のバッジ。INTアップ。',
    category: 'counter',
    rarity: 'uncommon',
    effects: {
      counter: { trigger: 'onStatusInflict', bonus: 'int', perStack: 1, maxStacks: 15 }
    }
  },
  gymUniform: {
    id: 'gymUniform',
    name: '体操着',
    nameEn: 'Gym Uniform',
    description: '学校指定の体操着。回避率アップ。',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: { trigger: 'onStatusInflict', bonus: 'dodge', perStack: 0.5, maxStacks: 20 }
    }
  },
  pencilCase: {
    id: 'pencilCase',
    name: '筆箱',
    nameEn: 'Pencil Case',
    description: '文房具が入った筆箱。ダメージアップ。',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: { trigger: 'onStatusInflict', bonus: 'damagePercent', perStack: 1, maxStacks: 10 }
    }
  },

  // Sports Items - Per Crit
  tennisBall: {
    id: 'tennisBall',
    name: 'テニスボール',
    nameEn: 'Tennis Ball',
    description: '黄色いテニスボール。クリ率アップ。',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: { trigger: 'onCrit', bonus: 'critChance', perStack: 0.2, maxStacks: 50 }
    }
  },
  soccerBall: {
    id: 'soccerBall',
    name: 'サッカーボール',
    nameEn: 'Soccer Ball',
    description: 'サッカーボール。STRアップ。',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: { trigger: 'onCrit', bonus: 'str', perStack: 1, maxStacks: 10 }
    }
  },
  basketball: {
    id: 'basketball',
    name: 'バスケットボール',
    nameEn: 'Basketball',
    description: 'オレンジのバスケットボール。攻撃速度アップ。',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: { trigger: 'onCrit', bonus: 'aspd', perStack: 0.5, maxStacks: 30 }
    }
  },
  golfBall: {
    id: 'golfBall',
    name: 'ゴルフボール',
    nameEn: 'Golf Ball',
    description: '白いゴルフボール。固定ダメージアップ。',
    category: 'counter',
    rarity: 'epic',
    effects: {
      counter: { trigger: 'onCrit', bonus: 'flatDamage', perStack: 2, maxStacks: 10 }
    }
  },
  shuttlecock: {
    id: 'shuttlecock',
    name: 'シャトル',
    nameEn: 'Shuttlecock',
    description: 'バドミントンのシャトル。回避率アップ。',
    category: 'counter',
    rarity: 'uncommon',
    effects: {
      counter: { trigger: 'onCrit', bonus: 'dodge', perStack: 0.4, maxStacks: 20 }
    }
  },
  jumpRope: {
    id: 'jumpRope',
    name: '縄跳び',
    nameEn: 'Jump Rope',
    description: 'カラフルな縄跳び。AGIアップ。',
    category: 'counter',
    rarity: 'uncommon',
    effects: {
      counter: { trigger: 'onCrit', bonus: 'agi', perStack: 1, maxStacks: 10 }
    }
  },

  // Travel Items - Per Room
  map: {
    id: 'map',
    name: '地図',
    nameEn: 'Map',
    description: '東京の地図。アイテム発見率アップ。',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: { trigger: 'onRoomEnter', bonus: 'itemFind', perStack: 1, maxStacks: 15 }
    }
  },
  compassNav: {
    id: 'compassNav',
    name: '方位磁石',
    nameEn: 'Compass',
    description: '方角を示すコンパス。LUKアップ。',
    category: 'counter',
    rarity: 'uncommon',
    effects: {
      counter: { trigger: 'onRoomEnter', bonus: 'luk', perStack: 1, maxStacks: 10 }
    }
  },
  luggage: {
    id: 'luggage',
    name: 'スーツケース',
    nameEn: 'Luggage',
    description: '旅行用スーツケース。インベントリ拡大。',
    category: 'counter',
    rarity: 'legendary',
    effects: {
      counter: { trigger: 'onRoomEnter', bonus: 'inventorySlots', perStack: 1, maxStacks: 3 }
    }
  },
  passport: {
    id: 'passport',
    name: 'パスポート',
    nameEn: 'Passport',
    description: '日本国パスポート。報酬アップ。',
    category: 'counter',
    rarity: 'epic',
    effects: {
      counter: { trigger: 'onRoomEnter', bonus: 'currencyGain', perStack: 3, maxStacks: 10 }
    }
  },
  travelPillow: {
    id: 'travelPillow',
    name: 'ネックピロー',
    nameEn: 'Travel Pillow',
    description: '首用の枕。部屋ごとに少し回復。',
    category: 'counter',
    rarity: 'rare',
    effects: {
      counter: { trigger: 'onRoomEnter', bonus: 'healAtRoomStart', perStack: 5, maxStacks: 1 }
    }
  },
  guidebook: {
    id: 'guidebook',
    name: 'ガイドブック',
    nameEn: 'Guidebook',
    description: '東京ガイドブック。ダメージアップ。',
    category: 'counter',
    rarity: 'epic',
    effects: {
      counter: { trigger: 'onRoomEnter', bonus: 'damagePercent', perStack: 2, maxStacks: 10 }
    }
  },

  // Collection Items - Per Chip Count
  album: {
    id: 'album',
    name: 'アルバム',
    nameEn: 'Album',
    description: '写真アルバム。ON_HITチップで発動率アップ。',
    category: 'counter',
    rarity: 'legendary',
    effects: {
      counter: { trigger: 'onChipCount', chipCategory: 'onHit', bonus: 'triggerChance', perStack: 5, maxStacks: 10 }
    }
  },
  tradingCards: {
    id: 'tradingCards',
    name: 'トレカ',
    nameEn: 'Trading Cards',
    description: 'レアカードコレクション。ON_EFFECTが強化。',
    category: 'counter',
    rarity: 'legendary',
    effects: {
      counter: { trigger: 'onChipCount', chipCategory: 'onEffect', bonus: 'effectPotency', perStack: 4, maxStacks: 10 }
    }
  },
  gachaFigure: {
    id: 'gachaFigure',
    name: 'ガチャフィギュア',
    nameEn: 'Gacha Figure',
    description: 'カプセルトイ。チップ種類で総合強化。',
    category: 'counter',
    rarity: 'legendary',
    effects: {
      counter: { trigger: 'onUniqueChipType', bonus: 'allStats', perStack: 1, maxStacks: 4 }
    }
  }
};

// ============ HELPER FUNCTIONS ============

/**
 * Get chip by ID
 */
export function getChip(chipId) {
  // First try direct lookup (for base chips)
  if (CHIPS[chipId]) {
    return CHIPS[chipId];
  }

  // Handle rarity-suffixed IDs (e.g., "ballpointPen_rare")
  // Extract base ID and return base chip info (caller should use player inventory for scaled version)
  const parts = chipId.split('_');
  if (parts.length >= 2) {
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const lastPart = parts[parts.length - 1];
    if (rarities.includes(lastPart)) {
      const baseId = parts.slice(0, -1).join('_');
      return CHIPS[baseId] || null;
    }
  }

  return null;
}

/**
 * Get a chip from player's inventory by ID
 * This returns the full chip object with scaled effects for rarity-suffixed chips
 */
export function getChipFromInventory(player, chipId) {
  if (!player?.chips) return null;
  return player.chips.find(c => c.id === chipId) || null;
}

/**
 * Get all chips of a category
 */
export function getChipsByCategory(category) {
  return Object.values(CHIPS).filter(chip => chip.category === category);
}

/**
 * Get all chips of a rarity
 */
export function getChipsByRarity(rarity) {
  return Object.values(CHIPS).filter(chip => chip.rarity === rarity);
}

/**
 * Get chip price based on rarity
 * Handles both base chip IDs and rarity-suffixed IDs (e.g., "ballpointPen_rare")
 */
export function getChipPrice(chipId) {
  // Check if it's a rarity-suffixed ID
  const parts = chipId.split('_');
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const lastPart = parts[parts.length - 1];

  if (parts.length >= 2 && rarities.includes(lastPart)) {
    // Use the rarity from the ID
    const rarity = CHIP_RARITIES[lastPart];
    return Math.floor(BASE_CHIP_PRICE * rarity.priceMultiplier);
  }

  // Fallback to base chip lookup
  const chip = getChip(chipId);
  if (!chip) return 0;

  const rarity = CHIP_RARITIES[chip.rarity];
  return Math.floor(BASE_CHIP_PRICE * rarity.priceMultiplier);
}

// ============ CHIP UPGRADE FUNCTIONS ============

/**
 * Get the next rarity tier
 * @param {string} currentRarity - Current rarity
 * @returns {string|null} Next rarity or null if already legendary
 */
export function getNextRarity(currentRarity) {
  const order = CHIP_UPGRADE_CONFIG.rarityOrder;
  const currentIndex = order.indexOf(currentRarity);
  if (currentIndex === -1 || currentIndex >= order.length - 1) {
    return null; // Invalid or already legendary
  }
  return order[currentIndex + 1];
}

/**
 * Get the cost to upgrade a chip
 * @param {object} chip - Chip object with rarity
 * @returns {number} Upgrade cost in credits
 */
export function getUpgradeCost(chip) {
  const rarity = chip.rarity || 'common';
  return CHIP_UPGRADE_CONFIG.getUpgradeCost(rarity);
}

/**
 * Get the failure chance for upgrading a chip
 * @param {object} chip - Chip object with rarity
 * @param {number} floorBonus - Optional bonus from floor (reduces failure chance)
 * @returns {number} Failure chance (0-1)
 */
export function getUpgradeFailureChance(chip, floorBonus = 0) {
  const rarity = chip.rarity || 'common';
  const baseFailure = CHIP_UPGRADE_CONFIG.failureRates[rarity] || 0;
  // Floor bonus reduces failure chance
  return Math.max(0, baseFailure - floorBonus);
}

/**
 * Create an upgraded version of a chip
 * @param {object} chip - Original chip from player inventory
 * @param {string} newRarity - Target rarity
 * @returns {object} New chip with upgraded rarity and scaled effects
 */
export function createUpgradedChip(chip, newRarity) {
  // Get base chip definition
  const baseId = chip.baseId || chip.id.split('_')[0];
  const baseChip = CHIPS[baseId];
  if (!baseChip) {
    throw new Error(`Base chip not found: ${baseId}`);
  }

  const rarityInfo = CHIP_RARITIES[newRarity];
  const scaledEffects = applyRarityMultiplier(baseChip.effects, rarityInfo.statMultiplier);

  return {
    id: `${baseId}_${newRarity}`,
    baseId: baseId,
    name: baseChip.name,
    nameEn: baseChip.nameEn,
    category: baseChip.category,
    rarity: newRarity,
    description: baseChip.description,
    effects: scaledEffects,
    baseEffects: baseChip.effects
  };
}

/**
 * Attempt to upgrade a chip (roll for success/failure)
 * @param {object} chip - Chip to upgrade
 * @param {number} floorBonus - Optional floor bonus reducing failure chance
 * @returns {object} { success: boolean, upgradedChip?: object }
 */
export function attemptChipUpgrade(chip, floorBonus = 0) {
  const nextRarity = getNextRarity(chip.rarity);
  if (!nextRarity) {
    return { success: false, reason: 'already_max' };
  }

  const failureChance = getUpgradeFailureChance(chip, floorBonus);
  const roll = Math.random();

  if (roll < failureChance) {
    // Upgrade failed - chip destroyed
    return { success: false, reason: 'failed', failureChance };
  }

  // Success - create upgraded chip
  const upgradedChip = createUpgradedChip(chip, nextRarity);
  return { success: true, upgradedChip, previousRarity: chip.rarity, newRarity: nextRarity };
}

/**
 * Rarity weights for shop generation
 * Higher weight = more likely to appear
 */
const RARITY_WEIGHTS = {
  common: 50,      // Most likely
  uncommon: 30,
  rare: 12,
  epic: 6,
  legendary: 2     // Least likely
};

/**
 * Roll a random rarity based on weights
 * @returns {string} Rarity id
 */
function rollRandomRarity() {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;

  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    roll -= weight;
    if (roll <= 0) {
      return rarity;
    }
  }
  return 'common'; // Fallback
}

/**
 * Apply rarity multiplier to chip effects
 * Handles all effect types: stats, onHit, onKill, onDamage, onDodge, onCrit,
 * onHeal, onLowHp, onRoomEnter, onStatusInflict, onEffectTrigger, counter
 * @param {object} effects - Base chip effects
 * @param {number} multiplier - Rarity stat multiplier
 * @returns {object} Scaled effects
 */
function applyRarityMultiplier(effects, multiplier) {
  const scaled = {};

  // Helper to scale common numeric fields in an effect object
  const scaleEffect = (effect) => {
    const s = { ...effect };
    // Scale chance (cap at reasonable values)
    if (s.chance !== undefined) s.chance = Math.min(s.chance * multiplier, 0.8);
    // Scale numeric values
    if (s.heal !== undefined) s.heal = Math.floor(s.heal * multiplier);
    if (s.healPercent !== undefined) s.healPercent = s.healPercent * multiplier;
    if (s.bonusDamage !== undefined) s.bonusDamage = Math.floor(s.bonusDamage * multiplier);
    if (s.damage !== undefined) s.damage = Math.floor(s.damage * multiplier);
    if (s.aoeDamage !== undefined) s.aoeDamage = Math.floor(s.aoeDamage * multiplier);
    if (s.value !== undefined) s.value = s.value * multiplier;
    if (s.damageReduction !== undefined) s.damageReduction = Math.min(s.damageReduction * multiplier, 0.5);
    if (s.damageBonus !== undefined) s.damageBonus = s.damageBonus * multiplier;
    if (s.critBonus !== undefined) s.critBonus = s.critBonus * multiplier;
    if (s.defenseBonus !== undefined) s.defenseBonus = s.defenseBonus * multiplier;
    if (s.goldBonus !== undefined) s.goldBonus = s.goldBonus * multiplier;
    if (s.xpBonus !== undefined) s.xpBonus = s.xpBonus * multiplier;
    return s;
  };

  // Scale stat bonuses
  if (effects.stats) {
    scaled.stats = {};
    for (const [stat, value] of Object.entries(effects.stats)) {
      scaled.stats[stat] = Math.floor(value * multiplier);
    }
  }

  // Scale all trigger-based effects
  if (effects.onHit) scaled.onHit = scaleEffect(effects.onHit);
  if (effects.onKill) scaled.onKill = scaleEffect(effects.onKill);
  if (effects.onDamage) scaled.onDamage = scaleEffect(effects.onDamage);
  if (effects.onDodge) scaled.onDodge = scaleEffect(effects.onDodge);
  if (effects.onCrit) scaled.onCrit = scaleEffect(effects.onCrit);
  if (effects.onHeal) scaled.onHeal = scaleEffect(effects.onHeal);
  if (effects.onLowHp) scaled.onLowHp = scaleEffect(effects.onLowHp);
  if (effects.onRoomEnter) scaled.onRoomEnter = scaleEffect(effects.onRoomEnter);
  if (effects.onStatusInflict) scaled.onStatusInflict = scaleEffect(effects.onStatusInflict);
  if (effects.onEffectTrigger) scaled.onEffectTrigger = scaleEffect(effects.onEffectTrigger);

  // Scale counter effects
  if (effects.counter) {
    scaled.counter = { ...effects.counter };
    if (scaled.counter.bonusPerStack) scaled.counter.bonusPerStack = effects.counter.bonusPerStack * multiplier;
    if (scaled.counter.perStack) scaled.counter.perStack = effects.counter.perStack * multiplier;
    if (scaled.counter.maxBonus) scaled.counter.maxBonus = effects.counter.maxBonus * multiplier;
  }

  return scaled;
}

/**
 * Generate random chips for post-combat shop
 * All rarities available from any floor, weighted toward common
 * Each chip gets a randomly assigned rarity with scaled stats
 * @param {number} floor - Current floor (unused now, kept for API compatibility)
 * @param {array} ownedChipIds - IDs of chips player already owns
 * @param {number} count - Number of chips to generate (default 3)
 */
export function generateShopChips(floor, ownedChipIds = [], count = 3) {
  // Get all base chips (we'll assign rarity randomly)
  // Filter out chips player already owns (by base ID)
  const ownedBaseIds = ownedChipIds.map(id => id.split('_')[0]);
  const availableChips = Object.values(CHIPS).filter(chip =>
    !ownedBaseIds.includes(chip.id)
  );

  if (availableChips.length === 0) {
    return []; // No chips available
  }

  // Shuffle and pick base chips
  const shuffled = [...availableChips].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  // Assign random rarity to each chip and scale effects
  return selected.map(chip => {
    const rolledRarity = rollRandomRarity();
    const rarityInfo = CHIP_RARITIES[rolledRarity];
    const scaledEffects = applyRarityMultiplier(chip.effects, rarityInfo.statMultiplier);

    // Generate unique ID for this rarity version
    const uniqueId = `${chip.id}_${rolledRarity}`;

    return {
      id: uniqueId,
      baseId: chip.id,
      name: chip.name,
      nameEn: chip.nameEn,
      description: chip.description,
      category: chip.category,
      rarity: rolledRarity,
      price: Math.floor(BASE_CHIP_PRICE * rarityInfo.priceMultiplier),
      effects: scaledEffects,
      baseEffects: chip.effects  // Keep original for reference
    };
  });
}

/**
 * Calculate total stat bonuses from owned chips
 * @param {array} chips - Array of chip objects owned by player
 */
export function calculateChipStatBonuses(chips) {
  const bonuses = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };

  for (const chip of chips) {
    if (chip.category === 'stat' && chip.effects?.stats) {
      for (const [stat, value] of Object.entries(chip.effects.stats)) {
        if (bonuses.hasOwnProperty(stat)) {
          bonuses[stat] += value;
        }
      }
    }
  }

  return bonuses;
}

/**
 * Process on-hit chip effects
 * @param {array} chips - Array of chip objects
 * @param {object} target - The enemy being hit
 * @returns {array} Array of triggered effects
 */
export function processOnHitChips(chips, target) {
  const triggered = [];

  for (const chip of chips) {
    if (chip.category === 'onHit' && chip.effects?.onHit) {
      const effect = chip.effects.onHit;
      if (Math.random() < effect.chance) {
        triggered.push({
          chipId: chip.id,
          chipName: chip.name,
          status: effect.status,
          duration: effect.duration,
          bonusDamage: effect.bonusDamage || 0
        });
      }
    }
  }

  return triggered;
}

/**
 * Process on-kill chip effects
 * @param {array} chips - Array of chip objects
 * @returns {object} Combined effects from all triggered chips
 */
export function processOnKillChips(chips) {
  const effects = {
    heal: 0,
    aspdBoost: 0,
    aspdDuration: 0,
    doubleCredits: false,
    aoeExplosion: false,
    aoeDamage: 0,
    buffs: [],
    bonusCurrency: 0,
    extraChipDrop: false
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onKill) {
      const effect = chip.effects.onKill;
      if (Math.random() < effect.chance) {
        if (effect.heal) effects.heal += effect.heal;
        if (effect.aspdBoost) {
          effects.aspdBoost += effect.aspdBoost;
          effects.aspdDuration = Math.max(effects.aspdDuration, effect.duration || 0);
        }
        if (effect.doubleCredits) effects.doubleCredits = true;
        if (effect.aoeExplosion) {
          effects.aoeExplosion = true;
          effects.aoeDamage += effect.aoeDamage || 0;
        }
        if (effect.buff) {
          effects.buffs.push({
            chipId: chip.id,
            chipName: chip.name,
            buff: effect.buff,
            value: effect.value,
            duration: effect.duration
          });
        }
        if (effect.bonusCurrency) effects.bonusCurrency += effect.bonusCurrency;
        if (effect.extraChipDrop) effects.extraChipDrop = true;
      }
    }
  }

  return effects;
}

/**
 * Process on-damage chip effects
 * @param {array} chips - Array of chip objects
 * @param {number} damage - Incoming damage
 * @returns {object} Modified damage and effects
 */
export function processOnDamageChips(chips, damage) {
  let finalDamage = damage;
  const triggered = [];
  let heal = 0;
  const buffs = [];
  let negated = false;

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onDamage) {
      const effect = chip.effects.onDamage;
      if (Math.random() < effect.chance) {
        if (effect.damageReduction) {
          finalDamage = Math.floor(finalDamage * (1 - effect.damageReduction));
          triggered.push({
            chipId: chip.id,
            chipName: chip.name,
            reduction: effect.damageReduction
          });
        }
        if (effect.heal) {
          heal += effect.heal;
          triggered.push({
            chipId: chip.id,
            chipName: chip.name,
            heal: effect.heal
          });
        }
        if (effect.buff) {
          buffs.push({
            chipId: chip.id,
            chipName: chip.name,
            buff: effect.buff,
            value: effect.value,
            duration: effect.duration
          });
        }
        if (effect.negateDamage) {
          negated = true;
          finalDamage = 0;
          triggered.push({
            chipId: chip.id,
            chipName: chip.name,
            negated: true
          });
        }
      }
    }
  }

  return { finalDamage, triggered, heal, buffs, negated };
}

/**
 * Process on-crit chip effects
 * @param {array} chips - Array of chip objects
 * @returns {object} Combined effects from all triggered chips
 */
export function processOnCritChips(chips) {
  const effects = {
    heal: 0,
    buffs: [],
    bonusHit: false,
    doubleCritDamage: false
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onCrit) {
      const effect = chip.effects.onCrit;
      if (Math.random() < effect.chance) {
        if (effect.heal) effects.heal += effect.heal;
        if (effect.buff) {
          effects.buffs.push({
            chipId: chip.id,
            chipName: chip.name,
            buff: effect.buff,
            value: effect.value,
            duration: effect.duration
          });
        }
        if (effect.bonusHit) effects.bonusHit = true;
        if (effect.doubleCritDamage) effects.doubleCritDamage = true;
      }
    }
  }

  return effects;
}

/**
 * Process on-dodge chip effects
 * @param {array} chips - Array of chip objects
 * @returns {object} Combined effects from all triggered chips
 */
export function processOnDodgeChips(chips) {
  const effects = {
    buffs: [],
    counterAttack: false
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onDodge) {
      const effect = chip.effects.onDodge;
      if (Math.random() < effect.chance) {
        if (effect.buff) {
          effects.buffs.push({
            chipId: chip.id,
            chipName: chip.name,
            buff: effect.buff,
            value: effect.value,
            duration: effect.duration
          });
        }
        if (effect.counterAttack) effects.counterAttack = true;
      }
    }
  }

  return effects;
}

/**
 * Process on-low-hp chip effects (when player would die)
 * @param {array} chips - Array of chip objects
 * @returns {object} Combined effects from all triggered chips
 */
export function processOnLowHpChips(chips) {
  const effects = {
    surviveWithOneHp: false,
    shield: 0
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onLowHp) {
      const effect = chip.effects.onLowHp;
      if (Math.random() < effect.chance) {
        if (effect.surviveWithOneHp) effects.surviveWithOneHp = true;
        if (effect.shield) effects.shield += effect.shield;
      }
    }
  }

  return effects;
}

/**
 * Process on-heal chip effects
 * @param {array} chips - Array of chip objects
 * @param {number} healAmount - Base heal amount
 * @returns {object} Modified heal amount and effects
 */
export function processOnHealChips(chips, healAmount) {
  let finalHeal = healAmount;
  const effects = {
    bonusHeal: 0,
    buffs: []
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onHeal) {
      const effect = chip.effects.onHeal;
      if (Math.random() < effect.chance) {
        if (effect.bonusHeal) {
          effects.bonusHeal += effect.bonusHeal;
          finalHeal += effect.bonusHeal;
        }
        if (effect.buff) {
          effects.buffs.push({
            chipId: chip.id,
            chipName: chip.name,
            buff: effect.buff,
            value: effect.value,
            duration: effect.duration
          });
        }
      }
    }
  }

  return { finalHeal, ...effects };
}

/**
 * Process on-room-enter chip effects
 * @param {array} chips - Array of chip objects
 * @returns {object} Combined effects from all triggered chips
 */
export function processOnRoomEnterChips(chips) {
  const effects = {
    heal: 0,
    buffs: [],
    rareSpawn: false,
    stealth: false,
    stunAllEnemies: 0
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onRoomEnter) {
      const effect = chip.effects.onRoomEnter;
      if (Math.random() < effect.chance) {
        if (effect.heal) effects.heal += effect.heal;
        if (effect.buff) {
          effects.buffs.push({
            chipId: chip.id,
            chipName: chip.name,
            buff: effect.buff,
            value: effect.value,
            duration: effect.duration
          });
        }
        if (effect.rareSpawn) effects.rareSpawn = true;
        if (effect.stealth) effects.stealth = true;
        if (effect.stunAllEnemies) effects.stunAllEnemies = Math.max(effects.stunAllEnemies, effect.stunAllEnemies);
      }
    }
  }

  return effects;
}

/**
 * Process on-status-inflict chip effects
 * @param {array} chips - Array of chip objects
 * @param {string} statusType - The type of status that was inflicted
 * @returns {object} Combined effects from all triggered chips
 */
export function processOnStatusInflictChips(chips, statusType) {
  const effects = {
    heal: 0,
    extendDuration: 0
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onStatusInflict) {
      const effect = chip.effects.onStatusInflict;
      // Check if this chip triggers for this status type
      if (effect.statusType && effect.statusType !== statusType) continue;

      if (Math.random() < effect.chance) {
        if (effect.heal) effects.heal += effect.heal;
        if (effect.extendStun) effects.extendDuration += effect.extendStun;
      }
    }
  }

  return effects;
}

/**
 * Process special on-hit chip effects (cascade, enemyMissNextTurn)
 * @param {array} chips - Array of chip objects
 * @returns {object} Special effects to apply
 */
export function processSpecialOnHitChips(chips) {
  const effects = {
    cascade: false,
    enemyMissNextTurn: false
  };

  for (const chip of chips) {
    if (chip.category === 'onEffect' && chip.effects?.onHit) {
      const effect = chip.effects.onHit;
      if (Math.random() < effect.chance) {
        if (effect.cascade) effects.cascade = true;
        if (effect.enemyMissNextTurn) effects.enemyMissNextTurn = true;
      }
    }
  }

  return effects;
}

/**
 * Check if dice chip triggers a retrigger of chip effects
 * @param {array} chips - Player's equipped chips
 * @returns {boolean} Whether retrigger should occur
 */
export function checkDiceRetrigger(chips) {
  const diceChip = chips.find(c => c.id === 'dice');
  if (!diceChip) return false;

  const effect = diceChip.effects?.onEffectTrigger;
  if (!effect || !effect.retrigger) return false;

  return Math.random() < effect.chance;
}

/**
 * Update counter chip stacks
 * @param {object} counterStacks - Current stack counts { chipId: count }
 * @param {array} chips - Player's chips
 * @param {string} trigger - The trigger type (onKill, onCrit, onRoomEnter, etc.)
 * @param {object} context - Additional context (statusType for onStatusInflict)
 */
export function updateCounterStacks(counterStacks, chips, trigger, context = {}) {
  const updated = { ...counterStacks };

  for (const chip of chips) {
    if (chip.category === 'counter' && chip.effects?.counter) {
      const counter = chip.effects.counter;
      if (counter.trigger === trigger) {
        // Check additional conditions
        if (trigger === 'onStatusInflict' && counter.statusType !== context.statusType) {
          continue;
        }

        const currentStacks = updated[chip.id] || 0;
        if (currentStacks < counter.maxStacks) {
          updated[chip.id] = currentStacks + 1;
        }
      }
    }
  }

  return updated;
}

/**
 * Calculate counter chip bonuses based on run stats
 * @param {array} chips - Player's chips
 * @param {object} runStats - Run-wide statistics tracking
 */
export function calculateCounterBonuses(chips, runStats = {}) {
  const bonuses = {
    // Stats
    str: 0,
    agi: 0,
    vit: 0,
    int: 0,
    dex: 0,
    luk: 0,
    // Combat
    damagePercent: 0,
    flatDamage: 0,
    critChance: 0,
    critDamage: 0,
    aspd: 0,
    dodge: 0,
    // Status
    statusDuration: 0,
    statusChance: 0,
    triggerChance: 0,
    effectPotency: 0,
    // Utility
    allStats: 0,
    maxHp: 0,
    itemFind: 0,
    currencyGain: 0,
    inventorySlots: 0,
    healAtRoomStart: 0
  };

  for (const chip of chips) {
    if (chip.category === 'counter' && chip.effects?.counter) {
      const counter = chip.effects.counter;
      let stacks = 0;

      // Calculate stacks based on trigger type
      switch (counter.trigger) {
        case 'onKill':
          stacks = runStats.kills || 0;
          break;
        case 'onCrit':
          stacks = runStats.critsLanded || 0;
          break;
        case 'onStatusInflict':
          // Count specific status type or all statuses
          if (counter.statusType && runStats.statusesApplied) {
            stacks = runStats.statusesApplied[counter.statusType] || 0;
          } else if (runStats.statusesApplied) {
            stacks = Object.values(runStats.statusesApplied).reduce((sum, v) => sum + v, 0);
          }
          break;
        case 'onRoomEnter':
          stacks = runStats.roomsCleared || 0;
          break;
        case 'onChipCount':
          // Count chips in specific category
          if (counter.chipCategory) {
            stacks = chips.filter(c => c.category === counter.chipCategory).length;
          }
          break;
        case 'onUniqueChipType':
          // Count unique chip categories owned
          const uniqueCategories = new Set(chips.map(c => c.category));
          stacks = uniqueCategories.size;
          break;
        default:
          stacks = 0;
      }

      // Apply max stacks cap
      stacks = Math.min(stacks, counter.maxStacks);

      // Calculate bonus
      const bonus = stacks * counter.perStack;

      // Add to appropriate bonus type
      if (bonuses.hasOwnProperty(counter.bonus)) {
        bonuses[counter.bonus] += bonus;
      }
    }
  }

  return bonuses;
}

/**
 * Get chip display info for UI
 */
export function getChipDisplayInfo(chip) {
  const rarity = CHIP_RARITIES[chip.rarity];
  const category = Object.values(CHIP_CATEGORIES).find(c => c.id === chip.category);

  let effectText = '';

  if (chip.category === 'stat' && chip.effects?.stats) {
    const stats = Object.entries(chip.effects.stats)
      .map(([stat, val]) => `${stat.toUpperCase()}+${val}`)
      .join(', ');
    effectText = stats;
  } else if (chip.category === 'onHit' && chip.effects?.onHit) {
    const e = chip.effects.onHit;
    effectText = `${Math.round(e.chance * 100)}% ${e.status} (${e.duration}T)`;
    if (e.bonusDamage) effectText += ` +${e.bonusDamage}dmg`;
  } else if (chip.category === 'onEffect') {
    if (chip.effects?.onKill) {
      const e = chip.effects.onKill;
      const parts = [];
      if (e.heal) parts.push(`回復${e.heal}HP`);
      if (e.aspdBoost) parts.push(`ASPD+${Math.round(e.aspdBoost * 100)}%`);
      if (e.doubleCredits) parts.push('報酬2倍');
      if (e.aoeExplosion) parts.push(`爆発${e.aoeDamage}dmg`);
      effectText = `${Math.round(e.chance * 100)}% ${parts.join(', ')}`;
    } else if (chip.effects?.onDamage) {
      const e = chip.effects.onDamage;
      effectText = `${Math.round(e.chance * 100)}% ダメージ${Math.round(e.damageReduction * 100)}%軽減`;
    }
  } else if (chip.category === 'counter' && chip.effects?.counter) {
    const c = chip.effects.counter;
    effectText = `+${c.perStack}%/${c.trigger} (最大${c.perStack * c.maxStacks}%)`;
  }

  return {
    ...chip,
    rarityInfo: rarity,
    categoryInfo: category,
    effectText,
    price: getChipPrice(chip.id)
  };
}

// ============ CHIP SLOT MANAGEMENT ============

/**
 * Get the number of slots a chip uses
 * All chips use 1 slot regardless of rarity
 */
export function getChipSlotCost(chip) {
  return 1;
}

/**
 * Get all equipped chips from all equipment pieces
 * Returns full chip objects with scaled effects from player inventory
 * @param {object} player - Player object with equipment
 * @returns {array} Array of equipped chip objects
 */
export function getEquippedChips(player) {
  const chips = [];
  const slots = ['weapon', 'body', 'shield', 'accessory'];

  for (const slot of slots) {
    const equipment = player.equipment?.[slot];
    if (equipment?.equippedChips) {
      for (const chipId of equipment.equippedChips) {
        // First try to get from player inventory (has scaled effects)
        const inventoryChip = getChipFromInventory(player, chipId);
        if (inventoryChip) {
          chips.push(inventoryChip);
        } else {
          // Fallback to base chip definition
          const chip = getChip(chipId);
          if (chip) {
            chips.push(chip);
          }
        }
      }
    }
  }

  return chips;
}

/**
 * Get the count of used slots in an equipment piece
 * @param {object} equipment - Equipment object with equippedChips array
 * @returns {number} Number of slots used
 */
export function getUsedChipSlots(equipment) {
  if (!equipment?.equippedChips) return 0;

  let used = 0;
  for (const chipId of equipment.equippedChips) {
    const chip = getChip(chipId);
    if (chip) {
      used += getChipSlotCost(chip);
    }
  }
  return used;
}

/**
 * Equip a chip from inventory to an equipment piece
 * @param {object} player - Player object
 * @param {string} equipmentSlot - Equipment slot ('weapon', 'body', 'shield', 'accessory')
 * @param {string} chipId - ID of chip to equip
 * @param {number} maxSlots - Max chip slots for this equipment (default 5)
 * @returns {object} Result with success/error
 */
export function equipChip(player, equipmentSlot, chipId, maxSlots = 5) {
  // Validate equipment exists
  const equipment = player.equipment?.[equipmentSlot];
  if (!equipment) {
    return { success: false, error: 'Invalid equipment slot' };
  }

  // Initialize equippedChips if needed
  if (!equipment.equippedChips) {
    equipment.equippedChips = [];
  }

  // Check if chip exists
  const chip = getChip(chipId);
  if (!chip) {
    return { success: false, error: 'Unknown chip' };
  }

  // Check if player owns the chip in inventory
  const ownedChip = player.chips?.find(c => c.id === chipId);
  if (!ownedChip) {
    return { success: false, error: 'Chip not in inventory' };
  }

  // Check if chip is already equipped somewhere
  const slots = ['weapon', 'body', 'shield', 'accessory'];
  for (const slot of slots) {
    const eq = player.equipment?.[slot];
    if (eq?.equippedChips?.includes(chipId)) {
      return { success: false, error: 'Chip already equipped' };
    }
  }

  // Check if there are enough slots
  const slotsNeeded = getChipSlotCost(chip);
  const slotsUsed = getUsedChipSlots(equipment);
  if (slotsUsed + slotsNeeded > maxSlots) {
    return { success: false, error: `Not enough slots (need ${slotsNeeded}, have ${maxSlots - slotsUsed})` };
  }

  // Equip the chip
  equipment.equippedChips.push(chipId);

  // Remove from inventory
  player.chips = player.chips.filter(c => c.id !== chipId);

  return {
    success: true,
    chipId,
    chipName: chip.name,
    slot: equipmentSlot,
    slotsUsed: slotsUsed + slotsNeeded,
    maxSlots
  };
}

/**
 * Unequip a chip from an equipment piece back to inventory
 * @param {object} player - Player object
 * @param {string} equipmentSlot - Equipment slot
 * @param {string} chipId - ID of chip to unequip
 * @returns {object} Result with success/error
 */
export function unequipChip(player, equipmentSlot, chipId) {
  // Validate equipment exists
  const equipment = player.equipment?.[equipmentSlot];
  if (!equipment) {
    return { success: false, error: 'Invalid equipment slot' };
  }

  // Check if chip is equipped
  if (!equipment.equippedChips?.includes(chipId)) {
    return { success: false, error: 'Chip not equipped in this slot' };
  }

  // Get chip definition
  const chip = getChip(chipId);
  if (!chip) {
    return { success: false, error: 'Unknown chip' };
  }

  // Remove from equipment
  equipment.equippedChips = equipment.equippedChips.filter(id => id !== chipId);

  // Add back to inventory
  if (!player.chips) {
    player.chips = [];
  }
  player.chips.push({
    id: chip.id,
    name: chip.name,
    nameEn: chip.nameEn,
    category: chip.category,
    rarity: chip.rarity,
    effects: chip.effects
  });

  return {
    success: true,
    chipId,
    chipName: chip.name
  };
}

/**
 * Calculate total bonuses from all equipped chips
 * Combines STAT chip bonuses and COUNTER chip bonuses
 * @param {object} player - Player object
 * @param {object} runStats - Run-wide statistics for counter chips
 * @returns {object} Combined bonus object
 */
export function calculateEquippedChipBonuses(player, runStats = {}) {
  const equippedChips = getEquippedChips(player);

  // Get STAT chip bonuses
  const statBonuses = calculateChipStatBonuses(equippedChips);

  // Get COUNTER chip bonuses
  const counterBonuses = calculateCounterBonuses(equippedChips, runStats);

  // Combine all bonuses
  return {
    // Primary stats from STAT chips
    str: statBonuses.str,
    agi: statBonuses.agi,
    vit: statBonuses.vit,
    int: statBonuses.int,
    dex: statBonuses.dex,
    luk: statBonuses.luk,

    // Counter bonuses
    damagePercent: counterBonuses.damagePercent,
    flatDamage: counterBonuses.flatDamage,
    critChance: counterBonuses.critChance,
    critDamage: counterBonuses.critDamage,
    aspd: counterBonuses.aspd,
    dodge: counterBonuses.dodge,
    statusDuration: counterBonuses.statusDuration,
    statusChance: counterBonuses.statusChance,
    triggerChance: counterBonuses.triggerChance,
    effectPotency: counterBonuses.effectPotency,
    allStats: counterBonuses.allStats,
    maxHp: counterBonuses.maxHp,
    itemFind: counterBonuses.itemFind,
    currencyGain: counterBonuses.currencyGain,
    inventorySlots: counterBonuses.inventorySlots,
    healAtRoomStart: counterBonuses.healAtRoomStart
  };
}

/**
 * Get chip loadout information for UI
 * @param {object} player - Player object
 * @param {object} runStats - Run-wide statistics
 * @returns {object} Loadout with equipment, inventory, and bonuses
 */
export function getChipLoadout(player, runStats = {}) {
  const slots = ['weapon', 'body', 'shield', 'accessory'];
  const equipmentLoadout = {};

  for (const slot of slots) {
    const equipment = player.equipment?.[slot];
    if (equipment) {
      const equippedChips = (equipment.equippedChips || []).map(chipId => {
        const chip = getChip(chipId);
        return chip ? getChipDisplayInfo(chip) : null;
      }).filter(Boolean);

      equipmentLoadout[slot] = {
        equipmentId: equipment.id,
        equippedChips,
        slotsUsed: getUsedChipSlots(equipment),
        maxSlots: 5
      };
    }
  }

  // Inventory chips - preserve player's chip data (id, rarity, effects) over base definition
  const inventoryChips = (player.chips || []).map(chip => {
    const baseChip = getChip(chip.id);
    // Merge: base chip info + player's chip data (player's data takes priority for id, rarity, effects)
    const mergedChip = baseChip ? { ...baseChip, ...chip } : chip;
    return getChipDisplayInfo(mergedChip);
  });

  // Total bonuses
  const totalBonuses = calculateEquippedChipBonuses(player, runStats);

  return {
    equipment: equipmentLoadout,
    inventory: inventoryChips,
    totalBonuses
  };
}
