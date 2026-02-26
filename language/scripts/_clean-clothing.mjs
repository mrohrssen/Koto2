import fs from 'fs';
import path from 'path';

const dir = 'language/categories';

// Manually classified entries to MOVE out of clothing.json
const moveTargets = {
  '血|567': 'body-parts',
  '首|595': 'body-parts',
  'カンカン|25216': 'body-parts',
  'リップ|26796': 'body-parts',
  'おじさん|2929': 'social',
  '船長|10132': 'social',
  'っ子|10136': 'social',
  'トレーナー|25435': 'social',
  '食らう|3315': 'actions',
  '切り替わる|8708': 'actions',
  'ガラリ|23123': 'actions',
  'ハンバーグ|9137': 'foods',
  'ルート|3350': 'locations',
  '隅々|7221': 'locations',
  'たった今|5123': 'numbers-time',
  'シーツ|5501': 'objects',
  'モニター|7810': 'objects',
  '絨毯|7915': 'objects',
  '桶|10166': 'objects',
  '広告|10062': 'objects',
  'バスタオル|13903': 'objects',
  'これぐらい|8303': 'abstract',
  'これっぽっち|8670': 'abstract',
  '同類|10229': 'abstract',
  'イコール|14038': 'abstract',
  'ダブル|16579': 'abstract',
  '見て見ぬふり|17154': 'abstract',
  'じゃ無い|17320': 'abstract',
  '一着|18163': 'abstract',
  '百歩譲る|21412': 'abstract',
  '衣食住|22422': 'abstract',
  '引き際|24153': 'abstract',
  '人徳|24657': 'abstract',
  '早い者勝ち|26756': 'abstract',
  '華奢|5613': 'descriptors',
  '強張る|7721': 'descriptors',
  '下手|15558': 'descriptors',
  'まがい|15869': 'descriptors',
  '予期せぬ|16232': 'descriptors',
  '炎天下|25720': 'nature',
  '瀕死|10147': 'combat',
  '刺し殺す|26568': 'combat',
  '恥をかく|9734': 'emotions',
};

// Read clothing.json
const clothing = JSON.parse(fs.readFileSync(path.join(dir, 'clothing.json'), 'utf8'));
const originalCount = clothing.length;

const cleaned = [];
const toAppend = {}; // targetFile -> [entries]
const seenWordRank = new Set();

for (const entry of clothing) {
  const key = `${entry.word}|${entry.rank}`;

  // Skip exact duplicates (same word+rank seen before)
  if (seenWordRank.has(key)) continue;
  seenWordRank.add(key);

  // Check if this entry should be moved to another file
  if (moveTargets[key]) {
    const target = moveTargets[key];
    if (!toAppend[target]) toAppend[target] = [];
    toAppend[target].push(entry);
    continue;
  }

  cleaned.push(entry);
}

// Remove cross-spelling duplicates:
// 被る (kanji) is duplicate of かぶる (hiragana, rank 2449) — remove all kanji forms
// クロス rank 25557 is duplicate of rank 20869
const finalCleaned = cleaned.filter(e => {
  if (e.word === '被る') return false;
  if (e.word === 'クロス' && e.rank === 25557) return false;
  return true;
});

// Write cleaned clothing.json
fs.writeFileSync(
  path.join(dir, 'clothing.json'),
  JSON.stringify(finalCleaned, null, 2) + '\n'
);

// Append to each target file (avoiding duplicates)
for (const [target, entries] of Object.entries(toAppend)) {
  const filePath = path.join(dir, `${target}.json`);
  const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const existingKeys = new Set(existing.map(e => `${e.word}|${e.rank}`));

  let added = 0;
  for (const entry of entries) {
    const key = `${entry.word}|${entry.rank}`;
    if (!existingKeys.has(key)) {
      existing.push(entry);
      added++;
    }
  }

  if (added > 0) {
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n');
    console.log(`  ${target}.json: +${added} entries`);
  }
}

const removed = originalCount - finalCleaned.length;
console.log(`\nCleaned clothing.json: ${originalCount} → ${finalCleaned.length} entries (removed ${removed})`);
