import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const creatures = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/creatures.json'), 'utf8'));
const moves = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/moves.json'), 'utf8'));
const areas = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/areas.json'), 'utf8'));

const EXPANSION_DATE = '2026-05-06';
const EXPECTED_NEW_CREATURE_COUNT = 54;
const ALLOWED_AREA_PLACEMENTS = new Set([
  'school:yousei',
  'school:boss:hanano-yousei',
  'morning-ranch:hikari',
  'morning-ranch:uma',
  'morning-ranch:tsuchi',
  'morning-ranch:ushi',
  'morning-ranch:buta',
  'morning-ranch:hitsuji',
  'morning-ranch:nezumi',
  'morning-ranch:kaeru',
  'morning-ranch:boss:hikarino-uma'
]);

const movesById = new Map(moves.map(move => [move.id, move]));
const newCreatures = creatures.filter(creature => creature.createdAt === EXPANSION_DATE);
const newMoves = moves.filter(move => move.createdAt === EXPANSION_DATE);

function allLearnedMoveIds() {
  const ids = new Set();
  for (const creature of creatures) {
    for (const entry of creature.learnset || []) {
      ids.add(entry.moveId);
    }
  }
  return ids;
}

function isCleanseMove(move) {
  return move?.statusEffect === 'cleanse';
}

describe('creature and move expansion data', () => {
  it('adds the approved 2026-05-06 creature roster', () => {
    assert.equal(newCreatures.length, EXPECTED_NEW_CREATURE_COUNT);
  });

  it('new creatures use name-centric vocabulary identity fields', () => {
    const invalid = newCreatures
      .filter(creature =>
        typeof creature.name !== 'string' ||
        typeof creature.nameEn !== 'string' ||
        typeof creature.reading !== 'string' ||
        typeof creature.meaning !== 'string' ||
        (typeof creature.rank !== 'number' && creature.rank !== null)
      )
      .map(creature => creature.id);

    assert.deepEqual(invalid, []);
  });

  it('only places approved new creatures in area pools', () => {
    const newIds = new Set(newCreatures.map(creature => creature.id));
    const placed = [];

    for (const area of areas) {
      for (const creatureId of area.creatures || []) {
        if (newIds.has(creatureId)) {
          placed.push(`${area.id}:${creatureId}`);
        }
      }
      if (area.bossCreatureId && newIds.has(area.bossCreatureId)) {
        placed.push(`${area.id}:boss:${area.bossCreatureId}`);
      }
    }

    assert.deepEqual(placed.filter(entry => !ALLOWED_AREA_PLACEMENTS.has(entry)), []);
  });

  it('every imported move is used by at least one creature learnset', () => {
    const learned = allLearnedMoveIds();
    const orphaned = newMoves
      .filter(move => !learned.has(move.id))
      .map(move => move.id)
      .sort();

    assert.deepEqual(orphaned, []);
  });

  it('new creature learnsets are capped at 6 entries', () => {
    const overCap = newCreatures
      .filter(creature => (creature.learnset || []).length > 6)
      .map(creature => `${creature.id}:${creature.learnset.length}`);

    assert.deepEqual(overCap, []);
  });

  it('new creatures have exactly one legal level-1 move', () => {
    const illegal = [];

    for (const creature of newCreatures) {
      const levelOneEntries = (creature.learnset || []).filter(entry => entry.level === 1);
      if (levelOneEntries.length !== 1) {
        illegal.push(`${creature.id}:level1-count-${levelOneEntries.length}`);
        continue;
      }

      const move = movesById.get(levelOneEntries[0].moveId);
      if (!move) {
        illegal.push(`${creature.id}:unknown-${levelOneEntries[0].moveId}`);
        continue;
      }

      if (move.category !== 'damage') {
        illegal.push(`${creature.id}:${move.id}:category-${move.category}`);
      }
      if (move.category === 'drain' || isCleanseMove(move)) {
        illegal.push(`${creature.id}:${move.id}:support-rider`);
      }
      if ((move.tier || 1) > 2) {
        illegal.push(`${creature.id}:${move.id}:tier-${move.tier}`);
      }
      if (move.target === 'all_enemies') {
        illegal.push(`${creature.id}:${move.id}:multi-target`);
      }
    }

    assert.deepEqual(illegal, []);
  });
});
