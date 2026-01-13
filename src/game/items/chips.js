/**
 * Chip System - NEO TOKYO: System Liberation
 * Chips are passive augmentations bought with credits after combat
 * They provide stat bonuses, on-hit effects, conditional triggers, and scaling bonuses
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
  }
};

// ============ HELPER FUNCTIONS ============

/**
 * Get chip by ID
 */
export function getChip(chipId) {
  return CHIPS[chipId] || null;
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
 */
export function getChipPrice(chipId) {
  const chip = getChip(chipId);
  if (!chip) return 0;

  const rarity = CHIP_RARITIES[chip.rarity];
  return Math.floor(BASE_CHIP_PRICE * rarity.priceMultiplier);
}

/**
 * Get available rarities for a floor
 * Floor 1-2: Common, Uncommon
 * Floor 3-4: Uncommon, Rare, Epic
 * Floor 5+: Rare, Epic, Legendary
 */
export function getAvailableRaritiesForFloor(floor) {
  if (floor <= 2) {
    return ['common', 'uncommon'];
  } else if (floor <= 4) {
    return ['uncommon', 'rare', 'epic'];
  } else {
    return ['rare', 'epic', 'legendary'];
  }
}

/**
 * Generate random chips for post-combat shop
 * @param {number} floor - Current floor
 * @param {array} ownedChipIds - IDs of chips player already owns
 * @param {number} count - Number of chips to generate (default 3)
 */
export function generateShopChips(floor, ownedChipIds = [], count = 3) {
  const availableRarities = getAvailableRaritiesForFloor(floor);

  // Get all chips of available rarities that player doesn't own
  const availableChips = Object.values(CHIPS).filter(chip =>
    availableRarities.includes(chip.rarity) &&
    !ownedChipIds.includes(chip.id)
  );

  if (availableChips.length === 0) {
    return []; // No chips available
  }

  // Shuffle and pick
  const shuffled = [...availableChips].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  return selected.map(chip => ({
    id: chip.id,
    name: chip.name,
    nameEn: chip.nameEn,
    description: chip.description,
    category: chip.category,
    rarity: chip.rarity,
    price: getChipPrice(chip.id),
    effects: chip.effects
  }));
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
    aoeDamage: 0
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
      }
    }
  }

  return { finalDamage, triggered };
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
 * Calculate counter chip bonuses
 * @param {object} counterStacks - Current stack counts
 * @param {array} chips - Player's chips
 */
export function calculateCounterBonuses(counterStacks, chips) {
  const bonuses = {
    damagePercent: 0,
    statusDuration: 0,
    critDamage: 0,
    aspd: 0,
    allStats: 0
  };

  for (const chip of chips) {
    if (chip.category === 'counter' && chip.effects?.counter) {
      const counter = chip.effects.counter;
      const stacks = counterStacks[chip.id] || 0;
      const bonus = stacks * counter.perStack;

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
