/**
 * @file i18n.js - Japanify UI Translation Module
 *
 * PURPOSE:
 * Provides a simple translation layer for UI strings. When "Japanify UI" is
 * enabled in settings, gameplay text displays in Japanese instead of English.
 *
 * KEY EXPORTS:
 * - setLang('en'|'ja'): Set the active language
 * - t(key, ...args): Get translated string with optional interpolation
 * - isJapanified(): Check if Japanese mode is active
 *
 * SCOPE:
 * Japanified: combat, collection, equip, shrine, quiz, game
 *   over, item popups, buff overlay, flash card hints
 * Always English: auth, settings, bug report, speed review, menu sheet,
 *   leaderboard, error messages, stat abbreviations, creature/enemy names
 */

let lang = 'en';

const strings = {
  // ── Combat: damage labels ──
  criticalHit:      { en: 'CRITICAL HIT!',   ja: 'クリティカル！' },
  perfectDodge:     { en: 'PERFECT DODGE!',   ja: '完全回避！' },
  dodged:           { en: 'DODGED!',          ja: '回避！' },
  miss:             { en: 'MISS!',            ja: 'ミス！' },
  critical:         { en: 'CRITICAL!',        ja: 'クリティカル！' },
  superEffective:   { en: 'super effective!', ja: '効果抜群！' },
  notVeryEffective: { en: 'not very effective...', ja: 'いまひとつ...' },

  // ── Combat: actions ──
  defending:        { en: 'DEFENDING \u2014 50% damage, +1 charge', ja: '防御中 \u2014 ダメージ50%、チャージ+1' },
  defendingCreature: { en: 'DEFENDING - 50% damage',                ja: '防御中 \u2014 ダメージ50%' },
  dealsDamage:      { en: '{0} deals {1} damage',   ja: '{0}が{1}ダメージ！' },
  dealsStrong:      { en: '{0} deals {1} damage (super effective!)',      ja: '{0}が{1}ダメージ！（効果抜群！）' },
  dealsWeak:        { en: '{0} deals {1} damage (not very effective...)', ja: '{0}が{1}ダメージ（いまひとつ...）' },
  dealsHalved:      { en: '{0} deals {1} (halved)',  ja: '{0}が{1}（半減）' },
  swapsIn:          { en: '{0} swaps in!',           ja: '{0}が交代！' },
  befriended:       { en: 'BEFRIENDED {0}!',         ja: '{0}と友達になった！' },
  letItGo:          { en: 'Let it go...',             ja: '見送った…' },
  cascade:          { en: 'Cascade: +{0}',            ja: 'カスケード: +{0}' },

  // ── Combat: befriend ──
  partyFullTitle:   { en: 'Party Full! Choose a monster to release:', ja: 'パーティが満員！誰をリリースする？' },
  equipped:         { en: 'Equipped',     ja: '装備中' },
  reserve:          { en: 'Reserve',      ja: '控え' },
  letItGoBtn:       { en: 'Let it go (skip)', ja: '見送る（スキップ）' },
  roundLabel:       { en: 'Round {0}/3',  ja: 'ラウンド {0}/3' },

  // ── Collection / team select ──
  selectTeam:       { en: 'Select Your Team', ja: 'チーム選択' },
  startRun:         { en: 'Start Run ({0} monster{1})', ja: '出撃（{0}体）' },
  newCreature:      { en: 'New: {0}!',       ja: '新規: {0}！' },

  // ── Equip screens ──
  inventory:        { en: 'Inventory',       ja: 'インベントリ' },
  emptySlot:        { en: 'Empty',           ja: '空き' },
  equippedCreatures: { en: 'Equipped Monsters (Front Line)', ja: '出撃モンスター（前衛）' },
  reserveCreatures: { en: 'Reserve Monsters',  ja: '控えモンスター' },
  noReserves:       { en: 'No reserve monsters', ja: '控えモンスターなし' },
  swapInstruction:  { en: 'Tap an equipped monster, then a reserve to swap them.', ja: '前衛→控えの順にタップで交代' },

  // ── Game over ──
  defeated:         { en: 'Defeated',           ja: '敗北' },
  runEnded:         { en: 'Your run has ended.', ja: '探索は終了した。' },
  floorRooms:       { en: 'Floor {0} · {1} rooms cleared', ja: 'フロア{0}・{1}部屋クリア' },

  // ── Shrine ──
  chooseToTrain:    { en: 'Choose a monster to train', ja: '修練するモンスターを選べ' },
  leveledUp:        { en: '{0} leveled up to Lv. {1}!', ja: '{0}がLv.{1}にレベルアップ！' },

  // ── Quiz rewards ──
  chooseToHeal:     { en: 'Choose a monster to heal',     ja: '回復するモンスターを選べ' },
  chooseToLevelUp:  { en: 'Choose a monster to level up', ja: 'レベルアップするモンスターを選べ' },

  // ── Exploration: badges ──
  new:              { en: 'NEW', ja: '新規' },

  // ── Creature labels ──
  passive:          { en: 'Passive',     ja: 'パッシブ' },
  skillColon:       { en: 'Skill: {0}',  ja: 'スキル: {0}' },
  noPassive:        { en: 'No passive effect', ja: 'パッシブ効果なし' },
  noSkill:          { en: 'No skill',     ja: 'スキルなし' },
  ready:            { en: 'Ready!',       ja: '発動可能！' },
  charging:         { en: 'Charging {0}/{1}', ja: 'チャージ中 {0}/{1}' },

  // ── Post-combat shop ──
  chooseReward:     { en: 'Choose a Reward', ja: '報酬を選べ' },

  // ── Flash card hints ──
  hintCombat:       { en: '\u2190 didn\'t know \u00A0|\u00A0 knew it \u2192',
                      ja: '\u2190 知らない \u00A0|\u00A0 知ってた \u2192' },
  hintDiscovery:    { en: '\u2190 learn \u00A0|\u00A0 learn \u2192',
                      ja: '\u2190 覚える \u00A0|\u00A0 覚える \u2192' },
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
  let str = entry[lang] || entry.en;
  for (let i = 0; i < args.length; i++) {
    str = str.replace(`{${i}}`, args[i]);
  }
  return str;
}

/**
 * Check if Japanese UI mode is active
 * @returns {boolean}
 */
export function isJapanified() {
  return lang === 'ja';
}
