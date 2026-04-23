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
  it('no move appears as level-1 starter for more than 2 creatures', () => {
    const counts = {};
    for (const c of creatures) {
      const id = starterMove(c);
      if (!id) continue;
      counts[id] = (counts[id] || 0) + 1;
    }
    const overCap = Object.entries(counts).filter(([, n]) => n > 2);
    assert.deepStrictEqual(
      overCap,
      [],
      `Starter cap is 2. Over-cap moves: ${JSON.stringify(overCap)}`
    );
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

  it('no later-level damage move is strictly weaker than the level-1 damage move', () => {
    const regressions = [];
    for (const c of creatures) {
      const starter = starterMove(c);
      if (!starter) continue;
      const starterMove_ = movesById[starter];
      if (!starterMove_ || starterMove_.category !== 'damage') continue;
      const starterPower = starterMove_.power ?? 0;
      const weakerLater = c.learnset
        .filter(e => e.level !== 1)
        .map(e => ({ level: e.level, move: e.moveId, m: movesById[e.moveId] }))
        .filter(({ m }) => m && m.category === 'damage' && (m.power ?? 0) < starterPower);
      if (weakerLater.length > 0) {
        regressions.push({
          creature: c.id,
          starter,
          starterPower,
          weakerLater: weakerLater.map(x => ({ level: x.level, move: x.move, power: x.m.power }))
        });
      }
    }
    assert.deepStrictEqual(
      regressions,
      [],
      `Damage power regressions found: ${JSON.stringify(regressions)}`
    );
  });
});
