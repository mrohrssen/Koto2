// Consumables and Stat Crystals
// Item and Skill Definitions
// Updated for iRO 6-stat system

// ============ CONSUMABLE ITEMS ============
export const CONSUMABLES = {
  potion: {
    id: "potion",
    name: "回復薬",
    nameEn: "Potion",
    description: "HPを50回復する。",
    type: "consumable",
    effect: "heal",
    power: 50,
    target: "self",
    buyPrice: 50,
    sellPrice: 25
  },

  highPotion: {
    id: "highPotion",
    name: "上級回復薬",
    nameEn: "High Potion",
    description: "HPを120回復する。",
    type: "consumable",
    effect: "heal",
    power: 120,
    target: "self",
    buyPrice: 150,
    sellPrice: 75
  },

  fullPotion: {
    id: "fullPotion",
    name: "完全回復薬",
    nameEn: "Full Potion",
    description: "HPを完全に回復する。",
    type: "consumable",
    effect: "fullHeal",
    target: "self",
    buyPrice: 500,
    sellPrice: 250
  },

  ether: {
    id: "ether",
    name: "エーテル",
    nameEn: "Ether",
    description: "SPを20回復する。",
    type: "consumable",
    effect: "restoreSp",
    power: 20,
    target: "self",
    buyPrice: 80,
    sellPrice: 40
  },

  highEther: {
    id: "highEther",
    name: "上級エーテル",
    nameEn: "High Ether",
    description: "SPを50回復する。",
    type: "consumable",
    effect: "restoreSp",
    power: 50,
    target: "self",
    buyPrice: 200,
    sellPrice: 100
  },

  elixir: {
    id: "elixir",
    name: "エリクサー",
    nameEn: "Elixir",
    description: "HPとSPを完全に回復する。",
    type: "consumable",
    effect: "fullRestore",
    target: "self",
    buyPrice: 1000,
    sellPrice: 500
  },

  antidote: {
    id: "antidote",
    name: "解毒剤",
    nameEn: "Antidote",
    description: "毒状態を治す。",
    type: "consumable",
    effect: "cure",
    cures: ["poisoned"],
    target: "self",
    buyPrice: 30,
    sellPrice: 15
  },

  smokeBomb: {
    id: "smokeBomb",
    name: "煙玉",
    nameEn: "Smoke Bomb",
    description: "戦闘から確実に逃げられる。",
    type: "consumable",
    effect: "flee",
    power: 100,
    target: "self",
    buyPrice: 100,
    sellPrice: 50
  },

  fireScroll: {
    id: "fireScroll",
    name: "炎の巻物",
    nameEn: "Fire Scroll",
    description: "敵に40の炎ダメージを与える。",
    type: "consumable",
    effect: "damage",
    power: 40,
    element: "fire",
    target: "enemy",
    buyPrice: 120,
    sellPrice: 60
  },

  iceScroll: {
    id: "iceScroll",
    name: "氷の巻物",
    nameEn: "Ice Scroll",
    description: "敵に40の氷ダメージを与える。",
    type: "consumable",
    effect: "damage",
    power: 40,
    element: "ice",
    target: "enemy",
    buyPrice: 120,
    sellPrice: 60
  },

  thunderScroll: {
    id: "thunderScroll",
    name: "雷の巻物",
    nameEn: "Thunder Scroll",
    description: "敵に40の雷ダメージを与える。",
    type: "consumable",
    effect: "damage",
    power: 40,
    element: "thunder",
    target: "enemy",
    buyPrice: 120,
    sellPrice: 60
  },

  // ============ RARE CONSUMABLES ============

  phoenixDown: {
    id: "phoenixDown",
    name: "フェニックスの羽",
    nameEn: "Phoenix Down",
    description: "死んでも一度だけ復活できる。",
    type: "consumable",
    effect: "autoRevive",
    power: 50,
    target: "self",
    rarity: "rare",
    buyPrice: 800,
    sellPrice: 400
  },

  ariadneThread: {
    id: "ariadneThread",
    name: "アリアドネの糸",
    nameEn: "Ariadne Thread",
    description: "ダンジョンを脱出し、全てのアイテムを持ち帰る。",
    type: "consumable",
    effect: "escape",
    target: "self",
    rarity: "rare",
    buyPrice: 500,
    sellPrice: 250
  },

  megaElixir: {
    id: "megaElixir",
    name: "メガエリクサー",
    nameEn: "Mega Elixir",
    description: "HPSP完全回復、状態異常も治す。",
    type: "consumable",
    effect: "megaRestore",
    target: "self",
    rarity: "epic",
    buyPrice: 2000,
    sellPrice: 1000
  },

  warpStone: {
    id: "warpStone",
    name: "転移石",
    nameEn: "Warp Stone",
    description: "次の階へワープする。",
    type: "consumable",
    effect: "warp",
    target: "self",
    rarity: "rare",
    buyPrice: 600,
    sellPrice: 300
  },

  // ============ STAT BOOSTERS (PERMANENT - Using iRO stats) ============

  strManual: {
    id: "strManual",
    name: "STRマニュアル",
    nameEn: "STR Manual",
    description: "STRが永久に+1上がる。",
    type: "consumable",
    effect: "statBoost",
    stat: "str",
    amount: 1,
    target: "self",
    rarity: "epic",
    buyPrice: null,
    sellPrice: 1500
  },

  agiManual: {
    id: "agiManual",
    name: "AGIマニュアル",
    nameEn: "AGI Manual",
    description: "AGIが永久に+1上がる。",
    type: "consumable",
    effect: "statBoost",
    stat: "agi",
    amount: 1,
    target: "self",
    rarity: "epic",
    buyPrice: null,
    sellPrice: 1500
  },

  vitManual: {
    id: "vitManual",
    name: "VITマニュアル",
    nameEn: "VIT Manual",
    description: "VITが永久に+1上がる。",
    type: "consumable",
    effect: "statBoost",
    stat: "vit",
    amount: 1,
    target: "self",
    rarity: "epic",
    buyPrice: null,
    sellPrice: 1500
  },

  intManual: {
    id: "intManual",
    name: "INTマニュアル",
    nameEn: "INT Manual",
    description: "INTが永久に+1上がる。",
    type: "consumable",
    effect: "statBoost",
    stat: "int",
    amount: 1,
    target: "self",
    rarity: "epic",
    buyPrice: null,
    sellPrice: 1500
  },

  dexManual: {
    id: "dexManual",
    name: "DEXマニュアル",
    nameEn: "DEX Manual",
    description: "DEXが永久に+1上がる。",
    type: "consumable",
    effect: "statBoost",
    stat: "dex",
    amount: 1,
    target: "self",
    rarity: "epic",
    buyPrice: null,
    sellPrice: 1500
  },

  lukManual: {
    id: "lukManual",
    name: "LUKマニュアル",
    nameEn: "LUK Manual",
    description: "LUKが永久に+1上がる。",
    type: "consumable",
    effect: "statBoost",
    stat: "luk",
    amount: 1,
    target: "self",
    rarity: "epic",
    buyPrice: null,
    sellPrice: 1500
  }
};

// ============ STAT CRYSTALS ============
// Passive items that grant stat bonuses while held in inventory
export const STAT_CRYSTALS = {
  crystalOfPower: {
    id: "crystalOfPower",
    name: "力の結晶",
    nameEn: "Crystal of Power",
    description: "秘められた力が宿る結晶。所持しているだけでSTR+5。",
    type: "crystal",
    rarity: "uncommon",
    passive: { str: 5 },
    buyPrice: 50,
    sellPrice: 25
  },
  galeFeather: {
    id: "galeFeather",
    name: "疾風の羽",
    nameEn: "Gale Feather",
    description: "風の精霊が残した羽。所持しているだけでAGI+5。",
    type: "crystal",
    rarity: "uncommon",
    passive: { agi: 5 },
    buyPrice: 50,
    sellPrice: 25
  },
  ironHeartStone: {
    id: "ironHeartStone",
    name: "鉄心石",
    nameEn: "Iron Heart Stone",
    description: "不屈の意志を宿す石。所持しているだけでVIT+5。",
    type: "crystal",
    rarity: "uncommon",
    passive: { vit: 5 },
    buyPrice: 50,
    sellPrice: 25
  },
  sagesPrism: {
    id: "sagesPrism",
    name: "賢者の霊晶",
    nameEn: "Sage's Prism",
    description: "古代の知恵が凝縮された霊晶。所持しているだけでINT+5。",
    type: "crystal",
    rarity: "uncommon",
    passive: { int: 5 },
    buyPrice: 50,
    sellPrice: 25
  },
  hawksEyeGem: {
    id: "hawksEyeGem",
    name: "鷹眼石",
    nameEn: "Hawk's Eye Gem",
    description: "鷹の如き精密さを与える宝石。所持しているだけでDEX+5。",
    type: "crystal",
    rarity: "uncommon",
    passive: { dex: 5 },
    buyPrice: 50,
    sellPrice: 25
  },
  fateFragment: {
    id: "fateFragment",
    name: "運命の欠片",
    nameEn: "Fate Fragment",
    description: "幸運を呼び寄せる不思議な欠片。所持しているだけでLUK+5。",
    type: "crystal",
    rarity: "uncommon",
    passive: { luk: 5 },
    buyPrice: 50,
    sellPrice: 25
  },

  // --- TIER 2: +10 stat, 125 gold ---
  orbOfMight: {
    id: "orbOfMight",
    name: "豪力の宝珠",
    nameEn: "Orb of Might",
    description: "戦神の力を秘めた宝珠。所持しているだけでSTR+10。",
    type: "crystal",
    rarity: "rare",
    passive: { str: 10 },
    buyPrice: 125,
    sellPrice: 60
  },
  wingsOfSwiftness: {
    id: "wingsOfSwiftness",
    name: "神速の翼",
    nameEn: "Wings of Swiftness",
    description: "風神が授けし翼。所持しているだけでAGI+10。",
    type: "crystal",
    rarity: "rare",
    passive: { agi: 10 },
    buyPrice: 125,
    sellPrice: 60
  },
  immortalCore: {
    id: "immortalCore",
    name: "不滅の魂核",
    nameEn: "Immortal Core",
    description: "永遠の命を宿す核。所持しているだけでVIT+10。",
    type: "crystal",
    rarity: "rare",
    passive: { vit: 10 },
    buyPrice: 125,
    sellPrice: 60
  },
  arcaneWisdomStone: {
    id: "arcaneWisdomStone",
    name: "叡智の秘石",
    nameEn: "Arcane Wisdom Stone",
    description: "太古の知識が封じられた秘石。所持しているだけでINT+10。",
    type: "crystal",
    rarity: "rare",
    passive: { int: 10 },
    buyPrice: 125,
    sellPrice: 60
  },
  orbOfClairvoyance: {
    id: "orbOfClairvoyance",
    name: "千里眼の珠",
    nameEn: "Orb of Clairvoyance",
    description: "遥か彼方まで見通す珠。所持しているだけでDEX+10。",
    type: "crystal",
    rarity: "rare",
    passive: { dex: 10 },
    buyPrice: 125,
    sellPrice: 60
  },
  celestialTalisman: {
    id: "celestialTalisman",
    name: "天運の護符",
    nameEn: "Celestial Talisman",
    description: "天が与えし幸運の護符。所持しているだけでLUK+10。",
    type: "crystal",
    rarity: "rare",
    passive: { luk: 10 },
    buyPrice: 125,
    sellPrice: 60
  },

  // --- TIER 3: +15 stat, 300 gold ---
  heartOfTheConqueror: {
    id: "heartOfTheConqueror",
    name: "覇王の心臓",
    nameEn: "Heart of the Conqueror",
    description: "覇王の魂が宿る伝説の心臓。所持しているだけでSTR+15。",
    type: "crystal",
    rarity: "epic",
    passive: { str: 15 },
    buyPrice: 300,
    sellPrice: 150
  },
  soulOfLightning: {
    id: "soulOfLightning",
    name: "閃光の魂",
    nameEn: "Soul of Lightning",
    description: "雷光を纏う神速の魂。所持しているだけでAGI+15。",
    type: "crystal",
    rarity: "epic",
    passive: { agi: 15 },
    buyPrice: 300,
    sellPrice: 150
  },
  phoenixCore: {
    id: "phoenixCore",
    name: "不死鳥の核",
    nameEn: "Phoenix Core",
    description: "不死鳥の生命力を秘めた核。所持しているだけでVIT+15。",
    type: "crystal",
    rarity: "epic",
    passive: { vit: 15 },
    buyPrice: 300,
    sellPrice: 150
  },
  crystalOfOmniscience: {
    id: "crystalOfOmniscience",
    name: "全知の結晶",
    nameEn: "Crystal of Omniscience",
    description: "全ての知識を内包する究極の結晶。所持しているだけでINT+15。",
    type: "crystal",
    rarity: "epic",
    passive: { int: 15 },
    buyPrice: 300,
    sellPrice: 150
  },
  divineEyeJewel: {
    id: "divineEyeJewel",
    name: "神眼の宝玉",
    nameEn: "Divine Eye Jewel",
    description: "神の視界を授ける宝玉。所持しているだけでDEX+15。",
    type: "crystal",
    rarity: "epic",
    passive: { dex: 15 },
    buyPrice: 300,
    sellPrice: 150
  },
  blessingOfTheStars: {
    id: "blessingOfTheStars",
    name: "星辰の加護",
    nameEn: "Blessing of the Stars",
    description: "星々が祝福する究極の幸運。所持しているだけでLUK+15。",
    type: "crystal",
    rarity: "epic",
    passive: { luk: 15 },
    buyPrice: 300,
    sellPrice: 150
  }
};
