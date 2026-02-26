#!/usr/bin/env node
// One-time script: move misclassified entries from movement.json to correct category files.
// Classification done by manual review, not algorithmic.

import { readFileSync, writeFileSync } from 'fs';
const dir = 'language/categories';

const movement = JSON.parse(readFileSync(`${dir}/movement.json`, 'utf8'));

// Entries to REMOVE entirely (broken - empty meaning/reading)
const broken = new Set(['何度も', 'はて']);

// Entries to move, keyed by target category filename
const moves = {
  'emotions.json': new Set([
    '気分',       // feeling
    '平気',       // coolness (composure)
    '憂鬱',       // depression
    '取り乱す',   // to be upset
    '愛でる',     // to love
    'そわそわ',   // restlessly (emotional state)
  ]),
  'nature.json': new Set([
    '海',         // sea
    '地',         // earth
    '吹く',       // to blow (of the wind)
    '生える',     // to grow (plants)
    '大樹',       // large tree
    '沸く',       // to grow hot (e.g. water)
    '溢れる',     // to overflow
  ]),
  'objects.json': new Set([
    '船',         // ship
    '電車',       // train
    '馬車',       // coach (horse-drawn)
    '飛行機',     // aeroplane
    '自転車',     // bicycle
    '列車',       // train
    'バイク',     // motorcycle
    '自動車',     // car
    '汽車',       // train (steam)
    'ボート',     // boat
    '舟',         // ship
    '小舟',       // small boat
    '地下鉄',     // underground train
    '街灯',       // street light
    'コマ',       // frame (e.g. of film)
    'ステップ',   // step (of a staircase)
  ]),
  'locations.json': new Set([
    'この辺り',   // this area
    '敷地',       // site
    '大通り',     // main street
    '空港',       // airport
    '署',         // station (police)
    '向かい側',   // opposite side
    '大和',       // (ancient) Japan
  ]),
  'descriptors.json': new Set([
    'よっぽど',     // very
    '鈍い',         // dull (e.g. a knife)
    '不用意',       // unprepared
    '無能',         // incompetence
    '騒々しい',     // noisy
    '丸出し',       // exposing fully
    'ねっとり',     // viscously
    '不躾',         // ill-bred
    '鬼畜',         // brute
    '交じり',       // mixed
    'つくづく',     // deeply
    'おもむろに',   // suddenly
    'みっちり',     // intensely
    '散らかる',     // to be in disorder
  ]),
  'abstract.json': new Set([
    'それぞれ',     // each
    '雰囲気',       // atmosphere
    '異変',         // unusual event
    '掛かる',       // to take (a resource)
    '順に',         // in order
    '無縁',         // unrelated
    'に従い',       // in accordance with
    '生存',         // existence
    '手応え',       // response (felt in hands)
    '挫折',         // setback
    '便乗',         // taking advantage of
    '余力',         // spare energy
    'ゆかり',       // connection
    '洗礼',         // baptism
    '引き続く',     // to continue
    '栄える',       // to prosper
    '一大',         // one large...
    '一滴',         // one drop
  ]),
  'social.json': new Set([
    '引退',         // retirement
    'デビュー',     // debut
    'ヒロイン',     // heroine
    '叔母',         // aunt
    'お互い様',     // we are of equal status
    '証人',         // witness
    '不審者',       // suspicious person
    '別れ際',       // at parting
    '乗客',         // passenger
  ]),
  'combat.json': new Set([
    '打つ',         // to hit
    '回避',         // evasion
    '突撃',         // charge
    '武術',         // martial arts
    '攻勢',         // offensive
    '太刀打ち',     // crossing swords
    '機動',         // maneuver (military)
    '陥落',         // fall (of a castle)
  ]),
  'animals.json': new Set([
    'カエル',       // frog
    '棲む',         // to live (of animals)
  ]),
  'actions.json': new Set([
    '握る',         // to clasp
    '導く',         // to guide
    '覗く',         // to peek
    '眠りに落ちる', // to fall asleep
    '聞き入れる',   // to grant (a wish)
    '行動を取る',   // to act
    '漁る',         // to fish
  ]),
  'body-parts.json': new Set([
    '左足',         // left foot
    '粘膜',         // mucous membrane
    '目頭',         // inner canthus
  ]),
  'clothing.json': new Set([
    'ヒール',         // heel (of a shoe)
    '眼鏡をかける',   // to wear glasses
  ]),
  'foods.json': new Set([
    '甘酸っぱい',     // sweet and sour
    'バーベキュー',   // barbecue
  ]),
  'occupations.json': new Set([
    '運転手',         // driver
  ]),
};

// Build a set of all words to remove from movement
const allToRemove = new Set([...broken]);
for (const wordSet of Object.values(moves)) {
  for (const w of wordSet) allToRemove.add(w);
}

// Track words we've already seen (for dedup)
const seen = new Set();
const kept = [];
const movedEntries = {}; // category -> entries[]

for (const entry of movement) {
  const w = entry.word;

  // Skip broken entries
  if (broken.has(w)) {
    console.log(`REMOVE (broken): ${w}`);
    continue;
  }

  // Skip duplicates (keep first occurrence)
  const key = `${w}|${entry.reading}`;
  if (seen.has(key)) {
    console.log(`REMOVE (duplicate): ${w} [${entry.reading}]`);
    continue;
  }
  seen.add(key);

  // Check if it should be moved
  let moved = false;
  for (const [file, wordSet] of Object.entries(moves)) {
    if (wordSet.has(w)) {
      if (!movedEntries[file]) movedEntries[file] = [];
      movedEntries[file].push(entry);
      console.log(`MOVE: ${w} (${entry.meaning}) -> ${file}`);
      moved = true;
      break;
    }
  }

  if (!moved) {
    kept.push(entry);
  }
}

// Write cleaned movement.json
writeFileSync(`${dir}/movement.json`, JSON.stringify(kept, null, 2) + '\n');
console.log(`\nMovement: ${movement.length} -> ${kept.length} entries (removed ${movement.length - kept.length})`);

// Append moved entries to target files
for (const [file, entries] of Object.entries(movedEntries)) {
  const target = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
  const existingWords = new Set(target.map(e => `${e.word}|${e.reading}`));

  let added = 0;
  for (const entry of entries) {
    const key = `${entry.word}|${entry.reading}`;
    if (!existingWords.has(key)) {
      target.push(entry);
      added++;
    } else {
      console.log(`SKIP (already exists in ${file}): ${entry.word}`);
    }
  }

  // Sort by rank
  target.sort((a, b) => a.rank - b.rank);
  writeFileSync(`${dir}/${file}`, JSON.stringify(target, null, 2) + '\n');
  console.log(`${file}: added ${added} entries (${entries.length} moved, ${entries.length - added} already existed)`);
}
