/**
 * @fileoverview Parse bootstrap narration tagged text format
 * @module src/game/bootstrap-parser
 *
 * Parses {english|kanji|hiragana|romaji} tags in hand-authored narration.
 * Returns an array of segments: plain text or tagged word objects.
 */

// Match {english|kanji|hiragana|romaji} — exactly 4 pipe-separated fields
const TAG_RE = /\{([^|{}]+)\|([^|{}]+)\|([^|{}]+)\|([^|{}]+)\}/g;

/**
 * Parse bootstrap text into segments.
 * Returns array of { type: 'text', content } or { type: 'word', english, kanji, hiragana, romaji }
 */
export function parseBootstrapText(text) {
  const segments = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TAG_RE)) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    segments.push({
      type: 'word',
      english: match[1],
      kanji: match[2],
      hiragana: match[3],
      romaji: match[4]
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining plain text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  // If no tags found, return entire text as one segment
  if (segments.length === 0) {
    segments.push({ type: 'text', content: text });
  }

  return segments;
}

/**
 * Extract just the kanji/word strings from tagged text (for exposure tracking)
 */
export function extractTaggedWords(text) {
  return [...text.matchAll(TAG_RE)].map(m => m[2]);
}
