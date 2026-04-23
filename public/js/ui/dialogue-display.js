import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
import * as narrationBox from './narration-box.js';

/**
 * Display a sequence of dialogue lines in the narration box.
 * Tokens are pre-enriched by the server — each content token carries
 * `meaning` and optionally `meanings`.
 *
 * @param {Array<{text: string, tokens: Array, overrides?: Object}>} lines
 * @param {Object} options
 * @param {string|Object} [options.speaker]
 * @param {boolean} [options.useKanji]
 */
export async function showDialogueLines(lines, options = {}) {
  const { speaker, useKanji = false } = options;
  const knownWords = getKnownWords();

  for (const line of lines) {
    const html = renderJpSentence(
      line.tokens,
      knownWords,
      null,
      line.overrides || {},
      useKanji
    );
    await narrationBox.show(html, { speaker, html: true });
  }
}
