import { HIRAGANA_DECK } from './hiragana-deck.js';
import { getKotoKanjiEntries } from './koto-kanji-dictionary.js';

export const SCRIPT_CARD_TYPES = ['hiragana', 'katakana', 'kanji'];

const KATAKANA_BASE = [
  ['ア', 'a'], ['イ', 'i'], ['ウ', 'u'], ['エ', 'e'], ['オ', 'o'],
  ['カ', 'ka'], ['キ', 'ki'], ['ク', 'ku'], ['ケ', 'ke'], ['コ', 'ko'],
  ['サ', 'sa'], ['シ', 'shi'], ['ス', 'su'], ['セ', 'se'], ['ソ', 'so'],
  ['タ', 'ta'], ['チ', 'chi'], ['ツ', 'tsu'], ['テ', 'te'], ['ト', 'to'],
  ['ナ', 'na'], ['ニ', 'ni'], ['ヌ', 'nu'], ['ネ', 'ne'], ['ノ', 'no'],
  ['ハ', 'ha'], ['ヒ', 'hi'], ['フ', 'fu'], ['ヘ', 'he'], ['ホ', 'ho'],
  ['マ', 'ma'], ['ミ', 'mi'], ['ム', 'mu'], ['メ', 'me'], ['モ', 'mo'],
  ['ヤ', 'ya'], ['ユ', 'yu'], ['ヨ', 'yo'],
  ['ラ', 'ra'], ['リ', 'ri'], ['ル', 'ru'], ['レ', 're'], ['ロ', 'ro'],
  ['ワ', 'wa'], ['ヲ', 'wo'], ['ン', 'n'],
  ['ガ', 'ga'], ['ギ', 'gi'], ['グ', 'gu'], ['ゲ', 'ge'], ['ゴ', 'go'],
  ['ザ', 'za'], ['ジ', 'ji'], ['ズ', 'zu'], ['ゼ', 'ze'], ['ゾ', 'zo'],
  ['ダ', 'da'], ['ヂ', 'ji'], ['ヅ', 'zu'], ['デ', 'de'], ['ド', 'do'],
  ['バ', 'ba'], ['ビ', 'bi'], ['ブ', 'bu'], ['ベ', 'be'], ['ボ', 'bo'],
  ['パ', 'pa'], ['ピ', 'pi'], ['プ', 'pu'], ['ペ', 'pe'], ['ポ', 'po'],
];

function scriptCard({ type, prompt, answer, reading = prompt, keyword = null, sortIndex, source, frequencyRank = null }) {
  const card = {
    id: `${type}:${prompt}`,
    type,
    prompt,
    answer,
    reading,
    keyword,
    sortIndex,
    source,
  };
  if (frequencyRank !== null) card.frequencyRank = frequencyRank;
  return card;
}

export const HIRAGANA_SCRIPT_CARDS = HIRAGANA_DECK.map((entry, index) => scriptCard({
  type: 'hiragana',
  prompt: entry.char,
  answer: entry.romaji,
  reading: entry.char,
  sortIndex: index + 1,
  source: 'builtin-hiragana',
}));

export const KATAKANA_SCRIPT_CARDS = KATAKANA_BASE.map(([char, romaji], index) => scriptCard({
  type: 'katakana',
  prompt: char,
  answer: romaji,
  reading: char,
  sortIndex: index + 1,
  source: 'builtin-katakana',
}));

export const KANJI_SCRIPT_CARDS = getKotoKanjiEntries().map((entry, index) => scriptCard({
  type: 'kanji',
  prompt: entry.kanji,
  answer: entry.primaryMeaning,
  reading: entry.primaryReading,
  keyword: entry.primaryMeaning,
  sortIndex: index + 1,
  source: 'koto-kanji-dictionary',
  frequencyRank: entry.frequencyRank,
}));

export function getStaticScriptCards(type) {
  if (type === 'hiragana') return HIRAGANA_SCRIPT_CARDS;
  if (type === 'katakana') return KATAKANA_SCRIPT_CARDS;
  if (type === 'kanji') return KANJI_SCRIPT_CARDS;
  return [];
}

export function isScriptCardType(type) {
  return SCRIPT_CARD_TYPES.includes(type);
}
