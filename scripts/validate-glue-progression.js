#!/usr/bin/env node
/**
 * Validates that all 50 glue words are reachable through i+1 progression.
 *
 * Simulates a player starting from 0 known words, progressively learning
 * through gameplay (creatures, items, barks) and dialogue frames.
 *
 * Uses the real frames.json and isEligible filter — no manual tagging.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const dataDir = join(process.cwd(), 'data');
const frames = JSON.parse(readFileSync(join(dataDir, 'dialogue', 'frames.json'), 'utf-8'));
const creatures = JSON.parse(readFileSync(join(dataDir, 'creatures.json'), 'utf-8'));
const items = JSON.parse(readFileSync(join(dataDir, 'items.json'), 'utf-8'));

// The 50 glue words
const GLUE_WORDS = new Set([
  '私','一緒','とても','今','知る','思う','これ','それ','まだ','言う',
  'この','あの','来る','友達','嬉しい','今日','少し','出る','入る','上手',
  '食べる','大きい','小さい','新しい','人','前','後','時','話','方',
  '気','手','目','声','心','力','道','明日','分かる','教える',
  '持つ','使う','作る','出来る','世界','場所','初めて','元気','名前','色'
]);

// isEligible from token-format.js (inlined to avoid ESM import issues in script)
const SENTENCE_ENDERS = new Set(['。', '！', '？', '!', '?']);
function isEligible(tokens, knownWords) {
  let unknowns = 0;
  let hasEntity = false;
  for (const token of tokens) {
    if (!token.base) {
      if (SENTENCE_ENDERS.has(token.surface)) {
        const max = hasEntity ? 2 : 1;
        if (unknowns > max) return false;
        unknowns = 0;
        hasEntity = false;
      }
      continue;
    }
    if (token.entity) hasEntity = true;
    if (!knownWords.has(token.base)) unknowns++;
  }
  const max = hasEntity ? 2 : 1;
  return unknowns <= max;
}

// Collect gameplay vocab (what the player learns from creatures/items, not dialogue)
const gameplayWords = new Set();
for (const c of Object.values(creatures)) {
  if (c.word) gameplayWords.add(c.word);
  if (c.name) gameplayWords.add(c.name);
}
for (const item of Object.values(items)) {
  if (item.word) gameplayWords.add(item.word);
}

// Separate bark frames from dialogue frames
const barkFrames = frames.filter(f => f.category.startsWith('bark_'));
const dialogueFrames = frames.filter(f => !f.category.startsWith('bark_'));

// Collect all content words from barks
const barkWords = new Set();
for (const f of barkFrames) {
  for (const w of (f.words || [])) barkWords.add(w);
}

// Simulation
const known = new Set();
const glueLearnedAt = new Map(); // glueWord → step#
const usedFrames = new Set();
let step = 0;

function learn(word) {
  if (known.has(word)) return;
  known.add(word);
  if (GLUE_WORDS.has(word)) {
    glueLearnedAt.set(word, step);
  }
}

// Phase 1: Learn gameplay vocab
step = 1;
for (const w of gameplayWords) learn(w);
console.log(`Step ${step}: Gameplay vocab → ${known.size} words known`);

// Phase 2: Learn bark words
step = 2;
for (const w of barkWords) learn(w);
console.log(`Step ${step}: Bark words → ${known.size} words known`);

// Phase 3+: Iteratively find eligible dialogue frames and learn from them
let changed = true;
while (changed) {
  changed = false;
  step++;
  for (const frame of dialogueFrames) {
    if (usedFrames.has(frame.id)) continue;
    if (!isEligible(frame.tokens || [], known)) continue;

    // This frame is eligible — learn its unknown word(s)
    usedFrames.add(frame.id);
    for (const w of (frame.words || [])) {
      if (!known.has(w)) {
        learn(w);
        changed = true;
      }
    }
  }
  if (changed) {
    const glueCount = [...GLUE_WORDS].filter(w => known.has(w)).length;
    console.log(`Step ${step}: Dialogue iteration → ${known.size} words known, ${glueCount}/50 glue words`);
  }
}

// Report
console.log('\n=== RESULTS ===');
const learned = [...GLUE_WORDS].filter(w => glueLearnedAt.has(w));
const unreachable = [...GLUE_WORDS].filter(w => !known.has(w));

console.log(`\nGlue words learned: ${learned.length}/50`);
if (learned.length > 0) {
  console.log('\nLearning order:');
  const sorted = [...glueLearnedAt.entries()].sort((a, b) => a[1] - b[1]);
  for (const [word, s] of sorted) {
    console.log(`  Step ${s}: ${word}`);
  }
}

if (unreachable.length > 0) {
  console.log(`\n❌ UNREACHABLE glue words (${unreachable.length}):`);
  for (const w of unreachable) {
    console.log(`  ${w}`);
    // Find frames that contain this word to diagnose why they're not eligible
    const containing = dialogueFrames.filter(f => (f.words || []).includes(w));
    for (const f of containing.slice(0, 3)) {
      const unknownsInFrame = (f.words || []).filter(fw => !known.has(fw));
      console.log(`    Frame ${f.id}: needs [${unknownsInFrame.join(', ')}] (${unknownsInFrame.length} unknowns)`);
    }
  }
  process.exit(1);
} else {
  console.log('\n✅ All 50 glue words are reachable!');
}
