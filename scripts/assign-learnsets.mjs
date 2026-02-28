#!/usr/bin/env node
/**
 * assign-learnsets.mjs
 *
 * Assigns 4-6 moves from the shared move pool (data/moves.json) to each
 * creature in data/creatures.json. Outputs data/creature-learnsets.json.
 *
 * Algorithm:
 *  1. Match autoSkill.word → move.name for level 1 move
 *  2. Match ultimate.word → move.name for level 12 move
 *  3. Pick 2-4 additional moves based on element priority + archetype fit
 *  4. Assign learn levels: 1, 5, 9, 12, (16, 20 if 5-6 moves)
 *
 * Deterministic: sorts candidates before picking so results are reproducible.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

const moves = JSON.parse(readFileSync(join(dataDir, 'moves.json'), 'utf8'));
const creatures = JSON.parse(readFileSync(join(dataDir, 'creatures.json'), 'utf8'));

// Build lookup: move.name → move (first match)
const moveByName = new Map();
for (const m of moves) {
  // Multiple moves can share the same Japanese name (e.g. 打つ as utsu and utsu_beat).
  // Store all of them so we can match by element if needed.
  if (!moveByName.has(m.name)) {
    moveByName.set(m.name, []);
  }
  moveByName.get(m.name).push(m);
}

const moveById = new Map();
for (const m of moves) {
  moveById.set(m.id, m);
}

/**
 * Find a move matching a Japanese word, optionally preferring a specific element.
 * Returns the move object or null.
 */
function findMoveByWord(word, preferredElement) {
  const candidates = moveByName.get(word);
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Prefer element match
  const elementMatch = candidates.find(m => m.element === preferredElement);
  if (elementMatch) return elementMatch;

  // Fall back to first
  return candidates[0];
}

/**
 * Score a candidate move for a creature based on element and archetype fit.
 * Higher score = better fit.
 */
function scoreMove(move, creatureElement, archetype) {
  let score = 0;

  // --- Element scoring ---
  if (move.element === creatureElement) {
    score += 20; // STAB bonus preference
  } else if (move.element === 'neutral') {
    score += 10; // Neutral is always useful
  }
  // Non-matching, non-neutral elements get 0

  // --- Archetype scoring ---
  const cat = move.category;
  switch (archetype) {
    case 'Fighter':
      if (cat === 'damage') score += 15;
      if (cat === 'buff') score += 8;
      if (cat === 'debuff') score += 3;
      break;
    case 'Tank/Healer':
      if (cat === 'shield') score += 15;
      if (cat === 'heal') score += 15;
      if (cat === 'buff') score += 5;
      if (cat === 'damage') score += 3;
      break;
    case 'Trickster':
      if (cat === 'debuff') score += 15;
      if (cat === 'drain') score += 15;
      if (cat === 'damage') score += 5;
      if (cat === 'buff') score += 5;
      break;
    case 'Mage':
      if (cat === 'damage' && (move.target === 'all_enemies')) score += 18;
      if (cat === 'damage' && (move.target === 'single_enemy')) score += 8;
      if (cat === 'buff') score += 12;
      if (cat === 'heal') score += 5;
      break;
  }

  // --- Tier scoring: prefer lower tier for earlier moves, but slight variety ---
  // Use rank as tiebreaker: lower JPDB rank = more common word = slightly preferred
  // Normalize rank to a small bonus (0-5 range)
  if (move.rank && move.rank < 5000) {
    score += (5000 - move.rank) / 1000; // 0-5 bonus
  }

  return score;
}

/**
 * Check if the creature's pick list has sufficient variety.
 * Fighters should have at least one non-damage move.
 * Non-fighters should have at least one damage move.
 */
function hasVariety(pickedMoves, archetype) {
  const categories = pickedMoves.map(m => moveById.get(m.moveId)?.category).filter(Boolean);
  if (archetype === 'Fighter') {
    return categories.some(c => c !== 'damage');
  } else {
    return categories.some(c => c === 'damage');
  }
}

/**
 * Determine how many additional moves (beyond autoSkill + ultimate) a creature gets.
 * Target: 4-6 total moves.
 * - Fighters and Tank/Healers: 6 moves (more breadth)
 * - Tricksters and Mages: 5 moves (focused but varied)
 */
function getTargetMoveCount(archetype) {
  switch (archetype) {
    case 'Fighter':
    case 'Tank/Healer':
      return 6;
    case 'Trickster':
    case 'Mage':
      return 5;
    default:
      return 5;
  }
}

// ---- Main assignment loop ----
const learnsets = {};
const warnings = [];

for (const creature of creatures) {
  const { id, element, archetype } = creature;
  const autoSkillWord = creature.autoSkill.word;
  const ultimateWord = creature.ultimate.word;

  // Step 1: Find autoSkill move (level 1)
  let autoSkillMove = findMoveByWord(autoSkillWord, element);
  if (!autoSkillMove) {
    warnings.push(`${id}: autoSkill word "${autoSkillWord}" not found in moves.json, picking closest match`);
    // Pick closest: same element, damage category
    const fallback = moves
      .filter(m => m.element === element && m.category === 'damage')
      .sort((a, b) => a.mpCost - b.mpCost || a.rank - b.rank)[0];
    autoSkillMove = fallback || moves.find(m => m.category === 'damage');
  }

  // Step 2: Find ultimate move (level 12)
  let ultimateMove = findMoveByWord(ultimateWord, element);
  if (!ultimateMove) {
    warnings.push(`${id}: ultimate word "${ultimateWord}" not found in moves.json, picking closest match`);
    // Pick closest: same element, matching ultimate type
    const ultimateType = creature.ultimate.type; // e.g. 'damage', 'shield', 'heal', etc.
    const fallback = moves
      .filter(m => m.element === element && m.category === ultimateType)
      .sort((a, b) => b.power - a.power || a.rank - b.rank)[0];
    ultimateMove = fallback || moves.find(m => m.element === element);
  }

  const usedMoveIds = new Set([autoSkillMove.id, ultimateMove.id]);

  // Step 3: Pick additional moves
  const targetCount = getTargetMoveCount(archetype);
  const additionalNeeded = targetCount - 2; // minus autoSkill and ultimate

  // Score all available moves
  const candidates = moves
    .filter(m => !usedMoveIds.has(m.id))
    .map(m => ({ move: m, score: scoreMove(m, element, archetype) }))
    .sort((a, b) => {
      // Sort by score descending, then by move id for determinism
      if (b.score !== a.score) return b.score - a.score;
      return a.move.id.localeCompare(b.move.id);
    });

  const additionalMoves = [];

  // First pass: pick top candidates
  for (const { move } of candidates) {
    if (additionalMoves.length >= additionalNeeded) break;
    if (usedMoveIds.has(move.id)) continue;

    additionalMoves.push(move);
    usedMoveIds.add(move.id);
  }

  // Variety check: ensure the full set (auto + ultimate + additional) meets variety criteria
  const allPicked = [
    { moveId: autoSkillMove.id },
    { moveId: ultimateMove.id },
    ...additionalMoves.map(m => ({ moveId: m.id }))
  ];

  if (!hasVariety(allPicked, archetype)) {
    // Swap out the lowest-scored additional move for a variety move
    const lastIdx = additionalMoves.length - 1;
    const swapOut = additionalMoves[lastIdx];

    let varietyMove = null;
    if (archetype === 'Fighter') {
      // Need a non-damage move
      varietyMove = candidates.find(({ move }) =>
        !usedMoveIds.has(move.id) && move.category !== 'damage'
      )?.move;
    } else {
      // Need a damage move
      varietyMove = candidates.find(({ move }) =>
        !usedMoveIds.has(move.id) && move.category === 'damage'
      )?.move;
    }

    if (varietyMove) {
      usedMoveIds.delete(swapOut.id);
      additionalMoves[lastIdx] = varietyMove;
      usedMoveIds.add(varietyMove.id);
    }
  }

  // Step 4: Assign learn levels
  // Levels: 1, 5, 9, 12, 16, 20 (depending on total count)
  const levelSlots = [1, 5, 9, 12, 16, 20];

  // autoSkill always level 1, ultimate always level 12 (index 3)
  // Additional moves fill levels 5, 9, then 16, 20
  const learnset = [];
  learnset.push({ moveId: autoSkillMove.id, level: 1 });

  // Slot the additional moves into levels 5, 9, then 16, 20
  const midLevels = [5, 9];
  const lateLevels = [16, 20];

  for (let i = 0; i < additionalMoves.length; i++) {
    let level;
    if (i < midLevels.length) {
      level = midLevels[i];
    } else {
      level = lateLevels[i - midLevels.length];
    }
    learnset.push({ moveId: additionalMoves[i].id, level });
  }

  learnset.push({ moveId: ultimateMove.id, level: 12 });

  // Sort by level for cleanliness
  learnset.sort((a, b) => a.level - b.level);

  learnsets[id] = learnset;
}

// Write output
const outputPath = join(dataDir, 'creature-learnsets.json');
writeFileSync(outputPath, JSON.stringify(learnsets, null, 2) + '\n', 'utf8');

// Print summary
console.log(`Assigned learnsets for ${Object.keys(learnsets).length} creatures.`);
console.log(`Output: ${outputPath}\n`);

if (warnings.length > 0) {
  console.log('Warnings:');
  warnings.forEach(w => console.log(`  - ${w}`));
  console.log('');
}

// Verification
let allGood = true;
for (const creature of creatures) {
  const ls = learnsets[creature.id];
  if (!ls) {
    console.error(`MISSING: ${creature.id} has no learnset!`);
    allGood = false;
    continue;
  }
  if (ls.length < 4 || ls.length > 6) {
    console.error(`BAD COUNT: ${creature.id} has ${ls.length} moves (expected 4-6)`);
    allGood = false;
  }
  if (ls[0].level !== 1) {
    console.error(`BAD START: ${creature.id} first move is level ${ls[0].level} (expected 1)`);
    allGood = false;
  }
  const hasLvl12 = ls.some(m => m.level === 12);
  if (!hasLvl12) {
    console.error(`MISSING ULT: ${creature.id} has no level 12 move`);
    allGood = false;
  }

  // Check for duplicate moveIds
  const ids = ls.map(m => m.moveId);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    console.error(`DUPLICATE: ${creature.id} has duplicate moves: ${ids}`);
    allGood = false;
  }

  // Check that each moveId exists in moves.json
  for (const entry of ls) {
    if (!moveById.has(entry.moveId)) {
      console.error(`INVALID MOVE: ${creature.id} references unknown moveId "${entry.moveId}"`);
      allGood = false;
    }
  }

  // Print learnset
  const details = ls.map(entry => {
    const m = moveById.get(entry.moveId);
    return `  Lv${String(entry.level).padStart(2)}: ${m.nameEn.padEnd(14)} (${m.name}) [${m.element}/${m.category}]`;
  }).join('\n');
  console.log(`${creature.id} (${creature.element}/${creature.archetype}) - ${ls.length} moves:`);
  console.log(details);
  console.log('');
}

if (allGood) {
  console.log('All checks passed!');
} else {
  console.error('Some checks failed!');
  process.exit(1);
}
