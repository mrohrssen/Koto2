import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const CATALOG_PATH = join(ROOT, 'data', 'grammar-catalog.json');
const MATCHERS_PATH = join(ROOT, 'data', 'grammar-matchers.json');

let catalogCache = null;
let matcherCache = null;

export function loadGrammarCatalog({ path = CATALOG_PATH } = {}) {
  if (path === CATALOG_PATH && catalogCache) return catalogCache;
  const catalog = JSON.parse(readFileSync(path, 'utf-8'));
  validateCatalog(catalog);
  if (path === CATALOG_PATH) catalogCache = catalog;
  return catalog;
}

export function loadGrammarMatchers({ path = MATCHERS_PATH } = {}) {
  if (path === MATCHERS_PATH && matcherCache) return matcherCache;
  const matchers = JSON.parse(readFileSync(path, 'utf-8'));
  validateMatchers(matchers, getGrammarPointMap(loadGrammarCatalog()));
  if (path === MATCHERS_PATH) matcherCache = matchers;
  return matchers;
}

export function getGrammarPointMap(catalog) {
  const map = new Map();
  for (const point of catalog || []) {
    if (!point?.id) throw new Error('Grammar catalog entry missing id');
    if (map.has(point.id)) throw new Error(`Duplicate grammar catalog id: ${point.id}`);
    map.set(point.id, point);
  }
  return map;
}

export function invalidateGrammarCaches() {
  catalogCache = null;
  matcherCache = null;
}

function validateCatalog(catalog) {
  if (!Array.isArray(catalog)) throw new Error('grammar-catalog.json must be an array');
  getGrammarPointMap(catalog);
  for (const point of catalog) {
    for (const field of ['level', 'lesson', 'lessonIndex', 'title', 'meaning', 'shortExplanation', 'displayPattern', 'status']) {
      if (point[field] == null || point[field] === '') {
        throw new Error(`Grammar catalog entry ${point.id} missing ${field}`);
      }
    }
  }
}

function validateMatchers(matchers, catalogMap) {
  if (!Array.isArray(matchers)) throw new Error('grammar-matchers.json must be an array');
  for (const matcher of matchers) {
    if (!catalogMap.has(matcher.grammarId)) {
      throw new Error(`Grammar matcher references unknown grammarId: ${matcher.grammarId}`);
    }
    if (typeof matcher.priority !== 'number') {
      throw new Error(`Grammar matcher ${matcher.grammarId} missing numeric priority`);
    }
    if (!Array.isArray(matcher.tokens) || matcher.tokens.length === 0) {
      throw new Error(`Grammar matcher ${matcher.grammarId} must define tokens`);
    }
  }
}
