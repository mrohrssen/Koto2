import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { getAreaById } from '../rooms.js';
import { SPRITE_VERSION } from '../../shared/asset-versions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const allCreatures = JSON.parse(readFileSync(join(__dirname, '../../../data/creatures.json'), 'utf8'));
const allItems = JSON.parse(readFileSync(join(__dirname, '../../../data/items.json'), 'utf8'));
const allMoves = JSON.parse(readFileSync(join(__dirname, '../../../data/moves.json'), 'utf8'));

function versionedSpriteUrl(path) {
  return `/assets/sprites/${path}.webp?v=${SPRITE_VERSION}`;
}

function reachedAreaIds(run = {}) {
  return [...new Set([...(run.areaPath || []), run.currentArea?.id].filter(Boolean))];
}

/**
 * Build the complete Whack-a-Mole content pool for the run's reached areas.
 *
 * Ordering is intentionally stable. WhackAMoleGame randomizes its board/targets
 * locally; shuffling the capability payload here would make runway rebuilds and
 * the legacy route disagree about what the server prepared.
 */
export function buildWhackAMolePool(run = {}) {
  const areaIds = reachedAreaIds(run);
  const areaCreatureIds = new Set();
  for (const areaId of areaIds) {
    const area = getAreaById(areaId);
    for (const creatureId of area?.creatures || []) areaCreatureIds.add(creatureId);
  }

  const filteredCreatures = areaCreatureIds.size > 0
    ? allCreatures.filter(creature => areaCreatureIds.has(creature.id))
    : allCreatures;
  const creaturePool = filteredCreatures.map(creature => ({
    id: creature.id,
    type: 'creature',
    creatureId: creature.id,
    word: creature.name,
    reading: creature.reading || creature.name,
    meaning: creature.meaning || creature.nameEn,
    element: creature.element || '',
    sprite: versionedSpriteUrl(`creatures/${creature.id}`),
  }));

  const filteredItems = areaIds.length > 0
    ? allItems.filter(item => !item.area || areaIds.includes(item.area))
    : allItems;
  const itemPool = filteredItems.map(item => ({
    id: item.id,
    type: 'item',
    itemId: item.id,
    word: item.word,
    reading: item.reading,
    meaning: item.meaning,
    sprite: versionedSpriteUrl(`items/${item.id}`),
  }));

  const areaMoveIds = new Set();
  for (const creature of filteredCreatures) {
    for (const entry of creature.learnset || []) areaMoveIds.add(entry.moveId);
  }
  const filteredMoves = areaMoveIds.size > 0
    ? allMoves.filter(move => areaMoveIds.has(move.id))
    : allMoves;
  const skillPool = filteredMoves.map(move => {
    const actionSlug = (move.nameEn || '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    return {
      id: `move-${move.id}`,
      type: 'skill',
      actionSlug,
      word: move.name,
      reading: move.reading,
      meaning: move.nameEn || move.name,
      sprite: versionedSpriteUrl(`actions/${actionSlug}`),
    };
  });

  return [...creaturePool, ...itemPool, ...skillPool];
}
