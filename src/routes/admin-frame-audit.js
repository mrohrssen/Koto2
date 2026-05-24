import { Router } from 'express';
import { readFileSync } from 'fs';
import { adminAuth } from './admin.js';
import { resolveLiveDictPath } from '../game/live-dict-path.js';
import { tokenizeBatch } from '../tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from '../game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../game/grammar/grammar-matcher.js';
import { annotateRenderTokens } from '../game/grammar/annotate-tokens.js';

// Match the demotion logic used by scripts/tokenize-static.js so preview
// tokenizations line up with what the game actually renders.
const DEMOTED_POS = new Set(['助詞', '助動詞', '補助記号', '記号', '空白', '接尾辞', '接頭辞']);
const DEMOTED_BASE_FORMS = new Set([
  'いる', 'ある', 'しまう', 'おく', 'みる', 'くる', 'いく', 'だ', 'です', 'ます', 'する',
]);
const SUDACHI_POS_EN = {
  '名詞': 'Noun', '動詞': 'Verb', '形容詞': 'Adjective', '副詞': 'Adverb',
  '連体詞': 'Pre-noun', '接続詞': 'Conjunction', '感動詞': 'Interjection',
  '形状詞': 'Na-adjective', '代名詞': 'Pronoun',
};

function normalizeTokens(rawTokens) {
  return rawTokens.map(t => {
    const isDemoted =
      DEMOTED_POS.has(t.pos) ||
      DEMOTED_BASE_FORMS.has(t.baseForm) ||
      /^[\p{P}\p{S}\s]+$/u.test(t.surface);
    if (isDemoted) return { surface: t.surface };
    return {
      surface: t.surface,
      base: t.baseForm,
      reading: t.reading,
      pos: SUDACHI_POS_EN[t.pos] || t.pos,
    };
  });
}

function getTokenBaseForm(token) {
  return token?.base || token?.baseForm || '';
}

function buildDictSubset(frames, liveDict) {
  const subset = {};
  const seen = new Set();
  for (const frame of frames) {
    for (const token of frame.tokens || []) {
      const base = getTokenBaseForm(token);
      if (!base || seen.has(base)) continue;
      seen.add(base);
      const entry = liveDict[base];
      if (entry) {
        subset[base] = {
          reading: entry.reading,
          definitions: entry.definitions,
        };
      }
    }
  }
  return subset;
}

export default function createFrameAuditRoutes({ framesPath, sourcesPath }) {
  const router = Router();
  router.use(adminAuth);

  router.get('/frame-audit-data', (_req, res) => {
    try {
      const liveDictPath = resolveLiveDictPath();

      const frames = JSON.parse(readFileSync(framesPath, 'utf-8'));
      const sources = JSON.parse(readFileSync(sourcesPath, 'utf-8'));
      const liveDict = JSON.parse(readFileSync(liveDictPath, 'utf-8'));

      const dict = buildDictSubset(frames, liveDict);

      res.json({
        frames,
        sources,
        dict,
      });
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  // POST { texts: [{id, raw}, ...] } → { tokens: { id: [token,...] }, dict: {...} }
  router.post('/tokenize-frames', (req, res) => {
    try {
      const texts = Array.isArray(req.body?.texts) ? req.body.texts : [];
      if (!texts.length) return res.json({ tokens: {}, dict: {} });

      const raws = texts.map(t => t.raw || '');
      const batches = tokenizeBatch(raws);
      const grammarCatalog = loadGrammarCatalog();
      const grammarMatchers = loadGrammarMatchers();
      const tokens = {};
      texts.forEach((t, i) => {
        const rawTokens = batches[i] || [];
        const renderTokens = normalizeTokens(rawTokens);
        const matches = findGrammarMatches(rawTokens, {
          catalog: grammarCatalog,
          matchers: grammarMatchers,
        });
        tokens[t.id] = annotateRenderTokens(renderTokens, rawTokens, matches);
      });

      // Return dict subset for any NEW baseforms not in the main frames.json
      const liveDictPath = resolveLiveDictPath();
      const liveDict = JSON.parse(readFileSync(liveDictPath, 'utf-8'));
      const dict = {};
      for (const id in tokens) {
        for (const t of tokens[id]) {
          const base = t.base;
          if (!base || dict[base]) continue;
          const entry = liveDict[base];
          if (entry) dict[base] = { reading: entry.reading, definitions: entry.definitions };
        }
      }

      res.json({ tokens, dict });
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  return router;
}
