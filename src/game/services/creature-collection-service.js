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

export function validateTeamSelection(collection, selectedIds, creatureCounts = null) {
  if (!selectedIds || selectedIds.length === 0) {
    return { valid: false, reason: 'Select at least 1 creature' };
  }

  for (const id of selectedIds) {
    if (!collection.includes(id)) {
      return { valid: false, reason: `${id} not in collection` };
    }
    if (creatureCounts != null && getCreatureCount(creatureCounts, id) <= 0) {
      return { valid: false, reason: `${id} has no owned copies` };
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

function normalizeCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function ensureCreatureCounts(meta) {
  if (!meta || typeof meta !== 'object') return {};
  if (!Array.isArray(meta.creatureCollection)) meta.creatureCollection = [...DEFAULT_COLLECTION];
  if (!meta.creatureCounts || typeof meta.creatureCounts !== 'object' || Array.isArray(meta.creatureCounts)) {
    meta.creatureCounts = {};
  }

  for (const id of Object.keys(meta.creatureCounts)) {
    if (!CREATURES_BY_ID[id]) {
      delete meta.creatureCounts[id];
      continue;
    }
    meta.creatureCounts[id] = normalizeCount(meta.creatureCounts[id]);
  }

  for (const id of meta.creatureCollection) {
    if (CREATURES_BY_ID[id] && meta.creatureCounts[id] === undefined) {
      meta.creatureCounts[id] = 1;
    }
  }

  for (const id of DEFAULT_COLLECTION) {
    if (!meta.creatureCollection.includes(id)) meta.creatureCollection.push(id);
    if (meta.creatureCounts[id] === undefined) meta.creatureCounts[id] = 1;
  }

  return meta.creatureCounts;
}

export function getCreatureCount(metaOrCounts, creatureId) {
  const counts = metaOrCounts?.creatureCounts || metaOrCounts || {};
  return normalizeCount(counts[creatureId]);
}

export function addCreatureCopy(meta, creatureId, amount = 1) {
  if (!CREATURES_BY_ID[creatureId]) {
    throw new Error(`Unknown creature: ${creatureId}`);
  }
  ensureCreatureCounts(meta);
  const addAmount = normalizeCount(amount);
  const discovery = addToCollection(meta.creatureCollection, creatureId);
  meta.creatureCounts[creatureId] = getCreatureCount(meta, creatureId) + addAmount;
  return { addedDiscovery: discovery.added, count: meta.creatureCounts[creatureId] };
}

export function countRequirements(ids) {
  const byId = new Map();
  for (const id of ids || []) {
    byId.set(id, (byId.get(id) || 0) + 1);
  }
  return [...byId.entries()].map(([id, required]) => ({ id, required }));
}

export function consumeCreatureCopies(meta, requirements) {
  ensureCreatureCounts(meta);
  const normalized = requirements.map(req => ({
    id: req.id,
    required: normalizeCount(req.required)
  })).filter(req => req.required > 0);

  const missing = normalized
    .map(req => {
      const owned = getCreatureCount(meta, req.id);
      return { id: req.id, required: req.required, owned, missing: Math.max(0, req.required - owned) };
    })
    .filter(req => req.missing > 0);

  if (missing.length > 0) {
    return { success: false, missing };
  }

  const consumed = normalized.map(req => {
    const ownedBefore = getCreatureCount(meta, req.id);
    const ownedAfter = ownedBefore - req.required;
    meta.creatureCounts[req.id] = ownedAfter;
    return { id: req.id, required: req.required, ownedBefore, ownedAfter };
  });

  return { success: true, consumed };
}

export function getCollectionCatalog(collection, befriendCount = {}, creatureCounts = {}) {
  return CREATURE_DATA.map(r => {
    const ownedCount = getCreatureCount(creatureCounts, r.id);
    return {
      id: r.id,
      name: r.name,
      nameEn: r.nameEn,
      element: r.element,
      rarity: r.rarity,
      baseHp: r.baseHp,
      baseAttack: r.baseAttack,
      baseDefense: r.baseDefense,
      baseMp: r.baseMp,
      archetype: r.archetype,
      area: r.area,
      reading: r.reading || r.baseReading,
      meaning: r.meaning || r.baseMeaning,
      rank: r.rank ?? r.baseRank ?? null,
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
      owned: collection.includes(r.id) && ownedCount > 0,
      discovered: collection.includes(r.id),
      ownedCount,
      befriendCount: befriendCount[r.id] || 0
    };
  });
}
