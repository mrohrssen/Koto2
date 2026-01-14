/**
 * Mock data for e2e tests
 * Used when JPDB is not available
 */

export const MOCK_VOCABULARY = [
  '食べる', '飲む', '見る', '聞く', '行く', '来る', '言う', '思う',
  '知る', '分かる', '読む', '書く', '話す', '買う', '使う', '作る',
  '走る', '歩く', '座る', '立つ', '寝る', '起きる', '待つ', '始める',
  '終わる', '開ける', '閉める', '持つ', '置く', '入れる', '出す', '乗る',
];

export const MOCK_DUE_WORDS = [
  { word: '食べる', meanings: ['eat'], vid: 1001, sid: 1, reading: 'たべる' },
  { word: '飲む', meanings: ['drink'], vid: 1002, sid: 1, reading: 'のむ' },
  { word: '見る', meanings: ['see', 'watch', 'look'], vid: 1003, sid: 1, reading: 'みる' },
  { word: '聞く', meanings: ['hear', 'listen', 'ask'], vid: 1004, sid: 1, reading: 'きく' },
  { word: '行く', meanings: ['go'], vid: 1005, sid: 1, reading: 'いく' },
  { word: '来る', meanings: ['come'], vid: 1006, sid: 1, reading: 'くる' },
  { word: '言う', meanings: ['say', 'tell'], vid: 1007, sid: 1, reading: 'いう' },
  { word: '思う', meanings: ['think', 'feel'], vid: 1008, sid: 1, reading: 'おもう' },
  { word: '知る', meanings: ['know'], vid: 1009, sid: 1, reading: 'しる' },
  { word: '分かる', meanings: ['understand'], vid: 1010, sid: 1, reading: 'わかる' },
];

export const DEFAULT_STATS = {
  str: 1,
  agi: 1,
  vit: 1,
  int: 1,
  dex: 1,
  luk: 1,
};

export const DEFAULT_STAT_POINTS = 48;

export const WARDS = {
  nerima: { id: 'nerima', name: '練馬区', nameEn: 'Nerima Ward' },
  setagaya: { id: 'setagaya', name: '世田谷区', nameEn: 'Setagaya Ward' },
  shibuya: { id: 'shibuya', name: '渋谷区', nameEn: 'Shibuya Ward' },
  shinjuku: { id: 'shinjuku', name: '新宿区', nameEn: 'Shinjuku Ward' },
  chiyoda: { id: 'chiyoda', name: '千代田区', nameEn: 'Chiyoda Ward' },
};

export const GAME_PHASES = [
  'no_save',
  'hub',
  'ward_selection',
  'exploring',
  'room',
  'room_encounter',
  'combat',
  'boss_ready',
  'floor_complete',
  'run_ended',
  'post_combat_shop',
] as const;

export type GamePhase = typeof GAME_PHASES[number];
