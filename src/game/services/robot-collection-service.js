import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROBOT_DATA = JSON.parse(readFileSync(join(__dirname, '../../../data/robots.json'), 'utf8'));
const ROBOTS_BY_ID = Object.fromEntries(ROBOT_DATA.map(r => [r.id, r]));

export const RARITY_POINT_COST = {
  common: 3,
  uncommon: 4,
  rare: 6,
  epic: 7,
  legendary: 8
};

export const MAX_TEAM_POINTS = 10;

export const DEFAULT_COLLECTION = ['fire-common', 'water-common', 'wood-common'];

export function validateTeamSelection(collection, selectedIds) {
  if (!selectedIds || selectedIds.length === 0) {
    return { valid: false, reason: 'Select at least 1 robot' };
  }

  for (const id of selectedIds) {
    if (!collection.includes(id)) {
      return { valid: false, reason: `${id} not in collection` };
    }
  }

  let totalCost = 0;
  for (const id of selectedIds) {
    const robot = ROBOTS_BY_ID[id];
    if (!robot) {
      return { valid: false, reason: `Unknown robot: ${id}` };
    }
    totalCost += RARITY_POINT_COST[robot.rarity] || 3;
  }

  if (totalCost > MAX_TEAM_POINTS) {
    return { valid: false, reason: `Selection exceeds point budget (${totalCost}/${MAX_TEAM_POINTS})` };
  }

  return { valid: true, totalCost };
}

export function addToCollection(collection, robotId) {
  if (collection.includes(robotId)) {
    return { added: false, collection };
  }
  collection.push(robotId);
  return { added: true, collection };
}

export function getCollectionCatalog(collection) {
  return ROBOT_DATA.map(r => ({
    id: r.id,
    name: r.name,
    nameEn: r.nameEn,
    element: r.element,
    rarity: r.rarity,
    baseHp: r.baseHp,
    baseAttack: r.baseAttack,
    autoSkill: r.autoSkill,
    ultimate: { name: r.ultimate.name, nameEn: r.ultimate.nameEn },
    pointCost: RARITY_POINT_COST[r.rarity] || 3,
    owned: collection.includes(r.id)
  }));
}
