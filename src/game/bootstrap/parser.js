// Matches {english|kanji|reading} — requires exactly 2 pipes.
// Does NOT match {0}, {1} interpolation tokens (no pipes).
const TAG_RE = /\{([^|{}]*)\|([^|{}]*)\|([^|}]*)\}/g;

/**
 * Parse text with {english|kanji|reading} tags into segments.
 * @param {string} text - Tagged text string
 * @returns {Array<{type: 'text', content: string} | {type: 'word', english: string, kanji: string, reading: string}>}
 */
export function parseTaggedText(text) {
  if (!text) return [];
  const segments = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TAG_RE)) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'word',
      english: match[1],
      kanji: match[2],
      reading: match[3]
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}
