/**
 * @fileoverview Equipment definitions - weapons, armor, shields, accessories
 * @module src/game/items/equipment
 *
 * PURPOSE:
 * Defines all equipment items (weapons, armor, shields, accessories) with their
 * stats, prices, and set bonuses. Based on Ragnarok Online item database for
 * stat balance. Equipment can be refined at blacksmith and have chips equipped.
 *
 * KEY EXPORTS:
 * - WEAPONS - 50 weapons (daggers, swords, maces, staves, bows, katars)
 * - ARMOR - Body armor pieces
 * - SHIELDS - Off-hand defensive gear
 * - ACCESSORIES - Rings, amulets, and utility items
 * - EQUIPMENT_SETS - Set bonuses when multiple pieces equipped
 * - getEquipment(id) - Get equipment definition by ID
 * - getEquipmentBySlot(slot) - Get all equipment for a slot
 * - getEquipmentByRarity(rarity) - Filter by rarity
 *
 * EQUIPMENT SLOTS:
 * - weapon: Primary weapon (ATK-focused)
 * - body: Armor (DEF, HP)
 * - shield: Off-hand (DEF, special effects)
 * - accessory: Utility (varied stats)
 *
 * STAT PROPERTIES:
 * - atk/def/matk/mdef - Combat stats
 * - str/agi/vit/int/dex/luk - Primary stat bonuses
 * - maxHp/maxSp - Resource bonuses
 * - crit/hit/flee - Combat modifiers
 * - armorPen/damageBonus - Damage modifiers
 * - doubleStrike - % chance for extra attack
 * - setId - For set bonus linking
 *
 * RARITIES:
 * - common (gray): Basic stats
 * - uncommon (green): Moderate stats + minor bonus
 * - rare (blue): Good stats + special effect
 * - epic (purple): High stats + powerful effect
 * - legendary (orange): Best stats + unique effects
 *
 * DEPENDENCIES:
 * - None (pure data module)
 *
 * ARCHITECTURE NOTES:
 * - Equipment stored in player.equipment{} by slot
 * - Each piece can have equippedChips[] array
 * - Set bonuses calculated in calculateEquipmentBonuses()
 * - Refinement increases base stats (handled in loop.js)
 *
 * CLAUDE HINTS:
 * - For bonus calculation, see items/index.js calculateEquipmentBonuses()
 * - Equipment bought from shop or dropped by bosses
 * - Starting equipment defined in class-equipment.js
 * - Set bonuses activate with 2+ pieces from same setId
 */

// ============ WEAPONS (50) ============
// Based on RateMyServer Ragnarok Online item database
export const WEAPONS = {
  // --- DAGGERS (8) ---
  knife: {
    id: "knife", name: "ナイフ", nameEn: "Knife",
    description: "シンプルな小型ナイフ。",
    type: "weapon", slot: "weapon", rarity: "common",
    atk: 17, buyPrice: 50, sellPrice: 25
  },
  stiletto: {
    id: "stiletto", name: "スティレット", nameEn: "Stiletto",
    description: "細身の刺突用短剣。",
    type: "weapon", slot: "weapon", rarity: "common",
    atk: 53, buyPrice: 100, sellPrice: 50
  },
  combatKnife: {
    id: "combatKnife", name: "コンバットナイフ", nameEn: "Combat Knife",
    description: "戦闘用に設計されたナイフ。",
    type: "weapon", slot: "weapon", rarity: "uncommon",
    atk: 80, armorPen: 0.05, buyPrice: 300, sellPrice: 150
  },
  bazerald: {
    id: "bazerald", name: "バゼラルド", nameEn: "Bazerald",
    description: "魔力を帯びた短剣。",
    type: "weapon", slot: "weapon", rarity: "uncommon",
    atk: 70, int: 5, matk: 15, buyPrice: 400, sellPrice: 200
  },
  assassinDagger: {
    id: "assassinDagger", name: "アサシンダガー", nameEn: "Assassin Dagger",
    description: "暗殺者が愛用する短剣。",
    type: "weapon", slot: "weapon", rarity: "rare",
    atk: 140, maxHp: 100, maxSp: 50, doubleStrike: 10,
    setId: "speedDemon", buyPrice: 1000, sellPrice: 500
  },
  azoth: {
    id: "azoth", name: "アゾート", nameEn: "Azoth",
    description: "錬金術師の秘宝。敵を変身させる力を持つ。",
    type: "weapon", slot: "weapon", rarity: "rare",
    atk: 110, transform: { chance: 5, targetTier: 1 },
    buyPrice: 1200, sellPrice: 600
  },
  infiltrator: {
    id: "infiltrator", name: "インフィルトレイター", nameEn: "Infiltrator",
    description: "潜入者が使う高性能短剣。",
    type: "weapon", slot: "weapon", rarity: "epic",
    atk: 140, vsBossDamage: 0.10, def: 3, flee: 5, perfectDodge: 2,
    buyPrice: 2500, sellPrice: 1250
  },
  braveAssassinDamascus: {
    id: "braveAssassinDamascus", name: "勇敢なアサシンのダマスカス", nameEn: "Brave Assassin's Damascus",
    description: "伝説の暗殺者が使ったダマスカス鋼の短剣。",
    type: "weapon", slot: "weapon", rarity: "epic",
    atk: 120, str: 1, agi: 1, vsBossDamage: 0.15, armorPen: 0.20,
    buyPrice: 3000, sellPrice: 1500
  },

  // --- STARTER WEAPON ---
  steelSword: {
    id: "steelSword", name: "鋼の剣", nameEn: "Steel Sword",
    description: "冒険者が最初に手にする頼れる剣。",
    type: "weapon", slot: "weapon", rarity: "common",
    atk: 10, buyPrice: 0, sellPrice: 25
  },

  // --- SWORDS (10) ---
  sword: {
    id: "sword", name: "ソード", nameEn: "Sword",
    description: "標準的な片手剣。",
    type: "weapon", slot: "weapon", rarity: "common",
    atk: 53, buyPrice: 100, sellPrice: 50
  },
  blade: {
    id: "blade", name: "ブレイド", nameEn: "Blade",
    description: "鋭い刃を持つ剣。",
    type: "weapon", slot: "weapon", rarity: "common",
    atk: 53, buyPrice: 100, sellPrice: 50
  },
  cutlass: {
    id: "cutlass", name: "カトラス", nameEn: "Cutlass",
    description: "船乗りが愛用する曲刀。",
    type: "weapon", slot: "weapon", rarity: "uncommon",
    atk: 100, buyPrice: 300, sellPrice: 150
  },
  flamberge: {
    id: "flamberge", name: "フランベルジュ", nameEn: "Flamberge",
    description: "波打つ刃を持つ大剣。",
    type: "weapon", slot: "weapon", rarity: "uncommon",
    atk: 150, def: 5, buyPrice: 500, sellPrice: 250
  },
  edge: {
    id: "edge", name: "エッジ", nameEn: "Edge",
    description: "鋭利な刃で出血を引き起こす。",
    type: "weapon", slot: "weapon", rarity: "rare",
    atk: 115, statusInflict: { status: "bleed", chance: 5, duration: 2 },
    setId: "chaos", buyPrice: 800, sellPrice: 400
  },
  excalibur: {
    id: "excalibur", name: "エクスカリバー", nameEn: "Excalibur",
    description: "聖なる力を宿す伝説の剣。",
    type: "weapon", slot: "weapon", rarity: "rare",
    atk: 150, luk: 5,
    setId: "holyKnight", buyPrice: 1200, sellPrice: 600
  },
  iceFalchion: {
    id: "iceFalchion", name: "アイスファルシオン", nameEn: "Ice Falchion",
    description: "氷の魔力を宿す曲刀。",
    type: "weapon", slot: "weapon", rarity: "rare",
    atk: 100, statusInflict: { status: "stun", chance: 5, duration: 1 },
    setId: "chaos", buyPrice: 900, sellPrice: 450
  },
  fireBrand: {
    id: "fireBrand", name: "ファイアーブランド", nameEn: "Fire Brand",
    description: "炎を纏った剣。",
    type: "weapon", slot: "weapon", rarity: "rare",
    atk: 100, statusInflict: { status: "bleed", chance: 8, duration: 2 },
    buyPrice: 900, sellPrice: 450
  },
  mysteltainn: {
    id: "mysteltainn", name: "ミスティルテイン", nameEn: "Mysteltainn",
    description: "闇の力を秘めた魔剣。",
    type: "weapon", slot: "weapon", rarity: "epic",
    atk: 170, statusInflict: { status: "silence", chance: 5, duration: 2 }, onKillHp: 50,
    buyPrice: 3500, sellPrice: 1750
  },
  balmung: {
    id: "balmung", name: "バルムンク", nameEn: "Balmung",
    description: "北欧神話の英雄が振るった聖剣。",
    type: "weapon", slot: "weapon", rarity: "legendary", indestructible: true,
    atk: 250, int: 20, luk: 20,
    setId: "valkyrie", buyPrice: null, sellPrice: 5000
  },

  // --- TWO-HANDED SWORDS (6) ---
  bastardSword: {
    id: "bastardSword", name: "バスタードソード", nameEn: "Bastard Sword",
    description: "片手でも両手でも使える剣。",
    type: "weapon", slot: "weapon", rarity: "common",
    atk: 115, buyPrice: 150, sellPrice: 75
  },
  broadSword: {
    id: "broadSword", name: "ブロードソード", nameEn: "Broad Sword",
    description: "幅広の両手剣。",
    type: "weapon", slot: "weapon", rarity: "uncommon",
    atk: 140, def: 5, buyPrice: 400, sellPrice: 200
  },
  claymore: {
    id: "claymore", name: "クレイモア", nameEn: "Claymore",
    description: "スコットランドの大剣。",
    type: "weapon", slot: "weapon", rarity: "uncommon",
    atk: 180, buyPrice: 500, sellPrice: 250
  },
  atlasWeapon: {
    id: "atlasWeapon", name: "アトラスウェポン", nameEn: "Atlas Weapon",
    description: "巨人の力を秘めた武器。",
    type: "weapon", slot: "weapon", rarity: "rare",
    atk: 200, crit: 10, armorPen: 0.10, buyPrice: 1500, sellPrice: 750
  },
  bloodyEater: {
    id: "bloodyEater", name: "ブラッディイーター", nameEn: "Bloody Eater",
    description: "血を啜る呪われた大剣。",
    type: "weapon", slot: "weapon", rarity: "epic",
    atk: 200, crit: 15, onKillHp: 100, buyPrice: 4000, sellPrice: 2000
  },
  executioner: {
    id: "executioner", name: "エクスキューショナー", nameEn: "Executioner",
    description: "処刑人の大剣。ボスに絶大な威力を発揮。",
    type: "weapon", slot: "weapon", rarity: "legendary", indestructible: true,
    atk: 220, vsBossDamage: 0.20, crit: 15,
    setId: "berserker", buyPrice: null, sellPrice: 5000
  },

  // --- SPEARS (6) ---
  javelin: {
    id: "javelin", name: "ジャベリン", nameEn: "Javelin",
    description: "投擲用の槍。",
    type: "weapon", slot: "weapon", rarity: "common",
    atk: 28, buyPrice: 50, sellPrice: 25
  },
  pike: {
    id: "pike", name: "パイク", nameEn: "Pike",
    description: "長い柄を持つ槍。",
    type: "weapon", slot: "weapon", rarity: "uncommon",
    atk: 80, buyPrice: 250, sellPrice: 125
  },
  gungnir: {
    id: "gungnir", name: "グングニル", nameEn: "Gungnir",
    description: "オーディンの槍。必中の力を持つ。",
    type: "weapon", slot: "weapon", rarity: "rare",
    atk: 120, hit: 30, buyPrice: 1200, sellPrice: 600
  },
  ahlspiess: {
    id: "ahlspiess", name: "アルシピエス", nameEn: "Ahlspiess",
    description: "装甲を貫く特殊な槍。",
    type: "weapon", slot: "weapon", rarity: "rare",
    atk: 120, armorPen: 1.0, vsBossDamage: 0.10, buyPrice: 1500, sellPrice: 750
  },
  brionac: {
    id: "brionac", name: "ブリューナク", nameEn: "Brionac",
    description: "ケルトの太陽神の槍。",
    type: "weapon", slot: "weapon", rarity: "epic",
    atk: 190, onKillHp: 80, buyPrice: 3500, sellPrice: 1750
  },
  crescentScythe: {
    id: "crescentScythe", name: "クレセントサイズ", nameEn: "Crescent Scythe",
    description: "死神の大鎌。",
    type: "weapon", slot: "weapon", rarity: "epic",
    atk: 180, crit: 30, hit: 10,
    setId: "reaper", buyPrice: 4000, sellPrice: 2000
  },

  // --- AXES (5) ---
  axe: {
    id: "axe", name: "アックス", nameEn: "Axe",
    description: "標準的な斧。",
    type: "weapon", slot: "weapon", rarity: "common",
    atk: 38, buyPrice: 75, sellPrice: 37
  },
  battleAxe: {
    id: "battleAxe", name: "バトルアックス", nameEn: "Battle Axe",
    description: "戦闘用の大きな斧。",
    type: "weapon", slot: "weapon", rarity: "uncommon",
    atk: 80, buyPrice: 250, sellPrice: 125
  },
  cleaver: {
    id: "cleaver", name: "クリーバー", nameEn: "Cleaver",
    description: "肉切り包丁のような斧。金貨を集める。",
    type: "weapon", slot: "weapon", rarity: "uncommon",
    atk: 140, vsBossDamage: 0.05, goldFind: 0.10,
    setId: "treasureHunter", buyPrice: 400, sellPrice: 200
  },
  bloodyAxe: {
    id: "bloodyAxe", name: "ブラッディアックス", nameEn: "Bloody Axe",
    description: "血に染まった恐ろしい斧。",
    type: "weapon", slot: "weapon", rarity: "rare",
    atk: 170, str: 10, doubleStrike: 15, buyPrice: 1200, sellPrice: 600
  },
  doomSlayer: {
    id: "doomSlayer", name: "ドゥームスレイヤー", nameEn: "Doom Slayer",
    description: "破滅をもたらす巨大な斧。高リスク高リターン。",
    type: "weapon", slot: "weapon", rarity: "epic",
    atk: 340, doubleStrike: -20, armorPen: 0.15, requireStr: 95,
    buyPrice: 5000, sellPrice: 2500
  },

  // --- MACES (4) ---
  club: {
    id: "club", name: "クラブ", nameEn: "Club",
    description: "シンプルな棍棒。",
    type: "weapon", slot: "weapon", rarity: "common",
    atk: 23, buyPrice: 50, sellPrice: 25
  },
  flail: {
    id: "flail", name: "フレイル", nameEn: "Flail",
    description: "鎖で繋がれた打撃武器。",
    type: "weapon", slot: "weapon", rarity: "uncommon",
    atk: 69, buyPrice: 200, sellPrice: 100
  },
  morningStar: {
    id: "morningStar", name: "モーニングスター", nameEn: "Morning Star",
    description: "棘付きの鉄球。スタンを与える。",
    type: "weapon", slot: "weapon", rarity: "rare",
    atk: 105, statusInflict: { status: "stun", chance: 8, duration: 1 },
    setId: "chaos", buyPrice: 800, sellPrice: 400
  },
  erde: {
    id: "erde", name: "エルデ", nameEn: "Erde",
    description: "大地の力を宿すメイス。",
    type: "weapon", slot: "weapon", rarity: "epic",
    atk: 130, healingBonus: 0.10, buyPrice: 2500, sellPrice: 1250
  },

  // --- STAVES (5) ---
  rod: {
    id: "rod", name: "ロッド", nameEn: "Rod",
    description: "基本的な魔法の杖。",
    type: "weapon", slot: "weapon", rarity: "common",
    atk: 15, int: 1, buyPrice: 50, sellPrice: 25
  },
  arcWand: {
    id: "arcWand", name: "アークワンド", nameEn: "Arc Wand",
    description: "魔力を増幅する杖。",
    type: "weapon", slot: "weapon", rarity: "uncommon",
    atk: 60, int: 3, matk: 20, buyPrice: 350, sellPrice: 175
  },
  evilBoneWand: {
    id: "evilBoneWand", name: "イビルボーンワンド", nameEn: "Evil Bone Wand",
    description: "邪悪な骨で作られた杖。",
    type: "weapon", slot: "weapon", rarity: "rare",
    atk: 40, int: 4, matk: 20, statusInflict: { status: "silence", chance: 5, duration: 2 },
    buyPrice: 900, sellPrice: 450
  },
  eraser: {
    id: "eraser", name: "イレイザー", nameEn: "Eraser",
    description: "存在を消し去る杖。",
    type: "weapon", slot: "weapon", rarity: "epic",
    atk: 80, matk: 30, int: 3, dex: 2, onKillSp: 20,
    buyPrice: 3000, sellPrice: 1500
  },
  croceStaff: {
    id: "croceStaff", name: "クロススタッフ", nameEn: "Croce Staff",
    description: "聖なる十字架の杖。",
    type: "weapon", slot: "weapon", rarity: "epic",
    atk: 30, matk: 20, int: 4, healingBonus: 0.15,
    setId: "holyKnight", buyPrice: 2500, sellPrice: 1250
  },

  // --- BOWS (4) ---
  bow: {
    id: "bow", name: "ボウ", nameEn: "Bow",
    description: "基本的な弓。",
    type: "weapon", slot: "weapon", rarity: "common", isRanged: true,
    atk: 15, buyPrice: 50, sellPrice: 25
  },
  arbalest: {
    id: "arbalest", name: "アルバレスト", nameEn: "Arbalest",
    description: "強力なクロスボウ。",
    type: "weapon", slot: "weapon", rarity: "uncommon", isRanged: true,
    atk: 90, dex: 2, buyPrice: 350, sellPrice: 175
  },
  burningBow: {
    id: "burningBow", name: "バーニングボウ", nameEn: "Burning Bow",
    description: "炎を纏った弓。",
    type: "weapon", slot: "weapon", rarity: "rare", isRanged: true,
    atk: 95, statusInflict: { status: "bleed", chance: 8, duration: 2 }, vsBossDamage: 0.10,
    buyPrice: 1000, sellPrice: 500
  },
  ballista: {
    id: "ballista", name: "バリスタ", nameEn: "Ballista",
    description: "巨大な弩弓。",
    type: "weapon", slot: "weapon", rarity: "epic", isRanged: true,
    atk: 145, dex: 5, buyPrice: 3000, sellPrice: 1500
  },

  // --- KATARS (2) ---
  katar: {
    id: "katar", name: "カタール", nameEn: "Katar",
    description: "アサシン専用の二連短剣。",
    type: "weapon", slot: "weapon", rarity: "uncommon",
    atk: 105, doubleStrike: 5,
    setId: "speedDemon", buyPrice: 400, sellPrice: 200
  },
  inverseScale: {
    id: "inverseScale", name: "逆鱗", nameEn: "Inverse Scale",
    description: "竜の逆鱗で作られた禁断の武器。ランダムな状態異常を与える。",
    type: "weapon", slot: "weapon", rarity: "legendary", indestructible: true,
    atk: 140, statusInflict: { status: "random", chance: 15, duration: 2 },
    setId: "phantom", buyPrice: null, sellPrice: 5000
  }
};

// ============ BODY ARMOR (25) ============
// Based on RateMyServer - merged body armor, garments, footgear, headgear
export const ARMOR = {
  // --- STARTER ARMOR ---
  leatherArmor: {
    id: "leatherArmor", name: "革鎧", nameEn: "Leather Armor",
    description: "軽くて動きやすい革製の鎧。",
    type: "armor", slot: "body", rarity: "common",
    def: 10, buyPrice: 0, sellPrice: 25
  },

  // --- COMMON (4) ---
  adventurersSuit: {
    id: "adventurersSuit", name: "冒険者の服", nameEn: "Adventurer's Suit",
    description: "冒険者用の基本的な服。",
    type: "armor", slot: "body", rarity: "common",
    def: 3, buyPrice: 50, sellPrice: 25
  },
  cottonShirt: {
    id: "cottonShirt", name: "コットンシャツ", nameEn: "Cotton Shirt",
    description: "柔らかい綿のシャツ。",
    type: "armor", slot: "body", rarity: "common",
    def: 2, mdef: 1, buyPrice: 40, sellPrice: 20
  },
  sandals: {
    id: "sandals", name: "サンダル", nameEn: "Sandals",
    description: "シンプルなサンダル。",
    type: "armor", slot: "body", rarity: "common",
    def: 1, buyPrice: 30, sellPrice: 15
  },
  cap: {
    id: "cap", name: "キャップ", nameEn: "Cap",
    description: "普通の帽子。",
    type: "armor", slot: "body", rarity: "common",
    def: 2, buyPrice: 40, sellPrice: 20
  },

  // --- UNCOMMON (5) ---
  paddedArmor: {
    id: "paddedArmor", name: "パデッドアーマー", nameEn: "Padded Armor",
    description: "詰め物入りの軽い鎧。",
    type: "armor", slot: "body", rarity: "uncommon",
    def: 6, buyPrice: 200, sellPrice: 100
  },
  chainMail: {
    id: "chainMail", name: "チェインメイル", nameEn: "Chain Mail",
    description: "鎖を編んだ鎧。",
    type: "armor", slot: "body", rarity: "uncommon",
    def: 8, buyPrice: 300, sellPrice: 150
  },
  manteau: {
    id: "manteau", name: "マント", nameEn: "Manteau",
    description: "回避力を高めるマント。",
    type: "armor", slot: "body", rarity: "uncommon",
    def: 4, flee: 5, buyPrice: 250, sellPrice: 125
  },
  boots: {
    id: "boots", name: "ブーツ", nameEn: "Boots",
    description: "丈夫なブーツ。",
    type: "armor", slot: "body", rarity: "uncommon",
    def: 4, buyPrice: 200, sellPrice: 100
  },
  featherBeret: {
    id: "featherBeret", name: "フェザーベレー", nameEn: "Feather Beret",
    description: "ボスからのダメージを軽減する帽子。",
    type: "armor", slot: "body", rarity: "uncommon",
    def: 2, damageReduction: 0.05, buyPrice: 350, sellPrice: 175
  },

  // --- RARE (8) ---
  assassinRobe: {
    id: "assassinRobe", name: "アサシンローブ", nameEn: "Assassin Robe",
    description: "暗殺者用の黒いローブ。",
    type: "armor", slot: "body", rarity: "rare",
    def: 7, maxHp: 150, mdef: 2, agi: 2, buyPrice: 800, sellPrice: 400
  },
  blessedHolyRobe: {
    id: "blessedHolyRobe", name: "祝福された聖なるローブ", nameEn: "Blessed Holy Robe",
    description: "聖なる力で祝福されたローブ。",
    type: "armor", slot: "body", rarity: "rare",
    def: 5, mdef: 5,
    setId: "holyKnight", buyPrice: 900, sellPrice: 450
  },
  bonePlate: {
    id: "bonePlate", name: "ボーンプレート", nameEn: "Bone Plate",
    description: "骨で作られた鎧。カウンター能力を持つ。",
    type: "armor", slot: "body", rarity: "rare",
    def: 7, armorPen: 0.10, str: 1,
    setId: "chaos", buyPrice: 1000, sellPrice: 500
  },
  cheapUndershirt: {
    id: "cheapUndershirt", name: "安物のアンダーシャツ", nameEn: "Cheap Undershirt",
    description: "名前に反して優れた性能を持つ。",
    type: "armor", slot: "body", rarity: "rare",
    def: 8, dex: 2, flee: 10, buyPrice: 700, sellPrice: 350
  },
  blackLeatherBoots: {
    id: "blackLeatherBoots", name: "黒革のブーツ", nameEn: "Black Leather Boots",
    description: "素早い動きを可能にするブーツ。",
    type: "armor", slot: "body", rarity: "rare",
    def: 4, agi: 3, doubleStrike: 5,
    setId: "speedDemon", buyPrice: 900, sellPrice: 450
  },
  combatBoots: {
    id: "combatBoots", name: "コンバットブーツ", nameEn: "Combat Boots",
    description: "戦闘用の丈夫なブーツ。",
    type: "armor", slot: "body", rarity: "rare",
    def: 3, maxHp: 100, mdef: 1, buyPrice: 700, sellPrice: 350
  },
  crown: {
    id: "crown", name: "クラウン", nameEn: "Crown",
    description: "王族の冠。全能力を少し上げる。",
    type: "armor", slot: "body", rarity: "rare",
    def: 4, str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1,
    buyPrice: 1200, sellPrice: 600
  },
  fullPlate: {
    id: "fullPlate", name: "フルプレート", nameEn: "Full Plate",
    description: "全身を覆う重装甲。",
    type: "armor", slot: "body", rarity: "rare",
    def: 10, vit: 3, buyPrice: 1000, sellPrice: 500
  },

  // --- EPIC (5) ---
  valkyrieArmor: {
    id: "valkyrieArmor", name: "ヴァルキリーアーマー", nameEn: "Valkyrie Armor",
    description: "ヴァルキリーの聖なる鎧。状態異常を無効化。",
    type: "armor", slot: "body", rarity: "epic",
    def: 8, mdef: 10, statusImmune: ["silence", "stun"],
    setId: "valkyrie", buyPrice: 3000, sellPrice: 1500
  },
  angelicProtection: {
    id: "angelicProtection", name: "天使の守護", nameEn: "Angelic Protection",
    description: "天使に守られた鎧。",
    type: "armor", slot: "body", rarity: "epic",
    def: 4, mdef: 20, maxHp: 300, healingBonus: 0.15,
    buyPrice: 3500, sellPrice: 1750
  },
  cloakOfSurvival: {
    id: "cloakOfSurvival", name: "生存者のマント", nameEn: "Cloak of Survival",
    description: "極限状況でも生き残るためのマント。",
    type: "armor", slot: "body", rarity: "epic",
    def: 5, vit: 10, mdef: 10, healingBonus: 0.10,
    buyPrice: 3000, sellPrice: 1500
  },
  airBossSuit: {
    id: "airBossSuit", name: "エアボススーツ", nameEn: "Air Boss Suit",
    description: "空気のように軽い戦闘スーツ。",
    type: "armor", slot: "body", rarity: "epic",
    def: 5, agi: 3, doubleStrike: 15,
    setId: "speedDemon", buyPrice: 3500, sellPrice: 1750
  },
  titanArmor: {
    id: "titanArmor", name: "タイタンアーマー", nameEn: "Titan Armor",
    description: "巨人の力を宿す鎧。",
    type: "armor", slot: "body", rarity: "epic",
    def: 12, vit: 8, maxHp: 200, agi: -2,
    setId: "berserker", buyPrice: 4000, sellPrice: 2000
  },

  // --- LEGENDARY (3) ---
  brynhild: {
    id: "brynhild", name: "ブリュンヒルド", nameEn: "Brynhild",
    description: "北欧神話のヴァルキリーの鎧。",
    type: "armor", slot: "body", rarity: "legendary", indestructible: true,
    def: 10, maxHp: 500, maxSp: 100, damageBonus: 0.10, healingBonus: 0.10,
    setId: "valkyrie", buyPrice: null, sellPrice: 5000
  },
  glitteringJacket: {
    id: "glitteringJacket", name: "きらめくジャケット", nameEn: "Glittering Jacket",
    description: "光を反射する不思議なジャケット。",
    type: "armor", slot: "body", rarity: "legendary", indestructible: true,
    def: 6, perfectDodge: 8,
    setId: "phantom", buyPrice: null, sellPrice: 5000
  },
  diabolusRobe: {
    id: "diabolusRobe", name: "ディアボロスローブ", nameEn: "Diabolus Robe",
    description: "悪魔の力を宿すローブ。",
    type: "armor", slot: "body", rarity: "legendary", indestructible: true,
    def: 5, matk: 25, healingBonus: 0.15, vsBossDamage: 0.20,
    setId: "darkMage", buyPrice: null, sellPrice: 5000
  }
};

// ============ SHIELDS (25) ============
// Based on RateMyServer Ragnarok Online item database
export const SHIELDS = {
  // --- COMMON (3) ---
  buckler: {
    id: "buckler", name: "バックラー", nameEn: "Buckler",
    description: "小型の盾。",
    type: "shield", slot: "shield", rarity: "common",
    def: 4, buyPrice: 50, sellPrice: 25
  },
  guard: {
    id: "guard", name: "ガード", nameEn: "Guard",
    description: "基本的な盾。",
    type: "shield", slot: "shield", rarity: "common",
    def: 3, buyPrice: 40, sellPrice: 20
  },
  woodenShield: {
    id: "woodenShield", name: "ウッドシールド", nameEn: "Wooden Shield",
    description: "木製の盾。",
    type: "shield", slot: "shield", rarity: "common",
    def: 3, buyPrice: 40, sellPrice: 20
  },
  // --- UNCOMMON (5) ---
  roundShield: {
    id: "roundShield", name: "ラウンドシールド", nameEn: "Round Shield",
    description: "丸い形の盾。",
    type: "shield", slot: "shield", rarity: "uncommon",
    def: 5, buyPrice: 150, sellPrice: 75
  },
  basicShield: {
    id: "basicShield", name: "シールド", nameEn: "Shield",
    description: "標準的な盾。",
    type: "shield", slot: "shield", rarity: "uncommon",
    def: 6, buyPrice: 200, sellPrice: 100
  },
  angelicGuard: {
    id: "angelicGuard", name: "エンジェリックガード", nameEn: "Angelic Guard",
    description: "天使の加護がある盾。",
    type: "shield", slot: "shield", rarity: "uncommon",
    def: 3, mdef: 3, buyPrice: 250, sellPrice: 125
  },
  stoneShield: {
    id: "stoneShield", name: "ストーンシールド", nameEn: "Stone Shield",
    description: "石で作られた重い盾。",
    type: "shield", slot: "shield", rarity: "uncommon",
    def: 7, agi: -1, buyPrice: 200, sellPrice: 100
  },
  ironShield: {
    id: "ironShield", name: "アイアンシールド", nameEn: "Iron Shield",
    description: "鉄製の頑丈な盾。",
    type: "shield", slot: "shield", rarity: "uncommon",
    def: 6, vit: 1, buyPrice: 220, sellPrice: 110
  },
  // --- RARE (8) ---
  crossShield: {
    id: "crossShield", name: "クロスシールド", nameEn: "Cross Shield",
    description: "十字架が描かれた盾。",
    type: "shield", slot: "shield", rarity: "rare",
    def: 6, str: 1, buyPrice: 700, sellPrice: 350
  },
  crackedBuckler: {
    id: "crackedBuckler", name: "ひび割れたバックラー", nameEn: "Cracked Buckler",
    description: "古いが素早さを上げる盾。",
    type: "shield", slot: "shield", rarity: "rare",
    def: 5, agi: 2, buyPrice: 600, sellPrice: 300
  },
  exorcismBible: {
    id: "exorcismBible", name: "退魔の聖書", nameEn: "Exorcism Bible",
    description: "魔を祓う力を持つ聖書。",
    type: "shield", slot: "shield", rarity: "rare",
    def: 5, int: 1, setId: "holyKnight", buyPrice: 900, sellPrice: 450
  },
  thornyShield: {
    id: "thornyShield", name: "棘の盾", nameEn: "Thorny Shield",
    description: "棘が生えた攻撃的な盾。攻撃を受けると反撃する。",
    type: "shield", slot: "shield", rarity: "rare",
    def: 6, counterAttack: 15, buyPrice: 800, sellPrice: 400
  },
  mirrorShield: {
    id: "mirrorShield", name: "ミラーシールド", nameEn: "Mirror Shield",
    description: "鏡面の盾。魔法を反射する。",
    type: "shield", slot: "shield", rarity: "rare",
    def: 5, mdef: 8, buyPrice: 900, sellPrice: 450
  },
  stoneBuckler: {
    id: "stoneBuckler", name: "ストーンバックラー", nameEn: "Stone Buckler",
    description: "岩で作られた頑丈なバックラー。",
    type: "shield", slot: "shield", rarity: "rare",
    def: 8, vsBossDamage: 0.10, mdef: 3, buyPrice: 1000, sellPrice: 500
  },
  flameShield: {
    id: "flameShield", name: "フレイムシールド", nameEn: "Flame Shield",
    description: "炎を纏った盾。",
    type: "shield", slot: "shield", rarity: "rare",
    def: 6, setId: "chaos", buyPrice: 900, sellPrice: 450
  },
  veteranShield: {
    id: "veteranShield", name: "ベテランシールド", nameEn: "Veteran Shield",
    description: "歴戦の勇者が使った盾。",
    type: "shield", slot: "shield", rarity: "rare",
    def: 7, vit: 3, maxHp: 100, buyPrice: 1000, sellPrice: 500
  },
  // --- EPIC (6) ---
  bradiumShield: {
    id: "bradiumShield", name: "ブラディウムシールド", nameEn: "Bradium Shield",
    description: "希少金属ブラディウム製の盾。",
    type: "shield", slot: "shield", rarity: "epic",
    def: 5, maxHp: 500, agi: -1, buyPrice: 3000, sellPrice: 1500
  },
  sacredShield: {
    id: "sacredShield", name: "聖なる盾", nameEn: "Sacred Shield",
    description: "聖なる力で守られた盾。",
    type: "shield", slot: "shield", rarity: "epic",
    def: 8, mdef: 15, statusImmune: ["silence"], buyPrice: 3500, sellPrice: 1750
  },
  aegis: {
    id: "aegis", name: "イージス", nameEn: "Aegis",
    description: "神話の盾。敵の攻撃を跳ね返す。",
    type: "shield", slot: "shield", rarity: "epic",
    def: 10, vit: 5, counterAttack: 25, setId: "berserker", buyPrice: 4000, sellPrice: 2000
  },
  phantomShield: {
    id: "phantomShield", name: "ファントムシールド", nameEn: "Phantom Shield",
    description: "幻影の盾。回避に優れる。",
    type: "shield", slot: "shield", rarity: "epic",
    def: 4, flee: 20, doubleStrike: 10, perfectDodge: 5,
    setId: "phantom", buyPrice: 3500, sellPrice: 1750
  },
  darkBarrier: {
    id: "darkBarrier", name: "ダークバリア", nameEn: "Dark Barrier",
    description: "闇の力で作られた障壁。",
    type: "shield", slot: "shield", rarity: "epic",
    def: 6, mdef: 20, maxSp: 100, int: 5, setId: "darkMage", buyPrice: 3500, sellPrice: 1750
  },
  dragonShield: {
    id: "dragonShield", name: "ドラゴンシールド", nameEn: "Dragon Shield",
    description: "竜の鱗で作られた盾。",
    type: "shield", slot: "shield", rarity: "epic",
    def: 9, vsBossDamage: 0.15, vit: 5, maxHp: 200, buyPrice: 4000, sellPrice: 2000
  },
  // --- LEGENDARY (3) ---
  ahuraMazdah: {
    id: "ahuraMazdah", name: "アフラマズダ", nameEn: "Ahura Mazdah",
    description: "神の盾。全ての状態異常を無効化する。",
    type: "shield", slot: "shield", rarity: "legendary", indestructible: true,
    def: 15, str: 10, agi: 10, vit: 10, int: 10, dex: 10, luk: 10, mdef: 30,
    statusImmune: ["bleed", "stun", "blind", "silence", "poison", "sleep"],
    setId: "divine", buyPrice: null, sellPrice: 5000
  },
  valkyrieShield: {
    id: "valkyrieShield", name: "ヴァルキリーシールド", nameEn: "Valkyrie Shield",
    description: "ヴァルキリーが使った神聖な盾。敵の攻撃を確実に跳ね返す。",
    type: "shield", slot: "shield", rarity: "legendary", indestructible: true,
    def: 12, mdef: 20, vit: 10, counterAttack: 40, setId: "valkyrie", buyPrice: null, sellPrice: 5000
  },
  soulEaterShield: {
    id: "soulEaterShield", name: "ソウルイーターシールド", nameEn: "Soul Eater Shield",
    description: "魂を喰らう禍々しい盾。",
    type: "shield", slot: "shield", rarity: "legendary", indestructible: true,
    def: 8, onKillHp: 100, onKillSp: 50, doubleStrike: 15,
    setId: "reaper", buyPrice: null, sellPrice: 5000
  }
};

// ============ ACCESSORIES (25) ============
// Based on RateMyServer Ragnarok Online item database
export const ACCESSORIES = {
  // --- STARTER ACCESSORY ---
  adventurersHeadband: {
    id: "adventurersHeadband", name: "冒険者のヘッドバンド", nameEn: "Adventurer's Headband",
    description: "冒険者の証となるヘッドバンド。",
    type: "accessory", slot: "accessory", rarity: "common",
    def: 5, buyPrice: 0, sellPrice: 15
  },

  // --- COMMON (4) ---
  ring: {
    id: "ring", name: "リング", nameEn: "Ring",
    description: "シンプルな指輪。",
    type: "accessory", slot: "accessory", rarity: "common",
    str: 1, buyPrice: 50, sellPrice: 25
  },
  earring: {
    id: "earring", name: "イヤリング", nameEn: "Earring",
    description: "シンプルなイヤリング。",
    type: "accessory", slot: "accessory", rarity: "common",
    int: 1, buyPrice: 50, sellPrice: 25
  },
  glove: {
    id: "glove", name: "グローブ", nameEn: "Glove",
    description: "シンプルな手袋。",
    type: "accessory", slot: "accessory", rarity: "common",
    dex: 1, buyPrice: 50, sellPrice: 25
  },
  brooch: {
    id: "brooch", name: "ブローチ", nameEn: "Brooch",
    description: "シンプルなブローチ。",
    type: "accessory", slot: "accessory", rarity: "common",
    agi: 1, buyPrice: 50, sellPrice: 25
  },
  // --- UNCOMMON (5) ---
  rosary: {
    id: "rosary", name: "ロザリオ", nameEn: "Rosary",
    description: "祈りの力が宿るロザリオ。",
    type: "accessory", slot: "accessory", rarity: "uncommon",
    luk: 2, mdef: 3, buyPrice: 200, sellPrice: 100
  },
  necklace: {
    id: "necklace", name: "ネックレス", nameEn: "Necklace",
    description: "体力を上げるネックレス。",
    type: "accessory", slot: "accessory", rarity: "uncommon",
    vit: 2, maxHp: 50, buyPrice: 200, sellPrice: 100
  },
  safetyRing: {
    id: "safetyRing", name: "セーフティリング", nameEn: "Safety Ring",
    description: "防御を高める指輪。",
    type: "accessory", slot: "accessory", rarity: "uncommon",
    def: 3, mdef: 3, buyPrice: 300, sellPrice: 150
  },
  leatherBelt: {
    id: "leatherBelt", name: "レザーベルト", nameEn: "Leather Belt",
    description: "丈夫な革のベルト。",
    type: "accessory", slot: "accessory", rarity: "uncommon",
    maxHp: 100, buyPrice: 250, sellPrice: 125
  },
  bronzeMedal: {
    id: "bronzeMedal", name: "ブロンズメダル", nameEn: "Bronze Medal",
    description: "全能力を少し上げるメダル。",
    type: "accessory", slot: "accessory", rarity: "uncommon",
    str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1, buyPrice: 350, sellPrice: 175
  },
  // --- RARE (8) ---
  criticalRing: {
    id: "criticalRing", name: "クリティカルリング", nameEn: "Critical Ring",
    description: "クリティカル率を上げる指輪。",
    type: "accessory", slot: "accessory", rarity: "rare",
    crit: 8, luk: 3, buyPrice: 800, sellPrice: 400
  },
  matyrsLeash: {
    id: "matyrsLeash", name: "マティルのリーシュ", nameEn: "Matyr's Leash",
    description: "素早さと連撃を強化する首輪。",
    type: "accessory", slot: "accessory", rarity: "rare",
    agi: 3, doubleStrike: 8, setId: "speedDemon", buyPrice: 900, sellPrice: 450
  },
  morpheusRing: {
    id: "morpheusRing", name: "モルフェウスリング", nameEn: "Morpheus's Ring",
    description: "夢の神の指輪。",
    type: "accessory", slot: "accessory", rarity: "rare",
    int: 3, maxSp: 50, buyPrice: 800, sellPrice: 400
  },
  warriorsBelt: {
    id: "warriorsBelt", name: "戦士のベルト", nameEn: "Warrior's Belt",
    description: "戦士のためのベルト。",
    type: "accessory", slot: "accessory", rarity: "rare",
    str: 3, vit: 3, buyPrice: 900, sellPrice: 450
  },
  luckyCharm: {
    id: "luckyCharm", name: "ラッキーチャーム", nameEn: "Lucky Charm",
    description: "幸運を呼ぶお守り。",
    type: "accessory", slot: "accessory", rarity: "rare",
    luk: 5, goldFind: 0.10, dropRate: 0.05,
    setId: "treasureHunter", buyPrice: 1000, sellPrice: 500
  },
  amuletOfProtection: {
    id: "amuletOfProtection", name: "守護のアミュレット", nameEn: "Amulet of Protection",
    description: "状態異常への耐性を持つお守り。",
    type: "accessory", slot: "accessory", rarity: "rare",
    def: 5, buyPrice: 900, sellPrice: 450
  },
  counterRing: {
    id: "counterRing", name: "カウンターリング", nameEn: "Counter Ring",
    description: "反撃の力を持つ指輪。",
    type: "accessory", slot: "accessory", rarity: "rare",
    str: 2, setId: "chaos", buyPrice: 800, sellPrice: 400
  },
  blinker: {
    id: "blinker", name: "ブリンカー", nameEn: "Blinker",
    description: "暗闇を無効化する装備。",
    type: "accessory", slot: "accessory", rarity: "rare",
    dex: 3, statusImmune: ["blind"], buyPrice: 800, sellPrice: 400
  },
  // --- EPIC (5) ---
  angelicRing: {
    id: "angelicRing", name: "エンジェリックリング", nameEn: "Angelic Ring",
    description: "天使の力を宿す指輪。",
    type: "accessory", slot: "accessory", rarity: "epic",
    int: 5, dex: 3, mdef: 5, healingBonus: 0.20,
    setId: "holyKnight", buyPrice: 3000, sellPrice: 1500
  },
  lifeLeechRing: {
    id: "lifeLeechRing", name: "ライフリーチリング", nameEn: "Life Leech Ring",
    description: "生命を吸い取る指輪。",
    type: "accessory", slot: "accessory", rarity: "epic",
    onKillHp: 80, vit: 5, buyPrice: 3500, sellPrice: 1750
  },
  assassinsGlove: {
    id: "assassinsGlove", name: "アサシングローブ", nameEn: "Assassin's Glove",
    description: "暗殺者の手袋。クリティカルを強化。",
    type: "accessory", slot: "accessory", rarity: "epic",
    crit: 15, agi: 5, setId: "phantom", buyPrice: 3500, sellPrice: 1750
  },
  thiefsGlove: {
    id: "thiefsGlove", name: "シーフグローブ", nameEn: "Thief's Glove",
    description: "盗賊の手袋。報酬を増やす。",
    type: "accessory", slot: "accessory", rarity: "epic",
    goldFind: 0.25, dropRate: 0.15, xpGain: 0.10,
    setId: "treasureHunter", buyPrice: 4000, sellPrice: 2000
  },
  magesSoul: {
    id: "magesSoul", name: "メイジソウル", nameEn: "Mage's Soul",
    description: "魔道士の魂が宿るアクセサリー。",
    type: "accessory", slot: "accessory", rarity: "epic",
    matk: 30, maxSp: 100, int: 8, setId: "darkMage", buyPrice: 4000, sellPrice: 2000
  },
  // --- LEGENDARY (3) ---
  megingjard: {
    id: "megingjard", name: "メギンギョルド", nameEn: "Megingjard",
    description: "北欧神話の力のベルト。",
    type: "accessory", slot: "accessory", rarity: "legendary", indestructible: true,
    str: 40, vit: 10, maxHp: 300, setId: "berserker", buyPrice: null, sellPrice: 5000
  },
  brisingamen: {
    id: "brisingamen", name: "ブリーシンガメン", nameEn: "Brisingamen",
    description: "北欧神話の女神のネックレス。",
    type: "accessory", slot: "accessory", rarity: "legendary", indestructible: true,
    str: 8, agi: 8, vit: 8, int: 8, dex: 8, luk: 8, mdef: 10,
    setId: "divine", buyPrice: null, sellPrice: 5000
  },
  soulRing: {
    id: "soulRing", name: "ソウルリング", nameEn: "Soul Ring",
    description: "魂を捧げる力を持つ指輪。",
    type: "accessory", slot: "accessory", rarity: "legendary", indestructible: true,
    onKillHp: 100, onKillSp: 100, atk: 20, matk: 20,
    setId: "reaper", buyPrice: null, sellPrice: 5000
  }
};

