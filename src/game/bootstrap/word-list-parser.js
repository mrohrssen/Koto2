// src/game/bootstrap/word-list-parser.js

const HAS_JAPANESE_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

export function parseWordList(text) {
  if (!text) return [];
  const seen = new Set();
  const words = [];
  for (const line of text.split(/\r?\n/)) {
    const word = line.trim();
    if (word && HAS_JAPANESE_RE.test(word) && !seen.has(word)) {
      seen.add(word);
      words.push(word);
    }
  }
  return words;
}
