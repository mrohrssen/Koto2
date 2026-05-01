// tests/unit/creature/starter-distribution.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const creatures = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'data/creatures.json'), 'utf8')
);
const movesById = Object.fromEntries(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/moves.json'), 'utf8'))
    .map(m => [m.id, m])
);

const starterMove = (creature) => {
  const entry = creature.learnset.find(e => e.level === 1);
  return entry ? entry.moveId : null;
};

describe('creature starter-move distribution', () => {
  it('every creature has a valid level-1 starter move', () => {
    const missing = [];
    const unknown = [];

    for (const creature of creatures) {
      const moveId = starterMove(creature);
      if (!moveId) {
        missing.push(creature.id);
      } else if (!movesById[moveId]) {
        unknown.push({ creature: creature.id, moveId });
      }
    }

    assert.deepStrictEqual(missing, [], `Missing L1 moves: ${JSON.stringify(missing)}`);
    assert.deepStrictEqual(unknown, [], `Unknown L1 moves: ${JSON.stringify(unknown)}`);
  });

  it('level-1 move does not appear at any other level in the same learnset', () => {
    const duplicates = [];
    for (const c of creatures) {
      const starter = starterMove(c);
      if (!starter) continue;
      const laterWithSameMove = c.learnset.filter(
        e => e.level !== 1 && e.moveId === starter
      );
      if (laterWithSameMove.length > 0) {
        duplicates.push({ creature: c.id, move: starter, laterLevels: laterWithSameMove.map(e => e.level) });
      }
    }
    assert.deepStrictEqual(
      duplicates,
      [],
      `Duplicate L1 moves found: ${JSON.stringify(duplicates)}`
    );
  });
});
