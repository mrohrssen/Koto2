#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const CREATED_AT = '2026-05-06';
const creatures = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/creatures.json'), 'utf8'));
const moves = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/moves.json'), 'utf8'));

const movesById = new Map(moves.map(move => [move.id, move]));
const newMoves = moves.filter(move => move.createdAt === CREATED_AT);
const newCreatures = creatures.filter(creature => creature.createdAt === CREATED_AT);
const learned = new Set();
const errors = [];

for (const creature of creatures) {
  for (const entry of creature.learnset || []) learned.add(entry.moveId);
}

for (const creature of newCreatures) {
  const learnset = creature.learnset || [];
  if (learnset.length < 4 || learnset.length > 6) {
    errors.push(`${creature.id}: expected 4-6 moves, found ${learnset.length}`);
  }

  const levelOne = learnset.filter(entry => entry.level === 1);
  if (levelOne.length !== 1) {
    errors.push(`${creature.id}: expected exactly one level-1 move, found ${levelOne.length}`);
  }

  for (const entry of learnset) {
    const move = movesById.get(entry.moveId);
    if (!move) {
      errors.push(`${creature.id}: unknown move ${entry.moveId}`);
      continue;
    }
    if (entry.level === 1) {
      if (move.category !== 'damage') errors.push(`${creature.id}: illegal level-1 category ${move.id}:${move.category}`);
      if (move.statusEffect === 'cleanse') errors.push(`${creature.id}: illegal level-1 cleanse ${move.id}`);
      if ((move.tier || 1) > 2) errors.push(`${creature.id}: illegal level-1 tier ${move.id}:${move.tier}`);
      if (move.target === 'all_enemies') errors.push(`${creature.id}: illegal level-1 multi-target ${move.id}`);
    }
  }
}

const orphaned = newMoves.filter(move => !learned.has(move.id));
console.log(`New creatures: ${newCreatures.length}`);
console.log(`New moves: ${newMoves.length}`);
console.log(`Orphan new moves: ${orphaned.length}`);
for (const move of orphaned) {
  console.log(`  - ${move.id} (${move.nameEn}, ${move.element}, ${move.category}, tier ${move.tier})`);
}

if (errors.length > 0) {
  console.error('Learnset errors:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

if (orphaned.length > 0) process.exit(1);
