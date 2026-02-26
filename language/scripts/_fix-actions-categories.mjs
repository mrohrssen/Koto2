#!/usr/bin/env node
/**
 * One-shot script: moves miscategorized entries from actions.json to correct category files.
 * Categories determined by manual review - not a programmatic classifier.
 */
import { readFileSync, writeFileSync } from 'fs';
const dir = new URL('../categories/', import.meta.url).pathname;
const read = f => JSON.parse(readFileSync(dir + f, 'utf8'));
const write = (f, data) => writeFileSync(dir + f, JSON.stringify(data, null, 2) + '\n');

// Words to move, keyed by target category filename
const moves = {
  'body-parts.json': [
    '舌',        // tongue
    '前髪',      // forelock
    '寝顔',      // sleeping face
    '上目遣い',   // upturned eyes
  ],
  'combat.json': [
    '攻撃',      // attack
    '戦い',      // battle
    '破壊',      // destruction
    '侵入',      // invasion
    '乱暴',      // violence
    '爆発',      // explosion
    '襲撃',      // attack
    '暴力',      // violence
    '一撃',      // blow
    '挑戦',      // challenge
    '突撃',      // charge
    '不意打ち',   // surprise attack
    '実戦',      // combat
    '威嚇',      // threat
    '降参',      // surrender
    '牽制',      // check
    '打撃',      // blow
    '格闘',      // hand-to-hand fighting
    '拷問',      // torture
    '対抗',      // opposition
    '攻略',      // capture
    '崩壊',      // collapse
    '突破',      // breaking through
    '封印',      // seal
    '罵倒',      // verbal abuse
    '暴走',      // acting rashly
    '蹂躙',      // trampling down
    '殲滅',      // extermination
    '追撃',      // pursuit (of enemy)
    '撃退',      // repulse
    '斬撃',      // slash
    '粉砕',      // pulverization
    '皆殺し',    // massacre
    '炸裂',      // violent explosion
    '射撃',      // firing
    '暗殺',      // assassination
    '討伐',      // subjugation
    '激突',      // crash into
    '封鎖',      // blockade
    '咆哮',      // roar (battle context)
    '潜入',      // infiltration
    '貫通',      // passing through (bullet)
    '蹴り',      // kick (combat noun)
    '突き',      // thrust (combat noun)
    'パンチ',    // punch
    '捕獲',      // capture
    '偵察',      // scouting
  ],
  'descriptors.json': [
    'いろんな',    // various
    '淡い',       // light
    '散々',       // thoroughly
    '上手い',     // skillful
    '堪能',       // proficient
    'ほんのり',    // slightly
    '貧乏',       // poverty-stricken
    '強制的',     // forced
    '鮮明',       // vivid
    'でっかい',    // huge
    '分かりやすい', // easy to understand
    '有能',       // able
    '強固',       // firm
    '思いがけない', // unexpected
    '清潔',       // clean
    'のんき',      // carefree
    '快適',       // pleasant
    '絶好',       // best
    '奥深い',     // profound
    '意味不明',    // of uncertain meaning
    '手っ取り早い', // quick
    '多大',       // great quantity
    '絶大',       // tremendous
    '良好',       // good
  ],
  'abstract.json': [
    '自体',       // itself
    '行為',       // act
    '拘束',       // restriction
    '解除',       // cancellation
    '確保',       // securing
    '排除',       // exclusion
    '特性',       // special characteristic
    '形態',       // form
    '圧迫',       // pressure
    '構築',       // construction
    '欠点',       // fault
    '遂行',       // accomplishment
    '制御',       // control
    '手続き',     // procedure
    '計',         // plan
    '制止',       // control
    '追求',       // pursuit
    '操作',       // operation
    '回収',       // collection
    '確立',       // establishment
    '解明',       // elucidation
    '浸透',       // permeation
    '防止',       // prevention
    '進出',       // advance
    '改革',       // reform
    '飛躍',       // leaping (abstract)
    '尽力',       // efforts
    '投資',       // investment
    '有',         // existence
    '改良',       // improvement
    '収集',       // collecting
    '解体',       // demolition
    '恰好',       // shape
    '開閉',       // opening and shutting
  ],
  'social.json': [
    '上司',       // superior
    'おめでとう',  // congratulations
    '逮捕',       // arrest
    '異性',       // opposite sex
    '演説',       // speech
    'コメント',    // comment
    '労働',       // manual labor
    '恩人',       // benefactor
    '援助',       // assistance
    'お伺い',     // call (visiting)
    '手当て',     // salary
    '警戒心',     // wariness
    '連行',       // taking to police
    '謁見',       // audience
    'お世辞',     // flattery
    '署名',       // signature
    '主催',       // sponsorship
    '談笑',       // friendly chat
    'お喋り',     // chattering
    '敬礼',       // salute
    'いたずら',   // mischief
    '尋問',       // questioning
    '仕返し',     // payback
    '愛撫',       // caressing
    '看病',       // nursing a patient
    '強要',       // coercion
  ],
  'locations.json': [
    '王国',       // kingdom
    '浜',         // beach
    '岸',         // bank
  ],
  'nature.json': [
    '潮',         // tide
    'ガス',       // gas
  ],
  'numbers-time.json': [
    'さっきから',  // since some time ago
    '二十歳',     // 20 years old
    '土曜日',     // Saturday
    'この頃',     // these days
    'そのうちに',  // before very long
    '一滴',       // one drop
  ],
  'emotions.json': [
    '笑い',       // laugh
    '狼狽',       // confusion
    '正気',       // sanity
    '泣き声',     // cry
  ],
  'objects.json': [
    '忘れ物',     // lost article
    '楽器',       // musical instrument
    '包丁',       // kitchen knife
    '白衣',       // white clothes
    '列',         // row
    '銃声',       // gunshot sound
  ],
  'foods.json': [
    'おかわり',    // another helping
  ],
  'clothing.json': [
    '着替え',     // changing clothes
    '身なり',     // dress/appearance
  ],
  'movement.json': [
    '運動',       // exercise
    '足取り',     // gait
    '追跡',       // chase
    '突入',       // rushing into
    '突進',       // rush
    '背伸び',     // standing on tiptoe
    '退散',       // dispersing
    '飛行',       // aviation
    '跳躍',       // jump
    '尾行',       // shadowing/following
  ],
  'animals.json': [
    '怪物',       // monster
    '鳴き声',     // cry (animal)
    '魔女',       // witch
  ],
};

// Also remove broken entries (empty meaning/reading) entirely
const brokenWords = [
  'だけあって',
  'やしない',
  '見とれる',
  '休める',
  '呼び出し',
  'はて',
];

// Also remove grammar/adverbial expressions that don't fit actions
// Move to abstract as closest fit
const grammarToAbstract = [
  'に限って',     // particularly
  'どう考えても',  // surely
  '何なのか',     // what is it
  '何という',     // how (beautiful)
  'こうなると',    // given the situation
  'をおいて',     // other than
  'がかる',       // to appear...
  'どっと',       // bursting out
  'いやいや',     // unwillingly
  '順に',        // in order
  '見たところ',   // in appearance
  'パス',        // passing
  'アウト',       // out
  '事はない',     // there is no need
  '訳じゃない',   // it does not mean
  'きゅっと',     // creakingly
  'きょろきょろ', // restlessly
  'ガタガタ',     // rattling
  'くすくす',     // chuckle
  'こくり',       // nodding
  '工事',        // construction work
  '小刻み',       // mincing
  '独り言',       // soliloquy
  '手つき',       // manner of using hands
  '仕草',        // gesture
  '動作',        // action (noun)
  '正座',        // seiza
  '土下座',       // kneeling down
  '深呼吸',       // deep breath
  '横目',        // sidelong glance
  '鼓動',        // heartbeat
  '充満',        // being filled with
  '後押し',       // pushing (support)
  '注視',        // gazing steadily
  '凝視',        // stare
  '洗濯',        // washing
  '開放',        // opening
  '閉鎖',        // closing
  '消化',        // digestion
  '破裂',        // explosion
  '追及',        // investigation
  '捜索',        // search
  '探索',        // search
  '改造',        // remodeling
  '鍛錬',        // tempering
  '装着',        // equipping
  '採取',        // picking
  '片付け',       // tidying up
];

// Actually, let me reconsider - many of those last ones ARE action-adjacent.
// Let me be more conservative and only move the truly wrong ones.
// Remove the grammarToAbstract list and keep most action-nouns in actions.

// Build set of all words to remove from actions
const allWordsToMove = new Set();
for (const [, words] of Object.entries(moves)) {
  for (const w of words) allWordsToMove.add(w);
}
for (const w of brokenWords) allWordsToMove.add(w);

// Read actions
const actions = read('actions.json');
const originalCount = actions.length;

// Partition
const kept = [];
const removed = new Map(); // word -> entry
for (const entry of actions) {
  if (allWordsToMove.has(entry.word)) {
    // Only remove first occurrence (some words appear twice)
    if (!removed.has(entry.word)) {
      removed.set(entry.word, entry);
    } else {
      kept.push(entry);
    }
  } else {
    kept.push(entry);
  }
}

// Write filtered actions
write('actions.json', kept);
console.log(`actions.json: ${originalCount} → ${kept.length} (removed ${originalCount - kept.length})`);

// Append to target files
for (const [file, words] of Object.entries(moves)) {
  const target = read(file);
  const beforeCount = target.length;
  for (const word of words) {
    const entry = removed.get(word);
    if (entry) {
      target.push(entry);
    } else {
      console.log(`  WARNING: "${word}" not found in actions.json`);
    }
  }
  write(file, target);
  console.log(`${file}: ${beforeCount} → ${target.length} (+${target.length - beforeCount})`);
}

// Report broken entries removed entirely
console.log(`\nBroken entries removed entirely: ${brokenWords.filter(w => removed.has(w)).join(', ')}`);
console.log('Done!');
