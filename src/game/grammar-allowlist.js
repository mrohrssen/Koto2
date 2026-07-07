import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _list = null;
let _posSet = null;
let _baseSet = null;
let _surfaceSet = null;

/**
 * Single source of truth for "free" grammar across BOTH validators:
 * - checkSentenceViolations (AI-generated text, src/game/vocab-repair.js)
 * - the frames pipeline (scripts/tokenize-static.js content demotion)
 *
 * A token is grammar (never counts against the i+1 budget, never a teaching
 * word) when its POS is demoted, its base form is a listed auxiliary, or its
 * surface/base is a listed grammar chunk / formulaic expression.
 *
 * NOT covered here (documented divergence): the AI-side single-hiragana-char
 * skip in checkSentenceViolations remains local to that function.
 */
export function loadGrammarAllowlist() {
  if (!_list) {
    _list = JSON.parse(
      readFileSync(join(__dirname, '../../data/grammar-allowlist.json'), 'utf8')
    );
  }
  return _list;
}

export function clearGrammarAllowlistCache() {
  _list = null;
  _posSet = null;
  _baseSet = null;
  _surfaceSet = null;
}

export function getDemotedPosSet() {
  if (!_posSet) _posSet = new Set(loadGrammarAllowlist().demotedPos);
  return _posSet;
}

export function getDemotedBaseFormSet() {
  if (!_baseSet) _baseSet = new Set(loadGrammarAllowlist().demotedBaseForms);
  return _baseSet;
}

export function getAllowedSurfaceSet() {
  if (!_surfaceSet) _surfaceSet = new Set(loadGrammarAllowlist().allowedSurfaces);
  return _surfaceSet;
}

/**
 * The shared predicate. `pos` is Sudachi's Japanese POS string (e.g. 助詞).
 * POS matching uses startsWith so subtyped strings (助詞,格助詞,...) match.
 */
export function isGrammarToken({ surface = '', baseForm = '', pos = '' } = {}) {
  for (const demoted of getDemotedPosSet()) {
    if (pos.startsWith(demoted)) return true;
  }
  if (getDemotedBaseFormSet().has(baseForm)) return true;
  const surfaces = getAllowedSurfaceSet();
  return surfaces.has(surface) || surfaces.has(baseForm);
}
