#!/usr/bin/env node
// One-shot cleanup: moves misplaced entries from body-parts.json to correct category files.
// All decisions were made by manual review — this script just does the file I/O.

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DIR = join(import.meta.dirname, '..', 'data', 'vocab-categories');

// Each entry identified by [rank, word] → target category
const moves = [
  // → abstract
  [525, '一瞬', 'abstract'],
  [561, '反応', 'abstract'],
  [596, '程度', 'abstract'],
  [657, '部分', 'abstract'],
  [799, '予定', 'abstract'],
  [3288, 'なぜなら', 'abstract'],
  [3432, '制御', 'abstract'],
  [5884, '重視', 'abstract'],
  [9449, 'この期に及んで', 'abstract'],
  [9453, 'プロジェクト', 'abstract'],
  [14906, '謹慎', 'abstract'],
  [15372, '使い勝手', 'abstract'],
  [17024, '配分', 'abstract'],
  [20718, 'により', 'abstract'],

  // → actions
  [964, '間違う', 'actions'],
  [4809, '出してくれる', 'actions'],
  [5808, '見透かす', 'actions'],
  [6441, '堪える', 'actions'],
  [14909, '口ずさむ', 'actions'],
  [17539, '舞い込む', 'actions'],
  [24273, '吹かす', 'actions'],

  // → colors
  [544, '色', 'colors'],

  // → combat
  [7902, '決戦', 'combat'],
  [15864, '接近戦', 'combat'],
  [22038, '世界征服', 'combat'],
  [18881, '銃器', 'combat'],

  // → descriptors
  [5286, '小刻み', 'descriptors'],
  [9457, '具合が悪い', 'descriptors'],
  [12830, '豊満', 'descriptors'],
  [25787, '新任', 'descriptors'],

  // → emotions
  [4830, 'きゃっ', 'emotions'],
  [5899, '気が済む', 'emotions'],
  [15944, '竦む', 'emotions'],
  [20144, 'たわけ', 'emotions'],
  [26948, '喚起', 'emotions'],

  // → foods
  [22497, 'ケーキ屋', 'foods'],
  [26310, '三食', 'foods'],

  // → locations
  [558, '壁', 'locations'],
  [606, '通り', 'locations'],
  [13647, '本陣', 'locations'],

  // → movement
  [5949, '足跡', 'movement'],
  [17883, '横向き', 'movement'],

  // → numbers-time
  [1437, '八', 'numbers-time'],
  [2942, '脚', 'numbers-time'],   // きゃく = counter for chairs
  [22710, '２５日', 'numbers-time'],
  [26336, '一間', 'numbers-time'],

  // → objects
  [3459, '書', 'objects'],
  [7714, 'エレベーター', 'objects'],
  [7904, '筆頭', 'objects'],
  [11832, '身の回り', 'objects'],
  [13678, 'ラブレター', 'objects'],

  // → social
  [584, '友達', 'social'],
  [3424, '奴隷', 'social'],
  [6583, '正直なところ', 'social'],
  [7723, '王妃', 'social'],
  [9054, '怪我人', 'social'],
  [10852, '貴女', 'social'],
  [13593, 'ゲスト', 'social'],
  [16730, '検事', 'social'],
  [23246, 'ジョー', 'social'],
  [23576, '学歴', 'social'],
  [5415, '妊娠', 'social'],
];

// Broken entries to delete entirely (empty meaning/reading)
const deleteEntries = [
  [4561, '良く'],
  [5336, 'くらいなら'],
  [11508, 'はだける'],
];

// Build lookup sets
const moveSet = new Set(moves.map(([rank, word]) => `${rank}:${word}`));
const deleteSet = new Set(deleteEntries.map(([rank, word]) => `${rank}:${word}`));

// Read body-parts
const bodyParts = JSON.parse(readFileSync(join(DIR, 'body-parts.json'), 'utf8'));
console.log(`body-parts.json: ${bodyParts.length} entries`);

// Separate entries
const kept = [];
const moved = {};  // category → entries[]
let deleted = 0;

for (const entry of bodyParts) {
  const key = `${entry.rank}:${entry.word}`;
  if (deleteSet.has(key)) {
    deleted++;
    console.log(`  DELETE: ${entry.word} (${entry.meaning})`);
    continue;
  }
  const moveEntry = moves.find(([r, w]) => r === entry.rank && w === entry.word);
  if (moveEntry) {
    const [, , cat] = moveEntry;
    if (!moved[cat]) moved[cat] = [];
    moved[cat].push(entry);
    console.log(`  MOVE → ${cat}: ${entry.word} (${entry.meaning})`);
  } else {
    kept.push(entry);
  }
}

console.log(`\nKept: ${kept.length}, Deleted: ${deleted}`);

// Write cleaned body-parts.json
writeFileSync(join(DIR, 'body-parts.json'), JSON.stringify(kept, null, 2) + '\n');
console.log('Wrote cleaned body-parts.json');

// Append to each target category
for (const [cat, entries] of Object.entries(moved)) {
  const filePath = join(DIR, `${cat}.json`);
  const existing = JSON.parse(readFileSync(filePath, 'utf8'));
  const combined = [...existing, ...entries];
  // Sort by rank
  combined.sort((a, b) => a.rank - b.rank);
  writeFileSync(filePath, JSON.stringify(combined, null, 2) + '\n');
  console.log(`Appended ${entries.length} entries to ${cat}.json (now ${combined.length} total)`);
}

console.log('\nDone!');
