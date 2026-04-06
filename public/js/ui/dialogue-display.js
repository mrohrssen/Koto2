/**
 * Renders and displays dialogue lines (CID scripts, NPC greetings, etc.)
 * using the sentence renderer and narration box.
 */
import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
import * as narrationBox from './narration-box.js';

let _wordDict = new Map();

/**
 * Set the client-side word dictionary (called once at game init).
 * @param {Object} dictObj - { word: { reading, definitions[] } }
 */
export function setWordDictionary(dictObj) {
  _wordDict = new Map(Object.entries(dictObj));
}

/**
 * Display a sequence of dialogue lines in the narration box.
 * Each line has pre-tokenized data from the server.
 * @param {Array<{text: string, tokens: Array, overrides?: Object}>} lines
 * @param {Object} options
 * @param {string|Object} [options.speaker] - Speaker label
 * @param {boolean} [options.useKanji] - false for Areas 1-3
 * @returns {Promise<void>}
 */
export async function showDialogueLines(lines, options = {}) {
  const { speaker, useKanji = false } = options;
  const knownWords = getKnownWords();

  for (const line of lines) {
    const html = renderJpSentence(
      line.tokens,
      knownWords,
      _wordDict,
      line.overrides || {},
      useKanji
    );
    await narrationBox.show(html, { speaker, html: true });
  }
}
