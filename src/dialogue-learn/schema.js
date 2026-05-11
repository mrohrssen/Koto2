export const LEARN_LESSON_SCHEMA_VERSION = 2;
export const LEARN_LESSON_UNAVAILABLE = 'learn_lesson_unavailable';

const TOP_LEVEL_KEYS = ['breakdown', 'grammarHints', 'otherTips', 'pronunciation', 'schemaVersion', 'sourceText', 'translation'];
const BREAKDOWN_KEYS = ['explanation', 'kind', 'meaning', 'reading', 'text'];
const NOTE_KEYS = ['body', 'title'];
const MAX_TOKENS = 20;
const MAX_ENTITIES = 12;
const MAX_FIELD = 120;
const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;

function clean(value, max = MAX_FIELD) {
  return String(value || '').trim().slice(0, max);
}

function sameKeys(value, expectedKeys) {
  const keys = Object.keys(value || {}).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeLearnTokens(tokens = []) {
  if (!Array.isArray(tokens)) return [];
  return tokens.slice(0, MAX_TOKENS).map(token => ({
    surface: clean(token?.surface, 80),
    reading: clean(token?.reading || token?.surface, 80),
    baseForm: clean(token?.baseForm || token?.surface, 80),
    pos: clean(token?.pos, 40),
    meaning: clean(token?.meaning, 160),
    entity: token?.entity === true
  })).filter(token => token.surface);
}

export function normalizeLearnEntities(entities = []) {
  if (!Array.isArray(entities)) return [];
  const normalized = [];
  const seen = new Set();
  for (const entity of entities.slice(0, MAX_ENTITIES)) {
    const id = clean(entity?.id, 80);
    const type = clean(entity?.type || 'entity', 40).toLowerCase();
    const surface = clean(entity?.surface, 80);
    const displayName = clean(entity?.displayName, 80);
    if (!id || !surface || !displayName) continue;
    const key = `${type}:${id}:${surface}:${displayName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ id, type, surface, displayName });
  }
  return normalized;
}

function ordinaryMeaningForEntity(entity, tokens) {
  const token = tokens.find(item => item.surface === entity.surface && item.meaning);
  return token?.meaning || '';
}

export function buildLearnEntitySignature(entities = [], tokens = []) {
  const normalizedTokens = normalizeLearnTokens(tokens);
  return normalizeLearnEntities(entities)
    .map(entity => `${entity.type}:${entity.id}:${entity.surface}:${entity.displayName}:${ordinaryMeaningForEntity(entity, normalizedTokens)}`)
    .sort()
    .join('|');
}

export function parseLearnLessonJson(output) {
  const raw = String(output || '').trim();
  if (!raw || !raw.startsWith('{') || !raw.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function invalid(error) {
  return { ok: false, error: LEARN_LESSON_UNAVAILABLE, reason: error };
}

function validString(value, { min = 1, max = 300, allowJapanese = true } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) return false;
  if (!allowJapanese && JAPANESE_RE.test(text)) return false;
  return true;
}

function validateNotes(notes, { min, max }) {
  if (!Array.isArray(notes) || notes.length < min || notes.length > max) return false;
  return notes.every(note => (
    isObject(note) &&
    sameKeys(note, NOTE_KEYS) &&
    validString(note.title, { max: 80 }) &&
    validString(note.body, { max: 300 })
  ));
}

function validateBreakdown(breakdown) {
  if (!Array.isArray(breakdown) || breakdown.length < 1 || breakdown.length > 12) return false;
  return breakdown.every(item => (
    isObject(item) &&
    sameKeys(item, BREAKDOWN_KEYS) &&
    validString(item.kind, { max: 40, allowJapanese: false }) &&
    validString(item.text, { max: 120 }) &&
    validString(item.reading, { max: 120 }) &&
    validString(item.meaning, { max: 160 }) &&
    validString(item.explanation, { max: 320 })
  ));
}

export function validateLearnLesson(lesson, { sourceText } = {}) {
  const normalizedSourceText = clean(sourceText, 500);

  if (!isObject(lesson)) return invalid('not_object');
  if (!sameKeys(lesson, TOP_LEVEL_KEYS)) return invalid('top_level_keys');
  if (lesson.schemaVersion !== LEARN_LESSON_SCHEMA_VERSION) return invalid('schema_version');
  if (lesson.sourceText !== normalizedSourceText) return invalid('source_text');
  if (!isObject(lesson.pronunciation) || !sameKeys(lesson.pronunciation, ['kana', 'romaji'])) return invalid('pronunciation');
  if (!validString(lesson.pronunciation.kana, { max: 240 })) return invalid('kana');
  if (!validString(lesson.pronunciation.romaji, { max: 240, allowJapanese: false })) return invalid('romaji');
  if (!validString(lesson.translation, { max: 240, allowJapanese: false })) return invalid('translation');
  if (!validateBreakdown(lesson.breakdown)) return invalid('breakdown');
  if (!validateNotes(lesson.grammarHints, { min: 1, max: 6 })) return invalid('grammar_hints');
  if (!validateNotes(lesson.otherTips, { min: 1, max: 5 })) return invalid('other_tips');
  return { ok: true, lesson };
}
