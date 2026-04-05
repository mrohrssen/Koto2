// src/tokenizer.js
/**
 * Wraps lindera-wasm-unidic-nodejs for normalized Japanese tokenization.
 * Returns: [{ surface, baseForm, pos, reading }]
 *
 * UniDic detail fields (17 total):
 *   [0]  pos1      品詞大分類   (e.g. 動詞, 名詞, 助詞, 補助記号)
 *   [1]  pos2      品詞中分類
 *   [2]  pos3      品詞小分類
 *   [3]  pos4      品詞細分類
 *   [4]  cType     活用型       (e.g. 五段-バ行, 下一段-バ行)
 *   [5]  cForm     活用形       (e.g. 連用形-撥音便, 終止形-一般)
 *   [6]  lForm     語彙素読み   lemma reading in katakana (e.g. アソブ)
 *   [7]  lemma     語彙素       dictionary/lemma form (e.g. 遊ぶ)
 *   [8]  orth      書字形       surface orthographic form
 *   [9]  pron      発音形       surface pronunciation in katakana
 *   [10] orthBase  書字形基底形 base orthographic form
 *   [11] pronBase  発音形基底形 base pronunciation in katakana
 *   [12] goshu     語種         (和, 漢, 混, 外, 記号, etc.)
 *   [13-16] additional fields (usually *)
 */

import { TokenizerBuilder } from 'lindera-wasm-unidic-nodejs';

let _tokenizer = null;

function getTokenizer() {
  if (_tokenizer) return _tokenizer;
  const builder = new TokenizerBuilder();
  builder.setDictionary('embedded://unidic');
  builder.setMode('normal');
  _tokenizer = builder.build();
  return _tokenizer;
}

/**
 * Tokenize Japanese text into normalized token objects.
 * @param {string} text - Japanese text to tokenize
 * @returns {Array<{surface: string, baseForm: string, pos: string, reading: string}>}
 */
export function tokenize(text) {
  if (!text || text.trim().length === 0) return [];
  const tokenizer = getTokenizer();
  const rawTokens = tokenizer.tokenize(text);

  return rawTokens.map(token => {
    const surface = token.surface;
    const detail = token.details;
    const pos = detail[0] ?? '';
    const lemma = detail[7] ?? surface;
    const readingKatakana = detail[6] ?? '';
    const reading = katakanaToHiragana(readingKatakana) || surface;
    return { surface, baseForm: lemma, pos, reading };
  });
}

/**
 * Convert katakana string to hiragana.
 * @param {string} str
 * @returns {string}
 */
function katakanaToHiragana(str) {
  if (!str) return '';
  return str.replace(/[\u30A1-\u30F6]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}
