// scripts/migrate-starter-moves.js
// One-shot migration for docs/superpowers/specs/2026-04-23-starter-move-variety-design.md.
// Idempotent: re-running produces no change if the data already matches the target state.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// 13 creatures: new level-1 starter move.
const L1_REASSIGN = {
  hi: 'honoo',
  mizu: 'nagasu',
  ki: 'sasu',
  ishi: 'mamoru',
  tetsu: 'tataku',
  kaze: 'naku',
  mushi: 'kakureru',
  hana: 'nemuru',
  tori: 'tobu',
  sakana: 'nomu',
  neko: 'okoru',
  inu: 'horu',
  hinoneko: 'honoo',
};

// 9 creatures: mid-level slot replacements (resolves duplicates created by the L1 reassignments).
// Key: creatureId. Value: { level: number, newMoveId: string }.
const MID_REPLACE = {
  hi:     { level: 7,  newMoveId: 'okoru' },
  mizu:   { level: 7,  newMoveId: 'mamoru' },
  ishi:   { level: 5,  newMoveId: 'suwaru' },
  kaze:   { level: 5,  newMoveId: 'nemuru' },
  hana:   { level: 5,  newMoveId: 'nomu' },
  tori:   { level: 16, newMoveId: 'nemuru' },
  sakana: { level: 5,  newMoveId: 'kakureru' },
  neko:   { level: 5,  newMoveId: 'kakureru' },
  hinoneko: { level: 10, newMoveId: 'kesu' },
};

// 2 moves: stat rebalances.
const MOVE_REBALANCE = {
  tobu: { power: 15, mpCost: 10 },
  horu: { power: 15, mpCost: 12 },
};

const creaturesPath = resolve(REPO_ROOT, 'data/creatures.json');
const movesPath = resolve(REPO_ROOT, 'data/moves.json');

const creatures = JSON.parse(readFileSync(creaturesPath, 'utf8'));
const moves = JSON.parse(readFileSync(movesPath, 'utf8'));

const summary = { l1Changed: [], midChanged: [], movesChanged: [] };

for (const c of creatures) {
  const newL1 = L1_REASSIGN[c.id];
  if (newL1) {
    const entry = c.learnset.find(e => e.level === 1);
    if (!entry) throw new Error(`Creature ${c.id} has no level-1 learnset entry`);
    if (entry.moveId !== newL1) {
      summary.l1Changed.push({ id: c.id, old: entry.moveId, new: newL1 });
      entry.moveId = newL1;
    }
  }
  const mid = MID_REPLACE[c.id];
  if (mid) {
    const entry = c.learnset.find(e => e.level === mid.level);
    if (!entry) throw new Error(`Creature ${c.id} has no level-${mid.level} learnset entry`);
    if (entry.moveId !== mid.newMoveId) {
      summary.midChanged.push({ id: c.id, level: mid.level, old: entry.moveId, new: mid.newMoveId });
      entry.moveId = mid.newMoveId;
    }
  }
}

for (const m of moves) {
  const rebalance = MOVE_REBALANCE[m.id];
  if (!rebalance) continue;
  const before = { power: m.power, mpCost: m.mpCost };
  let changed = false;
  for (const [k, v] of Object.entries(rebalance)) {
    if (m[k] !== v) {
      m[k] = v;
      changed = true;
    }
  }
  if (changed) summary.movesChanged.push({ id: m.id, before, after: { ...rebalance } });
}

writeFileSync(creaturesPath, JSON.stringify(creatures, null, 2) + '\n');
writeFileSync(movesPath, JSON.stringify(moves, null, 2) + '\n');

console.log('Starter-move migration complete.');
console.log(`  L1 starter reassignments: ${summary.l1Changed.length}`);
for (const x of summary.l1Changed) console.log(`    ${x.id}: ${x.old} -> ${x.new}`);
console.log(`  Mid-slot replacements: ${summary.midChanged.length}`);
for (const x of summary.midChanged) console.log(`    ${x.id} L${x.level}: ${x.old} -> ${x.new}`);
console.log(`  Move rebalances: ${summary.movesChanged.length}`);
for (const x of summary.movesChanged) {
  console.log(`    ${x.id}: pwr ${x.before.power} -> ${x.after.power}, mp ${x.before.mpCost} -> ${x.after.mpCost}`);
}
