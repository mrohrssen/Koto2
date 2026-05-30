import { tokenizeBatch } from '../tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from './grammar/grammar-loader.js';
import { findGrammarMatches } from './grammar/grammar-matcher.js';
import { annotateRenderTokens } from './grammar/annotate-tokens.js';

const DEMOTED_POS = new Set([
  '助詞',
  '助動詞',
  '補助記号',
  '記号',
  '空白',
  '接尾辞',
  '接頭辞',
]);

const DEMOTED_BASE_FORMS = new Set([
  'いる',
  'ある',
  'しまう',
  'おく',
  'みる',
  'くる',
  'いく',
  'だ',
  'です',
  'ます',
  'する',
]);

const SUDACHI_POS_EN = {
  '名詞': 'Noun',
  '動詞': 'Verb',
  '形容詞': 'Adjective',
  '副詞': 'Adverb',
  '連体詞': 'Pre-noun',
  '接続詞': 'Conjunction',
  '感動詞': 'Interjection',
  '形状詞': 'Na-adjective',
  '代名詞': 'Pronoun',
  '助詞': 'Particle',
  '助動詞': 'Auxiliary',
  '接尾辞': 'Suffix',
  '接頭辞': 'Prefix',
};

function getDictEntry(dict, key) {
  if (!dict || !key) return null;
  if (typeof dict.get === 'function') return dict.get(key) || null;
  return dict[key] || null;
}

function isDemoted(token) {
  if (token._isMerged) return false;
  if (DEMOTED_POS.has(token.pos)) return true;
  if (DEMOTED_BASE_FORMS.has(token.baseForm)) return true;
  return /^[\p{P}\p{S}\s]+$/u.test(token.surface);
}

function mergeSudachiTokens(tokens, dict) {
  const merged = [];
  let i = 0;
  const maxMerge = 5;
  while (i < tokens.length) {
    let matched = false;
    for (let len = Math.min(maxMerge, tokens.length - i); len >= 2; len -= 1) {
      const combined = tokens.slice(i, i + len).map(t => t.surface).join('');
      const entry = getDictEntry(dict, combined);
      if (!entry) continue;
      const contentPos = tokens.slice(i, i + len)
        .map(t => t.pos)
        .find(p => SUDACHI_POS_EN[p]) || tokens[i].pos;
      merged.push({
        surface: combined,
        baseForm: combined,
        pos: contentPos,
        reading: entry.reading || combined,
        rawTokenStart: tokens[i].index,
        rawTokenEnd: tokens[i + len - 1].index,
        _isMerged: true
      });
      i += len;
      matched = true;
      break;
    }
    if (!matched) {
      const token = tokens[i];
      merged.push({
        ...token,
        rawTokenStart: token.index,
        rawTokenEnd: token.index
      });
      i += 1;
    }
  }
  return merged;
}

function toRenderToken(token, dict) {
  if (isDemoted(token)) {
    return {
      token: {
        surface: token.surface,
        reading: token.reading || token.surface,
        rawTokenStart: token.rawTokenStart ?? token.index,
        rawTokenEnd: token.rawTokenEnd ?? token.index
      },
      isContent: false
    };
  }

  const entry = getDictEntry(dict, token.baseForm);
  const reading = token.baseForm === '私'
    ? entry?.reading || token.reading
    : token.reading;

  return {
    token: {
      surface: token.surface,
      base: token.baseForm,
      reading,
      pos: SUDACHI_POS_EN[token.pos] || token.pos,
      rawTokenStart: token.rawTokenStart ?? token.index,
      rawTokenEnd: token.rawTokenEnd ?? token.index
    },
    isContent: true
  };
}

export function tokenizeDialogueTexts(
  texts,
  {
    dict,
    grammarCatalog = loadGrammarCatalog(),
    grammarMatchers = loadGrammarMatchers()
  } = {}
) {
  const input = (texts || []).map(text => String(text || ''));
  const tokenized = tokenizeBatch(input);

  return tokenized.map(rawTokens => {
    const unifiedRaw = rawTokens.map((token, index) => ({ ...token, index }));
    const matches = findGrammarMatches(unifiedRaw, {
      catalog: grammarCatalog,
      matchers: grammarMatchers
    });
    const merged = mergeSudachiTokens(unifiedRaw, dict);
    const tokens = [];
    const words = [];
    for (const raw of merged) {
      const { token, isContent } = toRenderToken(raw, dict);
      tokens.push(token);
      if (isContent) words.push(token.base);
    }
    return {
      tokens: annotateRenderTokens(tokens, unifiedRaw, matches),
      words
    };
  });
}
