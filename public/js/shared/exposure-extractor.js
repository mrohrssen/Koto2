const SYMBOL_ONLY_RE = /^[\p{P}\p{S}\s]+$/u;

export const PUNCT_POS = new Set(['記号', '補助記号', '空白']);

function getDictEntry(wordDict, baseForm) {
  if (!wordDict || !baseForm) return null;
  if (typeof wordDict.get === 'function') {
    return wordDict.get(baseForm) || null;
  }
  return wordDict[baseForm] || null;
}

export function getTokenBaseForm(token) {
  return token?.base || token?.baseForm || '';
}

export function isContentExposureToken(token) {
  const baseForm = getTokenBaseForm(token);
  if (!baseForm) return false;

  const surface = token?.surface || '';
  if (SYMBOL_ONLY_RE.test(surface)) return false;

  return !PUNCT_POS.has(token?.pos);
}

export function lookupDictPrimary(wordDict, baseForm) {
  const entry = getDictEntry(wordDict, baseForm);
  if (!entry?.definitions?.length) return '';
  const primary = entry.definitions.find(d => d.primary);
  return primary?.en || entry.definitions[0]?.en || '';
}

export function resolveExposureMeaning(token, wordDict, overrides = {}) {
  const baseForm = getTokenBaseForm(token);
  if (!baseForm) return '';
  if (overrides?.[baseForm]) return overrides[baseForm];
  if (token?.entity && token?.meaning) return token.meaning;
  if (token?.meaning) return token.meaning;
  return lookupDictPrimary(wordDict, baseForm);
}

export function extractExposureEntries(tokens, wordDict, overrides = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  return tokens
    .filter(isContentExposureToken)
    .map(token => ({
      word: getTokenBaseForm(token),
      meaning: resolveExposureMeaning(token, wordDict, overrides),
    }));
}
