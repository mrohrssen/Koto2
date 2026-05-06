export const LEARN_LESSON_SCHEMA_VERSION = 1;
export const LEARN_LESSON_UNAVAILABLE = 'learn_lesson_unavailable';

const TOP_LEVEL_KEYS = ['grammarHints', 'otherTips', 'pronunciation', 'schemaVersion', 'sourceText', 'tokens', 'translation'];
const TOKEN_REQUIRED_KEYS = ['baseForm', 'meaning', 'reading', 'role', 'romaji', 'surface'];
const TOKEN_ALLOWED_KEYS = ['baseForm', 'detail', 'entity', 'meaning', 'reading', 'role', 'romaji', 'surface'];
const ENTITY_KEYS = ['displayName', 'id', 'kotoMeaning', 'ordinaryMeaning', 'type'];
const NOTE_KEYS = ['body', 'title'];
const MAX_TOKENS = 20;
const MAX_ENTITIES = 12;
const MAX_FIELD = 120;
const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const JAPANESE_RUN_RE = /[\u3040-\u30ff\u3400-\u9fff]+/gu;
const MARKDOWN_OR_HTML_RE = /```|<\/?[a-z][\s\S]*>|^\s*#{1,6}\s|\[[^\]]+\]\([^)]+\)/i;
const FILLER_RE = /^(?:n\/a|na|none|no notes|tbd|null)$/i;
const QUIZ_OR_SRS_RE = /\b(?:what does|which word|choose|quiz|question|mark .*known|mark .*forgot|srs|flashcard)\b/i;

function clean(value, max = MAX_FIELD) {
  return String(value || '').trim().slice(0, max);
}

function sameKeys(value, expectedKeys) {
  const keys = Object.keys(value || {}).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function hasRequiredAndAllowedKeys(value, requiredKeys, allowedKeys) {
  const keys = Object.keys(value || {});
  return requiredKeys.every(key => keys.includes(key)) && keys.every(key => allowedKeys.includes(key));
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
  if (FILLER_RE.test(text)) return false;
  if (MARKDOWN_OR_HTML_RE.test(text)) return false;
  if (QUIZ_OR_SRS_RE.test(text)) return false;
  if (!allowJapanese && JAPANESE_RE.test(text)) return false;
  return true;
}

function trustedJapaneseRuns(context) {
  const trusted = new Set([context.sourceText]);
  for (const token of context.tokens) {
    trusted.add(token.surface);
    trusted.add(token.reading);
    trusted.add(token.baseForm);
  }
  for (const entity of context.entities) trusted.add(entity.surface);
  return trusted;
}

function hasUntrustedJapanese(text, trusted) {
  const runs = String(text || '').match(JAPANESE_RUN_RE) || [];
  return runs.some(run => !Array.from(trusted).some(value => value && value.includes(run)));
}

function validateJapaneseSafety(lesson, context) {
  const trusted = trustedJapaneseRuns(context);
  const strings = [lesson.translation];
  for (const token of lesson.tokens) strings.push(token.role, token.meaning, token.detail || '');
  for (const hint of lesson.grammarHints) strings.push(hint.title, hint.body);
  for (const tip of lesson.otherTips) strings.push(tip.title, tip.body);
  return strings.every(text => !hasUntrustedJapanese(text, trusted));
}

function entityForToken(token, entities) {
  return entities.find(entity => entity.surface === token.surface);
}

function validateToken(token, trustedToken, context) {
  if (!hasRequiredAndAllowedKeys(token, TOKEN_REQUIRED_KEYS, TOKEN_ALLOWED_KEYS)) return false;
  if (token.surface !== trustedToken.surface || token.reading !== trustedToken.reading || token.baseForm !== trustedToken.baseForm) return false;
  if (!validString(token.romaji, { max: 80, allowJapanese: false })) return false;
  if (!validString(token.role, { max: 60 })) return false;
  if (!validString(token.meaning, { max: 120 })) return false;
  if (token.detail !== undefined && !validString(token.detail, { max: 180 })) return false;

  const entity = entityForToken(trustedToken, context.entities);
  if (entity || trustedToken.entity) {
    if (!isObject(token.entity) || !sameKeys(token.entity, ENTITY_KEYS)) return false;
    if (token.entity.id !== entity?.id || token.entity.type !== entity?.type || token.entity.displayName !== entity?.displayName) return false;
    if (!validString(token.entity.kotoMeaning, { max: 120 }) || !token.entity.kotoMeaning.includes(entity.displayName)) return false;
    const ordinary = ordinaryMeaningForEntity(entity, context.tokens);
    if (ordinary && token.entity.ordinaryMeaning !== ordinary) return false;
  } else if (token.entity !== undefined) {
    return false;
  }
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

function hasRequiredEntityTip(lesson, context) {
  if (!context.entities.length) return true;
  return context.entities.every(entity => lesson.otherTips.some(tip => (
    tip.body.includes(entity.surface) &&
    tip.body.includes(entity.displayName) &&
    tip.body.toLowerCase().includes('ordinary')
  )));
}

export function validateLearnLesson(lesson, { sourceText, tokens = [], entities = [] } = {}) {
  const context = {
    sourceText: clean(sourceText, 500),
    tokens: normalizeLearnTokens(tokens),
    entities: normalizeLearnEntities(entities)
  };

  if (!isObject(lesson)) return invalid('not_object');
  if (!sameKeys(lesson, TOP_LEVEL_KEYS)) return invalid('top_level_keys');
  if (lesson.schemaVersion !== LEARN_LESSON_SCHEMA_VERSION) return invalid('schema_version');
  if (lesson.sourceText !== context.sourceText) return invalid('source_text');
  if (!isObject(lesson.pronunciation) || !sameKeys(lesson.pronunciation, ['kana', 'romaji'])) return invalid('pronunciation');
  if (!validString(lesson.pronunciation.kana, { max: 240 })) return invalid('kana');
  if (!validString(lesson.pronunciation.romaji, { max: 240, allowJapanese: false })) return invalid('romaji');
  if (!validString(lesson.translation, { max: 240, allowJapanese: false })) return invalid('translation');
  if (!Array.isArray(lesson.tokens) || lesson.tokens.length !== context.tokens.length) return invalid('tokens_length');
  for (let index = 0; index < context.tokens.length; index += 1) {
    if (!validateToken(lesson.tokens[index], context.tokens[index], context)) return invalid(`token_${index}`);
  }
  if (!validateNotes(lesson.grammarHints, { min: 1, max: 6 })) return invalid('grammar_hints');
  if (!validateNotes(lesson.otherTips, { min: 1, max: 5 })) return invalid('other_tips');
  if (!validateJapaneseSafety(lesson, context)) return invalid('japanese_safety');
  if (!hasRequiredEntityTip(lesson, context)) return invalid('entity_tip');
  return { ok: true, lesson };
}
