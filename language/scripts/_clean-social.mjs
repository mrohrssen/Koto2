#!/usr/bin/env node
/**
 * One-shot script: moves misplaced entries from social.json to the correct category files.
 * Each entry was manually reviewed by reading the full file and judging whether
 * the word belongs in "social" (relationships, communication, people, family,
 * greetings, social institutions) or another category.
 *
 * Run: node scripts/_clean-social.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DIR = join(import.meta.dirname, '..', 'data', 'vocab-categories');

// Map of word → target category for all misplaced entries
const MOVES = {
  // → nature (weather, terrain, natural features)
  '雨': 'nature',           // rain
  '穴': 'nature',           // hole
  '浜': 'nature',           // beach
  '岸': 'nature',           // bank/shore

  // → objects (physical things)
  '席': 'objects',           // seat
  'ライト': 'objects',       // light

  // → numbers-time
  '四つ': 'numbers-time',   // four
  '少数': 'numbers-time',   // small number

  // → body-parts
  '神経': 'body-parts',     // nerve
  '手先': 'body-parts',     // fingers

  // → locations
  '田舎': 'locations',      // rural area
  '敷地': 'locations',      // site
  '堂': 'locations',        // temple
  'プラネタリウム': 'locations', // planetarium

  // → descriptors (adjectives, qualities unrelated to social interaction)
  '難しい': 'descriptors',   // difficult
  '逆': 'descriptors',       // reverse
  '正しい': 'descriptors',   // right/correct
  '弱い': 'descriptors',     // weak
  '詳しい': 'descriptors',   // detailed
  '高': 'descriptors',       // high
  '雑': 'descriptors',       // rough
  '丈夫': 'descriptors',     // healthy/sturdy
  '未熟': 'descriptors',     // unripe/immature
  '可憐': 'descriptors',     // sweet (e.g. flowers, young girls)
  '都合のいい': 'descriptors', // convenient
  '必須': 'descriptors',     // indispensable

  // → abstract (grammar, conjunctions, abstract concepts)
  'ようやく': 'abstract',    // finally
  '他に': 'abstract',        // in addition
  'ほう': 'abstract',        // oh (interjection)
  '何故': 'abstract',        // why
  'かも知れない': 'abstract', // may
  'そうすると': 'abstract',   // having done that
  'からすると': 'abstract',   // judging from
  'わけではありません': 'abstract', // it does not mean that...
  'と考えられる': 'abstract', // to be conceivable that
  '由来': 'abstract',        // origin
  '相違': 'abstract',        // difference
  '要因': 'abstract',        // main cause
  '平均': 'abstract',        // average
  '人口': 'abstract',        // population
  '気を抜く': 'abstract',    // to lose focus
  '初めは': 'abstract',      // at first
  'を回って': 'abstract',    // in regard to
  '成分': 'abstract',        // ingredient/component

  // → movement
  '帰る': 'movement',        // to return
  '過ぎる': 'movement',      // to pass through
  '戻ってくる': 'movement',  // to come back
  '下りる': 'movement',      // to descend
  '渡す': 'movement',        // to ferry across (listed meaning is physical)
  '通じる': 'movement',      // to be open (to traffic) - listed meaning is physical
  '出歩く': 'movement',      // to go out
  '往来': 'movement',        // coming and going

  // → actions (general activities, not social interaction)
  '諦める': 'actions',       // to give up
  '買い物': 'actions',       // shopping
  '明かす': 'actions',       // to pass (the night)
  '演奏': 'actions',         // musical performance
  '成し遂げる': 'actions',   // to accomplish
  '直る': 'actions',         // to get mended
  '追求': 'actions',         // pursuit (of a goal)
  '労働': 'actions',         // manual labor
  '寝ぼける': 'actions',     // to be still half asleep

  // → combat
  '全滅': 'combat',          // annihilation
  '軍備': 'combat',          // armaments
  '白兵戦': 'combat',        // hand-to-hand combat

  // → emotions
  '疑う': 'emotions',        // to doubt
  'わくわく': 'emotions',    // trembling/excitement
  'ワクワク': 'emotions',    // trembling/excitement
  '自信満々': 'emotions',    // full of confidence
  '出来心': 'emotions',      // sudden impulse
};

// Entries with empty meaning/reading — broken data, just remove
const REMOVE = new Set(['ところで', 'それなら', '務め']);

// Read social.json
const socialPath = join(DIR, 'social.json');
const social = JSON.parse(readFileSync(socialPath, 'utf8'));
console.log(`social.json: ${social.length} entries`);

// Separate entries
const kept = [];
const moved = {};  // category → [entries]
let removedCount = 0;

for (const entry of social) {
  if (REMOVE.has(entry.word)) {
    removedCount++;
    console.log(`  REMOVE (empty): ${entry.word}`);
    continue;
  }
  const target = MOVES[entry.word];
  if (target) {
    if (!moved[target]) moved[target] = [];
    moved[target].push(entry);
    console.log(`  MOVE: ${entry.word} (${entry.meaning}) → ${target}`);
  } else {
    kept.push(entry);
  }
}

const totalMoved = Object.values(moved).reduce((s, a) => s + a.length, 0);
console.log(`\nKept: ${kept.length}, Moved: ${totalMoved}, Removed: ${removedCount}`);
console.log(`Total accounted for: ${kept.length + totalMoved + removedCount} (should be ${social.length})`);

// Write cleaned social.json
writeFileSync(socialPath, JSON.stringify(kept, null, 2) + '\n');
console.log(`\nWrote social.json (${kept.length} entries)`);

// Append to each target category
for (const [category, entries] of Object.entries(moved)) {
  const catPath = join(DIR, `${category}.json`);
  const existing = JSON.parse(readFileSync(catPath, 'utf8'));
  const existingWords = new Set(existing.map(e => e.word));

  // Only add entries that aren't already in the target
  const toAdd = entries.filter(e => !existingWords.has(e.word));
  const skipped = entries.length - toAdd.length;

  if (toAdd.length > 0) {
    const merged = [...existing, ...toAdd].sort((a, b) => a.rank - b.rank);
    writeFileSync(catPath, JSON.stringify(merged, null, 2) + '\n');
    console.log(`  ${category}.json: added ${toAdd.length} entries (${skipped} already existed), total ${merged.length}`);
  } else {
    console.log(`  ${category}.json: all ${entries.length} already existed, no changes`);
  }
}

console.log('\nDone!');
