#!/usr/bin/env node
/**
 * Clean up emotions.json - move misplaced entries to their correct category files.
 * Categorization decisions were made by manual review of every entry.
 */
import { readFileSync, writeFileSync } from 'fs';
const DIR = new URL('../categories/', import.meta.url).pathname;

// Map of rank -> target category for entries that DON'T belong in emotions
const moves = {
  // → actions: physical actions unrelated to feelings
  574:  'actions',   // 行動 "action"
  579:  'actions',   // すむ "to finish"
  714:  'actions',   // 受け取る "to receive"
  1678: 'actions',   // 抱く (いだく) "to hold in one's arms"
  2899: 'actions',   // 震わせる "to (make something) quiver"
  5458: 'actions',   // 掻く "to scratch"
  5550: 'actions',   // 冷やす "to cool"
  6016: 'actions',   // 懐く (いだく) "to hold in one's arms"
  6292: 'actions',   // 呼び寄せる "to call"
  6705: 'actions',   // 電話をかける "to telephone"
  8388: 'actions',   // 肩を竦める "to shrug one's shoulders"
  10849:'actions',   // 替わる "to succeed"
  16350:'actions',   // 盗聴 "interception"
  22495:'actions',   // 引っ張り込む "to drag in"

  // → abstract: concepts, grammar, adverbs unrelated to feelings
  609:  'abstract',  // むしろ "rather"
  868:  'abstract',  // ような気がする "(I) think (that)"
  878:  'abstract',  // 成功 "success"
  969:  'abstract',  // まだまだ "still"
  3398: 'abstract',  // 思いっきり "to one's heart's content"
  3579: 'abstract',  // 幸運 "good luck"
  4268: 'abstract',  // あるらしい "seems to be"
  4595: 'abstract',  // 悲劇 "tragedy" (event, not emotion)
  5388: 'abstract',  // からすると "judging from"
  5601: 'abstract',  // 幻想 "fantasy"
  6396: 'abstract',  // あり得る "possible"
  6449: 'abstract',  // さぞ "surely"
  6606: 'abstract',  // 圧迫 "pressure" (physical)
  7047: 'abstract',  // 活気 "energy"
  7477: 'abstract',  // このため "because of this"
  9152: 'abstract',  // 一理 "(a) principle"
  10378:'abstract',  // 手当 "salary"
  10490:'abstract',  // そのはず "only natural"
  11358:'abstract',  // 絶命 "end of life"
  13060:'abstract',  // 呼称 "naming"
  13610:'abstract',  // 具現化 "embodiment"
  14904:'abstract',  // 応じて "in proportion to"
  15910:'abstract',  // 内包 "connotation"
  15943:'abstract',  // 薬師 "Bhaisajyaguru"
  16356:'abstract',  // 根幹 "foundation"
  20117:'abstract',  // 時代劇 "historical play"
  20710:'abstract',  // 所為 "act"
  20960:'abstract',  // 所定 "prescribed"
  22489:'abstract',  // よしんば "even if"
  20229:'abstract',  // 思いっ切り "to one's heart's content" (duplicate)

  // → descriptors: adjectives/qualities not about emotional states
  565:  'descriptors', // 空 (から) "emptiness" (physical)
  881:  'descriptors', // 最高 "most"
  2692: 'descriptors', // 精神的 "mental"
  2855: 'descriptors', // 凄い "terrible/amazing"
  2922: 'descriptors', // ヤバい "dangerous"
  3763: 'descriptors', // 敏感 "sensitive"
  3774: 'descriptors', // 残酷 "cruel"
  5369: 'descriptors', // 傲慢 "haughty"
  5397: 'descriptors', // 重たい "heavy"
  5675: 'descriptors', // 誠実 "sincere"
  6075: 'descriptors', // 滑稽 "funny"
  6319: 'descriptors', // 軽々 "lightly"
  6337: 'descriptors', // 無責任 "irresponsibility"
  6371: 'descriptors', // 慌ただしい "busy"
  6550: 'descriptors', // 悲惨 "disastrous"
  6986: 'descriptors', // 正真正銘 "genuine"
  7144: 'descriptors', // 手っ取り早い "quick"
  8391: 'descriptors', // 凶暴 "ferocious"
  10117:'descriptors', // 広範囲 "extensive"
  13769:'descriptors', // 消極的 "negative"
  13791:'descriptors', // 生半可 "superficial"
  14128:'descriptors', // 超人 "superman"
  15294:'descriptors', // 希薄 "thin (e.g. air)"
  16353:'descriptors', // 無双 "peerless"
  16360:'descriptors', // 底なし "bottomless"
  18660:'descriptors', // 円滑 "smooth"
  20715:'descriptors', // 控え目 "moderate"
  20722:'descriptors', // 不真面目 "not serious"
  25860:'descriptors', // 無作法 "ill-mannered"

  // → social: interpersonal actions, social roles, greetings
  860:  'social',    // 協力 "cooperation"
  2604: 'social',    // 歓迎 "welcome"
  3440: 'social',    // お疲れ "thanks (for coming)"
  4019: 'social',    // 別れ "parting"
  4460: 'social',    // 友情 "friendship"
  5576: 'social',    // 仲直り "reconciliation"
  6410: 'social',    // 行事 "event"
  6569: 'social',    // 演説 "speech"
  6698: 'social',    // 現役 "active duty"
  8712: 'social',    // セクハラ "sexual harassment"
  10217:'social',    // よろしくお願いいたします "please remember me"
  10258:'social',    // 通行人 "passerby"
  10707:'social',    // 約束を守る "to keep a promise"
  12469:'social',    // 下僕 "manservant"
  13117:'social',    // 赤の他人 "complete stranger"
  13597:'social',    // 家の人 "one's family"
  18659:'social',    // 親睦 "friendship"
  20914:'social',    // 野盗 "brigand"
  26344:'social',    // 空軍 "air force"

  // → locations
  5766: 'locations', // 銀行 "bank"
  6328: 'locations', // ドイツ "Germany"
  6885: 'locations', // 両側 "both sides"
  10207:'locations', // わん "bay"
  10712:'locations', // 民家 "private house"
  15689:'locations', // 武蔵 "Musashi (former province)"
  26978:'locations', // プラネタリウム "planetarium"

  // → combat
  4201: 'combat',    // 挑発 "provocation"
  5853: 'combat',    // 対決 "confrontation"
  9161: 'combat',    // 雄叫び "war cry"
  22678:'combat',    // 斬り伏せる "to slay"

  // → nature
  5756: 'nature',    // 日差し "sunlight"
  6385: 'nature',    // 熱気 "heat"
  12516:'nature',    // 生命体 "life-form"

  // → movement
  6571: 'movement',  // じりじり "slowly (but steadily)"
  6983: 'numbers-time', // ひとしきり "for a while" (→ numbers-time actually)
  10180:'movement',  // 乗り "riding"
  11169:'movement',  // すうっと "straight"
  11924:'movement',  // 這い上がる "to creep up"
  12488:'movement',  // ころころ "lightly rolling"
  13432:'movement',  // 馬上 "horseback"
  24127:'movement',  // 練り歩く "to parade"

  // → numbers-time
  // 6983 already listed above under movement key (corrected target)
  14968:'numbers-time', // ほどなくして "after a short while"

  // → objects
  4724: 'objects',   // 代物 "article"
  14132:'objects',   // マッチ "match (to light fire)"
  23573:'objects',   // 俵 "straw bag"

  // → foods
  13608:'foods',     // クレープ "crêpe"

  // → clothing
  10061:'clothing',  // 冠 "traditional cap"

  // → body-parts
  14907:'body-parts', // 両膝 "both knees"
  26339:'body-parts', // 腑 "internal organ"
};

// Entries to just remove (empty/unclear/inappropriate)
const removeRanks = new Set([
  923,   // すぎ - empty reading/meaning
  6680,  // がん - empty reading/meaning
  6682,  // のめる - empty reading/meaning
  10125, // たが - empty reading/meaning
  25290, // 中出し - sexual term, not an emotion
]);

// Fix: rank 6983 should go to numbers-time, not movement
// (already handled by having it in the moves map pointing to numbers-time)

// Read emotions.json
const emotionsPath = DIR + 'emotions.json';
const emotions = JSON.parse(readFileSync(emotionsPath, 'utf-8'));
console.log(`Emotions: ${emotions.length} entries`);

// Separate entries
const moveRanks = new Set(Object.keys(moves).map(Number));
const kept = [];
const moved = {};   // target -> entries[]
let removed = 0;

for (const entry of emotions) {
  const r = entry.rank;
  if (removeRanks.has(r)) {
    console.log(`  REMOVE: rank ${r} "${entry.word}"`);
    removed++;
  } else if (moveRanks.has(r)) {
    const target = moves[r];
    if (!moved[target]) moved[target] = [];
    moved[target].push(entry);
    console.log(`  MOVE: rank ${r} "${entry.word}" → ${target}`);
  } else {
    kept.push(entry);
  }
}

console.log(`\nKept: ${kept.length}, Removed: ${removed}, Moved: ${Object.values(moved).reduce((a, b) => a + b.length, 0)}`);

// Write cleaned emotions.json
writeFileSync(emotionsPath, JSON.stringify(kept, null, 2) + '\n');
console.log(`\nWrote cleaned emotions.json (${kept.length} entries)`);

// Append moved entries to their target files
for (const [target, entries] of Object.entries(moved)) {
  const path = DIR + target + '.json';
  const existing = JSON.parse(readFileSync(path, 'utf-8'));
  const combined = [...existing, ...entries];
  // Sort by rank for consistency
  combined.sort((a, b) => a.rank - b.rank);
  writeFileSync(path, JSON.stringify(combined, null, 2) + '\n');
  console.log(`Appended ${entries.length} entries to ${target}.json (now ${combined.length} total)`);
}

console.log('\nDone!');
