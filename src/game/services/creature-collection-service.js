import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREATURE_DATA = JSON.parse(readFileSync(join(__dirname, '../../../data/creatures.json'), 'utf8'));
const CREATURES_BY_ID = Object.fromEntries(CREATURE_DATA.map(r => [r.id, r]));
const MOVES_DATA = JSON.parse(readFileSync(join(__dirname, '../../../data/moves.json'), 'utf8'));
const MOVES_BY_ID = Object.fromEntries(MOVES_DATA.map(m => [m.id, m]));

export const RARITY_POINT_COST = {
  common: 3,
  uncommon: 4,
  rare: 6,
  epic: 7,
  legendary: 8
};

export const MAX_TEAM_POINTS = 10;

export const DEFAULT_COLLECTION = ['hikaribon', 'hanatchi', 'tsukimochi'];

export function validateTeamSelection(collection, selectedIds) {
  if (!selectedIds || selectedIds.length === 0) {
    return { valid: false, reason: 'Select at least 1 creature' };
  }

  for (const id of selectedIds) {
    if (!collection.includes(id)) {
      return { valid: false, reason: `${id} not in collection` };
    }
  }

  let totalCost = 0;
  for (const id of selectedIds) {
    const creature = CREATURES_BY_ID[id];
    if (!creature) {
      return { valid: false, reason: `Unknown creature: ${id}` };
    }
    totalCost += RARITY_POINT_COST[creature.rarity] || 3;
  }

  if (totalCost > MAX_TEAM_POINTS) {
    return { valid: false, reason: `Selection exceeds point budget (${totalCost}/${MAX_TEAM_POINTS})` };
  }

  return { valid: true, totalCost };
}

export function addToCollection(collection, creatureId) {
  if (collection.includes(creatureId)) {
    return { added: false, collection };
  }
  collection.push(creatureId);
  return { added: true, collection };
}

export function getCollectionCatalog(collection, befriendCount = {}) {
  return CREATURE_DATA.map(r => ({
    id: r.id,
    name: r.name,
    nameEn: r.nameEn,
    element: r.element,
    rarity: r.rarity,
    baseHp: r.baseHp,
    baseAttack: r.baseAttack,
    baseMp: r.baseMp,
    archetype: r.archetype,
    area: r.area,
    baseWord: r.baseWord,
    baseMeaning: r.baseMeaning,
    modifier: r.modifier || null,
    autoSkill: r.autoSkill,
    learnset: (r.learnset || []).map(entry => ({
      level: entry.level,
      moveId: entry.moveId,
      nameEn: MOVES_BY_ID[entry.moveId]?.nameEn || entry.moveId,
      name: MOVES_BY_ID[entry.moveId]?.name || '',
      element: MOVES_BY_ID[entry.moveId]?.element || 'neutral'
    })),
    pointCost: RARITY_POINT_COST[r.rarity] || 3,
    owned: collection.includes(r.id),
    befriendCount: befriendCount[r.id] || 0
  }));
}
