// Skills and Magic Abilities
// ============ SKILLS ============
// Updated to use SP instead of MP
export const SKILLS = {
  // Basic attack (everyone has this)
  strike: {
    id: "strike",
    name: "攻撃",
    nameEn: "Strike",
    description: "通常攻撃。",
    type: "physical",
    spCost: 0,
    power: 1.0,
    target: "enemy"
  },

  // Physical skills
  powerStrike: {
    id: "powerStrike",
    name: "強撃",
    nameEn: "Power Strike",
    description: "力を込めた強い攻撃。",
    type: "physical",
    spCost: 8,
    power: 1.5,
    target: "enemy"
  },

  doubleSlash: {
    id: "doubleSlash",
    name: "二連斬り",
    nameEn: "Double Slash",
    description: "素早く二回斬りつける。",
    type: "physical",
    spCost: 12,
    power: 0.8,
    hits: 2,
    target: "enemy"
  },

  crushingBlow: {
    id: "crushingBlow",
    name: "粉砕撃",
    nameEn: "Crushing Blow",
    description: "防御を無視する強力な一撃。",
    type: "physical",
    spCost: 20,
    power: 2.0,
    ignoreDefense: 0.5,
    target: "enemy"
  },

  // Magic skills (power is MATK multiplier)
  fire: {
    id: "fire",
    name: "ファイア",
    nameEn: "Fire",
    description: "炎の魔法で攻撃する。",
    type: "magic",
    element: "fire",
    spCost: 8,
    power: 1.2,
    target: "enemy"
  },

  firaga: {
    id: "firaga",
    name: "ファイガ",
    nameEn: "Firaga",
    description: "強力な炎の魔法。",
    type: "magic",
    element: "fire",
    spCost: 20,
    power: 2.5,
    target: "enemy"
  },

  ice: {
    id: "ice",
    name: "ブリザド",
    nameEn: "Blizzard",
    description: "氷の魔法で攻撃する。",
    type: "magic",
    element: "ice",
    spCost: 8,
    power: 1.2,
    target: "enemy"
  },

  thunder: {
    id: "thunder",
    name: "サンダー",
    nameEn: "Thunder",
    description: "雷の魔法で攻撃する。",
    type: "magic",
    element: "thunder",
    spCost: 8,
    power: 1.2,
    target: "enemy"
  },

  // Healing skills (power is base heal + MATK scaling)
  heal: {
    id: "heal",
    name: "ヒール",
    nameEn: "Heal",
    description: "HPを回復する。",
    type: "healing",
    spCost: 12,
    power: 50,
    target: "self"
  },

  fullHeal: {
    id: "fullHeal",
    name: "フルヒール",
    nameEn: "Full Heal",
    description: "HPを大幅に回復する。",
    type: "healing",
    spCost: 30,
    power: 150,
    target: "self"
  },

  // Buff skills
  protect: {
    id: "protect",
    name: "プロテス",
    nameEn: "Protect",
    description: "防御力を一時的に上げる。",
    type: "buff",
    spCost: 10,
    effect: "def",
    amount: 20,
    turns: 3,
    target: "self"
  },

  haste: {
    id: "haste",
    name: "ヘイスト",
    nameEn: "Haste",
    description: "素早さを一時的に上げる。",
    type: "buff",
    spCost: 12,
    effect: "agi",
    amount: 10,
    turns: 3,
    target: "self"
  },

  bless: {
    id: "bless",
    name: "ブレス",
    nameEn: "Bless",
    description: "命中率とクリティカル率を上げる。",
    type: "buff",
    spCost: 15,
    effect: "hit",
    amount: 30,
    turns: 3,
    target: "self"
  }
};

