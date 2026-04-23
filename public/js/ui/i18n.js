import { renderEnFirst } from './bootstrap-client.js';

let lang = 'en';

function escHtml(s) {
  if (typeof s !== 'string') return String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const strings = {
  // ── Combat: damage labels ──
  criticalHit:      { en: 'CRITICAL HIT!',   ja: 'クリティカル！',
                      tagged: '{CRITICAL HIT|クリティカル|}!' },
  perfectDodge:     { en: 'PERFECT DODGE!',   ja: '完全回避！',
                      tagged: 'PERFECT {DODGE|回避|かいひ}!' },
  dodged:           { en: 'DODGED!',          ja: '回避！',
                      tagged: '{DODGED|回避|かいひ}!' },
  miss:             { en: 'MISS!',            ja: 'ミス！' },
  critical:         { en: 'CRITICAL!',        ja: 'クリティカル！',
                      tagged: '{CRITICAL|クリティカル|}!' },
  superEffective:   { en: 'super effective!', ja: '効果抜群！',
                      tagged: 'super {effective|効果抜群|こうかばつぐん}!' },
  notVeryEffective: { en: 'not very effective...', ja: 'いまひとつ...' },

  // ── Combat: actions ──
  defending:        { en: 'DEFENDING \u2014 50% damage, +1 charge', ja: '防御中 \u2014 ダメージ50%、チャージ+1',
                      tagged: '{DEFENDING|防御中|ぼうぎょちゅう} \u2014 50% {damage|ダメージ|}, +1 {charge|チャージ|}' },
  defendingCreature: { en: 'DEFENDING - 50% damage',                ja: '防御中 \u2014 ダメージ50%',
                      tagged: '{DEFENDING|防御中|ぼうぎょちゅう} - 50% {damage|ダメージ|}' },
  dealsDamage:      { en: '{0} deals {1} damage',   ja: '{0}が{1}ダメージ！',
                      tagged: '{0} deals {1} {damage|ダメージ|}' },
  dealsStrong:      { en: '{0} deals {1} damage (super effective!)',      ja: '{0}が{1}ダメージ！（効果抜群！）',
                      tagged: '{0} deals {1} {damage|ダメージ|} (super {effective|効果抜群|こうかばつぐん}!)' },
  dealsWeak:        { en: '{0} deals {1} damage (not very effective...)', ja: '{0}が{1}ダメージ（いまひとつ...）',
                      tagged: '{0} deals {1} {damage|ダメージ|} (not very effective...)' },
  dealsHalved:      { en: '{0} deals {1} (halved)',  ja: '{0}が{1}（半減）',
                      tagged: '{0} deals {1} ({halved|半減|はんげん})' },
  swapsIn:          { en: '{0} swaps in!',           ja: '{0}が交代！' },
  wasDefeated:      { en: '{0} was defeated!',       ja: '{0}が倒れた！' },
  letItGo:          { en: 'Let it go...',             ja: '見送った…',
                      tagged: '{Let it go|見送った|みおくった}...' },
  cascade:          { en: 'Cascade: +{0}',            ja: 'カスケード: +{0}',
                      tagged: '{Cascade|カスケード|}: +{0}' },

  // ── Combat: befriend ──
  partyFullTitle:   { en: 'Party Full! Choose a monster to release:', ja: 'パーティが満員！誰をリリースする？',
                      tagged: 'Party Full! Choose a monster to {release|リリース|}:' },
  equipped:         { en: 'Equipped',     ja: '装備中',
                      tagged: '{Equipped|装備中|そうびちゅう}' },
  reserve:          { en: 'Reserve',      ja: '控え',
                      tagged: '{Reserve|控え|ひかえ}' },
  letItGoBtn:       { en: 'Let it go (skip)', ja: '見送る（スキップ）',
                      tagged: '{Let it go|見送る|みおくる} (skip)' },
  roundLabel:       { en: 'Round {0}/3',  ja: 'ラウンド {0}/3',
                      tagged: '{Round|ラウンド|} {0}/3' },
  befriendBossFirst: { en: 'Beat this boss once, then you can befriend them on a rematch.',
                      ja: '一度倒すと、再戦で仲間にできる。',
                      tagged: 'Beat this boss once, then you can {befriend|仲間に|なかまに} them on a rematch.' },
  befriendFailedGeneric: { en: 'Befriend did not work. Combat continues.',
                      ja: '仲間にならなかった。戦闘は続く。',
                      tagged: '{Befriend|仲間|なかま} did not work. Combat continues.' },
  befriendDialogueUnavailable: { en: 'Befriend chat could not load. Try again or use attack.',
                      ja: '会話を読み込めなかった。もう一度か攻撃を。',
                      tagged: 'Befriend chat could not load. Try again or use {attack|攻撃|こうげき}.' },
  befriendSwapFailed: { en: 'Could not swap party members. Try again.',
                      ja: '入れ替えできなかった。もう一度。',
                      tagged: 'Could not {swap|入れ替え|いれかえ} party members. Try again.' },
  befriendTalkBlocked: { en: 'Cannot talk right now (try another action).',
                      ja: '今は話せない（別の行動を）。',
                      tagged: 'Cannot talk right now (try another {action|行動|こうどう}).' },
  befriendPartyFullLine: { en: '{0} wants to join — but your party is full!',
                      ja: '{0}が仲間になりたがっている — パーティ満員！',
                      tagged: '{0} wants to join — but your party is {full|満員|まんいん}!' },

  // ── Whack-a-Mole: finish narration ──
  wamXpGained:      { en: 'Your team gained {0} XP!',
                      ja: 'チームが{0}XPを獲得！' },
  wamZeroXp:        { en: 'Your team gained 0 XP. Better luck next time!',
                      ja: '0XPでした。次回頑張りましょう！' },

  // ── Collection / team select ──
  selectTeam:       { en: 'Select Your Team', ja: 'チーム選択',
                      tagged: '{Select|選択|せんたく} Your Team' },
  startRun:         { en: 'Start Run ({0} monster{1})', ja: '出撃（{0}体）' },
  newCreature:      { en: 'New: {0}!',       ja: '新規: {0}！',
                      tagged: '{New|新規|しんき}: {0}!' },

  // ── Equip screens ──
  inventory:        { en: 'Inventory',       ja: 'インベントリ',
                      tagged: '{Inventory|インベントリ|}' },
  emptySlot:        { en: 'Empty',           ja: '空き',
                      tagged: '{Empty|空き|あき}' },
  equippedCreatures: { en: 'Equipped Monsters (Front Line)', ja: '出撃モンスター（前衛）',
                      tagged: '{Equipped|装備中|そうびちゅう} Monsters (Front Line)' },
  reserveCreatures: { en: 'Reserve Monsters',  ja: '控えモンスター',
                      tagged: '{Reserve|控え|ひかえ} Monsters' },
  noReserves:       { en: 'No reserve monsters', ja: '控えモンスターなし',
                      tagged: 'No {reserve|控え|ひかえ} monsters' },
  swapInstruction:  { en: 'Tap an equipped monster, then a reserve to swap them.', ja: '前衛→控えの順にタップで交代',
                      tagged: 'Tap an {equipped|装備中|そうびちゅう} monster, then a {reserve|控え|ひかえ} to swap them.' },

  // ── Game over ──
  defeated:         { en: 'Defeated',           ja: '敗北',
                      tagged: '{Defeated|敗北|はいぼく}' },
  runEnded:         { en: 'Your run has ended.', ja: '探索は終了した。',
                      tagged: 'Your {run|探索|たんさく} has ended.' },
  floorRooms:       { en: 'Floor {0} · {1} rooms cleared', ja: 'フロア{0}・{1}部屋クリア',
                      tagged: 'Floor {0} · {1} {rooms|部屋|へや} {cleared|クリア|}' },

  // ── Shrine ──
  chooseToTrain:    { en: 'Choose a monster to train', ja: '修練するモンスターを選べ',
                      tagged: 'Choose a monster to {train|修練|しゅうれん}' },
  leveledUp:        { en: '{0} leveled up to Lv. {1}!', ja: '{0}がLv.{1}にレベルアップ！',
                      tagged: '{0} {leveled up|レベルアップ|} to Lv. {1}!' },

  // ── Quiz rewards ──
  chooseToHeal:     { en: 'Choose a monster to heal',     ja: '回復するモンスターを選べ',
                      tagged: 'Choose a monster to {heal|回復|かいふく}' },
  chooseToLevelUp:  { en: 'Choose a monster to level up', ja: 'レベルアップするモンスターを選べ',
                      tagged: 'Choose a monster to {level up|レベルアップ|}' },

  // ── Exploration: badges ──
  new:              { en: 'NEW', ja: '新規',
                      tagged: '{NEW|新規|しんき}' },

  // ── Creature labels ──
  passive:          { en: 'Passive',     ja: 'パッシブ',
                      tagged: '{Passive|パッシブ|}' },
  skillColon:       { en: 'Skill: {0}',  ja: 'スキル: {0}',
                      tagged: '{Skill|スキル|}: {0}' },
  noPassive:        { en: 'No passive effect', ja: 'パッシブ効果なし',
                      tagged: 'No {passive|パッシブ|} {effect|効果|こうか}' },
  noSkill:          { en: 'No skill',     ja: 'スキルなし',
                      tagged: 'No {skill|スキル|}' },
  ready:            { en: 'Ready!',       ja: '発動可能！',
                      tagged: '{Ready|発動可能|はつどうかのう}!' },
  charging:         { en: 'Charging {0}/{1}', ja: 'チャージ中 {0}/{1}',
                      tagged: '{Charging|チャージ中|} {0}/{1}' },

  // ── Post-combat shop ──
  chooseReward:     { en: 'Choose a Reward', ja: '報酬を選べ',
                      tagged: 'Choose a {Reward|報酬|ほうしゅう}' },

  // ── Flash card hints ──
  hintCombat:       { en: '\u2190 didn\'t know \u00A0|\u00A0 knew it \u2192',
                      ja: '\u2190 知らない \u00A0|\u00A0 知ってた \u2192' },
  hintDiscovery:    { en: '\u2190 learn \u00A0|\u00A0 learn \u2192',
                      ja: '\u2190 覚える \u00A0|\u00A0 覚える \u2192' },

  // ── Dealer room ──
  dealerCompanions:   { en: 'Companion Monsters',  ja: '仲間モンスター',
                        tagged: '{Companion|仲間|なかま} Monsters' },
  dealerSoldOut:      { en: 'Sold Out',             ja: '購入済み',
                        tagged: '{Sold Out|購入済み|こうにゅうずみ}' },
  dealerSell:         { en: 'Sell ({0}/{1})',        ja: '売却 ({0}/{1})',
                        tagged: '{Sell|売却|ばいきゃく} ({0}/{1})' },
  dealerSellLimit:    { en: 'Sell Limit ({0}/{1})',  ja: '売却上限 ({0}/{1})',
                        tagged: '{Sell Limit|売却上限|ばいきゃくじょうげん} ({0}/{1})' },
  dealerActive:       { en: 'Active',               ja: 'アクティブ',
                        tagged: '{Active|アクティブ|}' },
  dealerReserve:      { en: 'Reserve',              ja: 'リザーブ',
                        tagged: '{Reserve|リザーブ|}' },
  dealerSellBtn:      { en: 'Sell {0}cr',           ja: '売 {0}cr',
                        tagged: '{Sell|売|う} {0}cr' },
  dealerLeave:        { en: 'Leave',                ja: '立ち去る',
                        tagged: '{Leave|立ち去る|たちさる}' },
  dealerBuyBtn:       { en: '{0}cr \u2014 befriend', ja: '{0}cr で仲間に',
                        tagged: '{0}cr \u2014 {befriend|仲間に|なかまに}' },
  dealerGreeting:     { en: 'Welcome! Rare monsters just arrived!',
                        ja: 'いらっしゃい！珍しいモンスターが入荷したよ！',
                        tagged: '{Welcome|いらっしゃい|}! {Rare|珍しい|めずらしい} monsters just {arrived|入荷した|にゅうかした}!' },
  dealerEmpty:        { en: 'No monsters available', ja: 'モンスターがいない',
                        tagged: 'No monsters {available|いない|}' },

  // ── Status effects ──
  effectConfuse:    { en: 'CONFUSE!',   ja: '混乱!',     tagged: '{CONFUSE|混乱|こんらん}!' },
  effectStun:       { en: 'STUN!',      ja: 'スタン!',    tagged: '{STUN|スタン|}!' },
  effectSleep:      { en: 'SLEEP!',     ja: '眠り!',     tagged: '{SLEEP|眠り|ねむり}!' },
  effectAtkUp:      { en: 'ATK UP!',    ja: 'ATK UP!' },
  effectAtkDown:    { en: 'ATK DOWN!',  ja: 'ATK DOWN!' },
  effectHaste:      { en: 'HASTE!',     ja: 'ヘイスト!',  tagged: '{HASTE|ヘイスト|}!' },
  effectShield:     { en: 'SHIELD!',    ja: 'シールド!',  tagged: '{SHIELD|シールド|}!' },
  effectDefUp:      { en: 'DEF UP!',    ja: 'DEF UP!' },
  effectSpdUp:      { en: 'SPD UP!',    ja: 'SPD UP!' },

  // ── Action buttons ──
  equipMonsters:    { en: 'Monster Equipment', ja: 'モンスター装備',
                      tagged: 'Monster {Equipment|装備|そうび}' },
};

/**
 * Set the active language
 * @param {'en'|'ja'} l
 */
export function setLang(l) {
  lang = l === 'ja' ? 'ja' : 'en';
}

/**
 * Get a translated string, with optional {0}, {1}, ... interpolation
 * @param {string} key - Translation key
 * @param {...*} args - Values to substitute into {0}, {1}, etc.
 * @returns {string}
 */
export function t(key, ...args) {
  const entry = strings[key];
  if (!entry) return key;

  // If tagged version exists, render through bootstrap en-first renderer
  if (entry.tagged) {
    let str = entry.tagged;
    // Escape interpolation args to prevent XSS
    args.forEach((a, i) => { str = str.replace(`{${i}}`, escHtml(a)); });
    return renderEnFirst(str);
  }

  // Fallback to current behavior
  const str = entry[lang] || entry.en || key;
  let result = str;
  args.forEach((a, i) => { result = result.replace(`{${i}}`, a); });
  return result;
}

/**
 * Plain UI string (en/ja only) — no HTML. Use for narration, toasts, and
 * anywhere text is assigned with textContent; t() tagged strings are HTML.
 */
export function tPlain(key, ...args) {
  const entry = strings[key];
  if (!entry) return key;
  let result = entry[lang] || entry.en || key;
  args.forEach((a, i) => {
    result = String(result).replace(`{${i}}`, a == null ? '' : String(a));
  });
  return result;
}

/**
 * Check if Japanese UI mode is active
 * @returns {boolean}
 */
export function isJapanified() {
  return lang === 'ja';
}
