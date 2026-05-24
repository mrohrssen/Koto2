import { tokenize } from '../../tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from './grammar-loader.js';
import { findGrammarMatches } from './grammar-matcher.js';
import { annotateRenderTokens } from './annotate-tokens.js';

const DEMOTED_POS = new Set(['助詞', '助動詞', '補助記号', '記号', '空白', '接尾辞', '接頭辞']);
const DEMOTED_BASE_FORMS = new Set(['いる', 'ある', 'しまう', 'おく', 'みる', 'くる', 'いく', 'だ', 'です', 'ます', 'する']);
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

export function tokenizeAndAnnotate(text, options = {}) {
  const rawTokens = tokenize(text);
  const catalog = options.catalog || loadGrammarCatalog();
  const matchers = options.matchers || loadGrammarMatchers();
  const matches = findGrammarMatches(rawTokens, { catalog, matchers });
  const renderTokens = rawTokens.map(toRenderToken);
  const annotated = annotateRenderTokens(renderTokens, rawTokens, matches);
  return {
    rawTokens,
    tokens: annotated,
    words: annotated.filter(t => t.base).map(t => t.base),
  };
}

function toRenderToken(st) {
  const rawTokenStart = st.rawTokenStart ?? st.index;
  const rawTokenEnd = st.rawTokenEnd ?? st.index;
  if (isDemoted(st)) {
    return {
      surface: st.surface,
      reading: st.reading || st.surface,
      rawTokenStart,
      rawTokenEnd,
    };
  }
  return {
    surface: st.surface,
    base: st.baseForm,
    reading: st.reading,
    pos: SUDACHI_POS_EN[st.pos] || st.pos,
    rawTokenStart,
    rawTokenEnd,
  };
}

function isDemoted(st) {
  if (DEMOTED_POS.has(st.pos)) return true;
  if (DEMOTED_BASE_FORMS.has(st.baseForm)) return true;
  if (/^[\p{P}\p{S}\s]+$/u.test(st.surface)) return true;
  return false;
}
