/**
 * @fileoverview Crest meta-progression service
 *
 * Handles crest generation (gacha), chest opening, equip/unequip,
 * and multiplier calculation. Pure functions — no side effects.
 */

import { randomBytes } from 'crypto';

const VALID_ELEMENTS = ['fire', 'water', 'earth', 'wood', 'metal'];

export const ELEMENT_STAT_MAP = {
  fire:  'attack',
  water: 'mp',
  wood:  'hp',
  earth: 'defense',
  metal: 'xp'
};

export const RARITY_RANGES = {
  common:    { min: 0.03, max: 0.05 },
  uncommon:  { min: 0.06, max: 0.10 },
  rare:      { min: 0.11, max: 0.18 },
  epic:      { min: 0.19, max: 0.28 },
  legendary: { min: 0.29, max: 0.40 }
};

export const CHEST_DROP_RATES = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1
};

const CHEST_COST = 3;

function rollRarity() {
  const total = Object.values(CHEST_DROP_RATES).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [rarity, weight] of Object.entries(CHEST_DROP_RATES)) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return 'common';
}

export function generateCrest(element) {
  if (!VALID_ELEMENTS.includes(element)) {
    throw new Error(`Invalid element: ${element}`);
  }
  const rarity = rollRarity();
  const range = RARITY_RANGES[rarity];
  const value = Math.round((range.min + Math.random() * (range.max - range.min)) * 100) / 100;
  const suffix = randomBytes(3).toString('hex');
  return {
    id: `crest_${element}_${suffix}`,
    element,
    rarity,
    stat: ELEMENT_STAT_MAP[element],
    value
  };
}

export function openChest(meta, element) {
  if (!VALID_ELEMENTS.includes(element)) {
    return { success: false, error: `Invalid element: ${element}` };
  }
  const drops = meta.elementDrops?.[element] || 0;
  if (drops < CHEST_COST) {
    return { success: false, error: 'Not enough element drops' };
  }
  meta.elementDrops[element] -= CHEST_COST;
  const crest = generateCrest(element);
  if (!meta.crests) meta.crests = [];
  meta.crests.push(crest);
  return { success: true, crest };
}

export function equipCrest(meta, crestId) {
  const crest = (meta.crests || []).find(c => c.id === crestId);
  if (!crest) return { success: false, error: 'Crest not found' };
  if (!meta.equippedCrests) {
    meta.equippedCrests = { fire: null, water: null, earth: null, wood: null, metal: null };
  }
  meta.equippedCrests[crest.element] = crestId;
  return { success: true };
}

export function unequipCrest(meta, element) {
  if (!meta.equippedCrests) {
    meta.equippedCrests = { fire: null, water: null, earth: null, wood: null, metal: null };
  }
  meta.equippedCrests[element] = null;
  return { success: true };
}

export function getCrestMultipliers(meta) {
  const result = { hpMult: 1.0, atkMult: 1.0, mpMult: 1.0, defMult: 1.0, xpMult: 1.0 };
  if (!meta?.equippedCrests) return result;
  const crests = meta.crests || [];
  const equipped = meta.equippedCrests;
  for (const element of VALID_ELEMENTS) {
    const crestId = equipped[element];
    if (!crestId) continue;
    const crest = crests.find(c => c.id === crestId);
    if (!crest) continue;
    switch (crest.stat) {
      case 'attack':  result.atkMult += crest.value; break;
      case 'mp':      result.mpMult += crest.value; break;
      case 'hp':      result.hpMult += crest.value; break;
      case 'defense': result.defMult += crest.value; break;
      case 'xp':      result.xpMult += crest.value; break;
    }
  }
  return result;
}

export function getCrestState(meta) {
  return {
    elementDrops: meta.elementDrops || { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
    crests: meta.crests || [],
    equippedCrests: meta.equippedCrests || { fire: null, water: null, earth: null, wood: null, metal: null }
  };
}

export function applyCrestBonuses(creature, mults) {
  if (!creature || !mults) return;
  if (mults.hpMult > 1) {
    creature.maxHp = Math.floor(creature.maxHp * mults.hpMult);
    creature.hp = creature.maxHp;
  }
  if (mults.atkMult > 1) {
    creature.attack = Math.floor(creature.attack * mults.atkMult);
  }
  if (mults.mpMult > 1) {
    creature.maxMp = Math.floor(creature.maxMp * mults.mpMult);
    creature.mp = creature.maxMp;
  }
  if (mults.defMult > 1) {
    creature.defense = Math.max(1, Math.round(creature.defense * mults.defMult));
  }
}

export { CHEST_COST };
