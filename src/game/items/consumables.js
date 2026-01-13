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
