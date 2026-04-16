export const HIRAGANA_DECK = [
  // Row 0: vowels
  { char: 'あ', romaji: 'a', row: 0 },
  { char: 'い', romaji: 'i', row: 0 },
  { char: 'う', romaji: 'u', row: 0 },
  { char: 'え', romaji: 'e', row: 0 },
  { char: 'お', romaji: 'o', row: 0 },
  // Row 1: ka
  { char: 'か', romaji: 'ka', row: 1 },
  { char: 'き', romaji: 'ki', row: 1 },
  { char: 'く', romaji: 'ku', row: 1 },
  { char: 'け', romaji: 'ke', row: 1 },
  { char: 'こ', romaji: 'ko', row: 1 },
  // Row 2: sa
  { char: 'さ', romaji: 'sa', row: 2 },
  { char: 'し', romaji: 'shi', row: 2 },
  { char: 'す', romaji: 'su', row: 2 },
  { char: 'せ', romaji: 'se', row: 2 },
  { char: 'そ', romaji: 'so', row: 2 },
  // Row 3: ta
  { char: 'た', romaji: 'ta', row: 3 },
  { char: 'ち', romaji: 'chi', row: 3 },
  { char: 'つ', romaji: 'tsu', row: 3 },
  { char: 'て', romaji: 'te', row: 3 },
  { char: 'と', romaji: 'to', row: 3 },
  // Row 4: na
  { char: 'な', romaji: 'na', row: 4 },
  { char: 'に', romaji: 'ni', row: 4 },
  { char: 'ぬ', romaji: 'nu', row: 4 },
  { char: 'ね', romaji: 'ne', row: 4 },
  { char: 'の', romaji: 'no', row: 4 },
  // Row 5: ha
  { char: 'は', romaji: 'ha', row: 5 },
  { char: 'ひ', romaji: 'hi', row: 5 },
  { char: 'ふ', romaji: 'fu', row: 5 },
  { char: 'へ', romaji: 'he', row: 5 },
  { char: 'ほ', romaji: 'ho', row: 5 },
  // Row 6: ma
  { char: 'ま', romaji: 'ma', row: 6 },
  { char: 'み', romaji: 'mi', row: 6 },
  { char: 'む', romaji: 'mu', row: 6 },
  { char: 'め', romaji: 'me', row: 6 },
  { char: 'も', romaji: 'mo', row: 6 },
  // Row 7: ya (3 cards)
  { char: 'や', romaji: 'ya', row: 7 },
  { char: 'ゆ', romaji: 'yu', row: 7 },
  { char: 'よ', romaji: 'yo', row: 7 },
  // Row 8: ra
  { char: 'ら', romaji: 'ra', row: 8 },
  { char: 'り', romaji: 'ri', row: 8 },
  { char: 'る', romaji: 'ru', row: 8 },
  { char: 'れ', romaji: 're', row: 8 },
  { char: 'ろ', romaji: 'ro', row: 8 },
  // Row 9: wa (3 cards)
  { char: 'わ', romaji: 'wa', row: 9 },
  { char: 'を', romaji: 'wo', row: 9 },
  { char: 'ん', romaji: 'n', row: 9 },
  // Row 10: ga (dakuten)
  { char: 'が', romaji: 'ga', row: 10 },
  { char: 'ぎ', romaji: 'gi', row: 10 },
  { char: 'ぐ', romaji: 'gu', row: 10 },
  { char: 'げ', romaji: 'ge', row: 10 },
  { char: 'ご', romaji: 'go', row: 10 },
  // Row 11: za
  { char: 'ざ', romaji: 'za', row: 11 },
  { char: 'じ', romaji: 'ji', row: 11 },
  { char: 'ず', romaji: 'zu', row: 11 },
  { char: 'ぜ', romaji: 'ze', row: 11 },
  { char: 'ぞ', romaji: 'zo', row: 11 },
  // Row 12: da
  { char: 'だ', romaji: 'da', row: 12 },
  { char: 'ぢ', romaji: 'ji', row: 12 },
  { char: 'づ', romaji: 'zu', row: 12 },
  { char: 'で', romaji: 'de', row: 12 },
  { char: 'ど', romaji: 'do', row: 12 },
  // Row 13: ba
  { char: 'ば', romaji: 'ba', row: 13 },
  { char: 'び', romaji: 'bi', row: 13 },
  { char: 'ぶ', romaji: 'bu', row: 13 },
  { char: 'べ', romaji: 'be', row: 13 },
  { char: 'ぼ', romaji: 'bo', row: 13 },
  // Row 14: pa (handakuten)
  { char: 'ぱ', romaji: 'pa', row: 14 },
  { char: 'ぴ', romaji: 'pi', row: 14 },
  { char: 'ぷ', romaji: 'pu', row: 14 },
  { char: 'ぺ', romaji: 'pe', row: 14 },
  { char: 'ぽ', romaji: 'po', row: 14 },
];

export function getRowCards(row) {
  return HIRAGANA_DECK.filter(c => c.row === row);
}
