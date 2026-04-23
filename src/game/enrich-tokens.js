import {
  isContentExposureToken,
  getTokenBaseForm,
  resolveExposureMeaning,
} from '../../public/js/shared/exposure-extractor.js';

function getDictEntry(dict, baseForm) {
  if (!dict || !baseForm) return null;
  if (typeof dict.get === 'function') return dict.get(baseForm) || null;
  return dict[baseForm] || null;
}

/**
 * Stamp `meaning` (and `meanings` when dict has an entry) on every content token,
 * resolved via the shared override → entity → token.meaning → dict priority.
 *
 * @param {Array} tokens
 * @param {Object<string,string>} overrides
 * @param {Map|Object} dict
 * @returns {Array} new token array (input is not mutated)
 */
export function enrichTokens(tokens, overrides, dict) {
  if (!Array.isArray(tokens)) return tokens;
  return tokens.map(token => {
    if (!isContentExposureToken(token)) return token;
    const meaning = resolveExposureMeaning(token, dict, overrides);
    const entry = getDictEntry(dict, getTokenBaseForm(token));
    const meanings = entry?.definitions || null;
    const next = { ...token, meaning };
    if (meanings) next.meanings = meanings;
    return next;
  });
}
