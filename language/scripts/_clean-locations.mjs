#!/usr/bin/env node
// One-shot cleanup: move misplaced entries out of locations.json
// Entries identified by manual review (not algorithmic classification)

import { readFileSync, writeFileSync } from 'fs';
const DIR = new URL('../categories/', import.meta.url).pathname;

const moves = {
  actions: [
    '挟む', '下す', '繰り出す', '惹く', '癒す', '蹴り飛ばす', '換える',
    '攻め込む', '吊るす', '嵌る', '形作る', '連れ回す', '食いしばる',
    '絶つ', '火照る', 'なりすます', 'ひけらかす', '後を継ぐ', 'ブレる',
    '見物', '建設', '建造', '改築', '新築', '増築', '造作', '開店',
    '登山', '野宿', '移転',
  ],
  social: [
    'お兄さん', '殿', '領主', '大統領', 'こんばんは', 'ご主人', 'お主',
    '店長', '強者', '農家', '狂人', '同居人', '侵略者', 'うちら',
    'バカ野郎', 'っていうか', 'やっぱ', 'ほほほ', 'ほとんどの人',
    '近所さん', '後妻', '城主', '地主', '神童', '白雪姫', 'つべこべ',
    'ハーレム', '商家',
  ],
  descriptors: [
    '素人', '臆病', '下品', '細か', '上級', 'ひっそり', '小規模',
    '私立', '危ねえ', '小ぶり', '鋭敏', '言いようのない', '頭がおかしい',
    'ゴチャゴチャ', '小気味よい', '高価い', '外来', 'まるっきり',
    'ボソッと', '尊い', '小高い',
  ],
  emotions: [
    'お詫び', '嘆息', '反感', '親切心', '気分がいい', 'リラックス',
    '仲がいい', '色めき立つ',
  ],
  'numbers-time': [
    '今すぐ', '土', '一匹', '江戸時代',
  ],
  abstract: [
    '集中力', '究極', '許容', '宣戦布告', '死因', '先入観', '挙動',
    '堕落', '図星', '目当て', '裏付け', '身の危険', '準', 'いい度胸',
    '同罪', '一択', '判断基準', '一途', '余念がない', 'ぶっちぎり',
    'あわや', 'と言えど', '相まって', '棚に上げる', '見栄を張る',
    '足元を見る', '人が変わる', '路頭に迷う', '惨状', '後付け', '注',
    '予防', '流行り', '激務', '尖', 'びる', '不動産', '学校生活',
    '定例', '地理', '立ち入り禁止', '見せ場', '医術',
  ],
  movement: [
    '揺れ', 'ぶらぶら', '出', '風に乗る', '隆起',
  ],
  'body-parts': [
    '人手', '鳩尾', '口許', '脂', '膣壁', '脳細胞',
  ],
  clothing: [
    'ドレス', 'ジャケット', '羽織', '軽装',
  ],
  animals: [
    'ライオン',
  ],
  nature: [
    '百合', 'こだま',
  ],
  foods: [
    'ゼリー',
  ],
  combat: [
    '剣技', '力比べ', '空襲', '特殊部隊', '防衛線',
  ],
  objects: [
    '黒板', 'パイプ椅子', '監視カメラ', '石像', '梯子', '荷台',
    'ポスト', '障害物', '雑貨', '留守電', 'チャンネル', 'ホームページ',
    '幌', '浴槽', '洗面台', 'サイト',
  ],
};

// Build lookup: word → target category
const wordToTarget = new Map();
for (const [target, words] of Object.entries(moves)) {
  for (const w of words) wordToTarget.set(w, target);
}

// Read locations.json
const locations = JSON.parse(readFileSync(DIR + 'locations.json', 'utf8'));
console.log(`locations.json: ${locations.length} entries`);

// Partition
const keep = [];
const moved = new Map(); // target → [entries]
for (const entry of locations) {
  const target = wordToTarget.get(entry.word);
  if (target) {
    if (!moved.has(target)) moved.set(target, []);
    moved.get(target).push(entry);
    // Mark as used so we can detect words not found
    wordToTarget.delete(entry.word);
  } else {
    keep.push(entry);
  }
}

// Warn about words not found
if (wordToTarget.size > 0) {
  console.log(`\nWARNING: ${wordToTarget.size} words not found in locations.json:`);
  for (const [w, t] of wordToTarget) console.log(`  ${w} → ${t}`);
}

// Write cleaned locations.json
writeFileSync(DIR + 'locations.json', JSON.stringify(keep, null, 2) + '\n');
console.log(`\nlocations.json: ${keep.length} entries (removed ${locations.length - keep.length})`);

// Append to target files
for (const [target, entries] of moved) {
  const path = DIR + target + '.json';
  const existing = JSON.parse(readFileSync(path, 'utf8'));
  const combined = [...existing, ...entries];
  writeFileSync(path, JSON.stringify(combined, null, 2) + '\n');
  console.log(`${target}.json: appended ${entries.length} (now ${combined.length})`);
}
