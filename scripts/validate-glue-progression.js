#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAllowedSurfaceSet, getDemotedBaseFormSet } from '../src/game/grammar-allowlist.js';

const dataDir = join(process.cwd(), 'data');
const frames = JSON.parse(readFileSync(join(dataDir, 'dialogue', 'frames.json'), 'utf-8'));
const creatures = JSON.parse(readFileSync(join(dataDir, 'creatures.json'), 'utf-8'));
const items = JSON.parse(readFileSync(join(dataDir, 'items.json'), 'utf-8'));

// The 74-word glue pool. Authoritative source: the glueWords array in
// docs/superpowers/plans/2026-07-07-translator-upgrade-frames-to-ai-dialogue.md.
// TODO: once data/dialogue-switch-config.json exists (translator-upgrade Task 1),
// load the pool from there instead of hardcoding it here.
const GLUE_WORDS = new Set([
  '私', '人', '友達', 'みんな', '名前', '一緒', '一人',
  'この', 'それ', 'あの', 'そこ', 'どっち',
  '今', '今日', '明日', '昨日', '今度', 'また', 'もう', 'まだ', 'いつも', '前',
  'とても', '少し', 'ちょっと', 'もっと', 'たくさん', '全部', '一番',
  '思う', '知る', '分かる', '言う', '聞く', '話す', '教える', '言葉', '話',
  '手', '目', '声', '心',
  '来る', '会う', '帰る', '出る', '入る', '見せる',
  '食べる', '買う', '作る', '使う', '持つ', '休む', '出来る',
  '大きい', '小さい', '可愛い', '大好き', '欲しい', '古い', '高い', '安い',
  '近い', '遠い', '遅い', '甘い', '美味しい', '難しい', '簡単', '上手', '大切', '楽しみ',
  '場所'
]);

// Guard: taught glue words must never be free grammar. The whole premise of the
// glue pool is that these are TAUGHT vocab — if any leaked into the grammar
// allowlist it would be silently free (never i+1-costed, never a teaching word).
const allowed = getAllowedSurfaceSet();
const demotedBases = getDemotedBaseFormSet();
const overlap = [...GLUE_WORDS].filter(w => allowed.has(w) || demotedBases.has(w));
if (overlap.length > 0) {
  console.error(`❌ POOL/ALLOWLIST OVERLAP (${overlap.length}): ${overlap.join(' ')}`);
  process.exitCode = 1;
} else {
  console.log('✓ glue pool and grammar allowlist are disjoint');
}

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
    console.log(`Step ${step}: Dialogue iteration → ${known.size} words known, ${glueCount}/74 glue words`);
  }
}

// Report
console.log('\n=== RESULTS ===');
const learned = [...GLUE_WORDS].filter(w => glueLearnedAt.has(w));
const unreachable = [...GLUE_WORDS].filter(w => !known.has(w));

console.log(`\nGlue words learned: ${learned.length}/74`);
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
  console.log('\n✅ All 74 glue words are reachable!');
}
