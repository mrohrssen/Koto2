import { logger } from '../logger.js';

export const TRANSLATION_UNAVAILABLE = 'translation_unavailable';
const MAX_DIALOGUE_ENTITIES = 12;
const MAX_ENTITY_FIELD_LENGTH = 80;

export function buildDialogueTranslationConfig(env = process.env) {
  const provider = env.DIALOGUE_TRANSLATION_PROVIDER?.trim();
  const apiKey = env.DIALOGUE_TRANSLATION_API_KEY?.trim();
  const model = env.DIALOGUE_TRANSLATION_MODEL?.trim();

  if (!provider || !apiKey || !model) return null;
  return { provider, apiKey, model };
}

function cleanEntityField(value) {
  return String(value || '').trim().slice(0, MAX_ENTITY_FIELD_LENGTH);
}

function cleanEntityType(value) {
  const type = cleanEntityField(value).toLowerCase();
  return type || 'entity';
}

export function normalizeDialogueEntities(entities = []) {
  if (!Array.isArray(entities)) return [];
  const normalized = [];
  const seen = new Set();

  for (const entity of entities.slice(0, MAX_DIALOGUE_ENTITIES)) {
    const id = cleanEntityField(entity?.id);
    const type = cleanEntityType(entity?.type);
    const surface = cleanEntityField(entity?.surface);
    const displayName = cleanEntityField(entity?.displayName);
    if (!id || !surface || !displayName) continue;

    const key = `${type}:${id}:${surface}:${displayName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ id, type, surface, displayName });
  }

  return normalized;
}

export function buildEntitySignature(entities = []) {
  return normalizeDialogueEntities(entities)
    .map(entity => `${entity.type}:${entity.id}:${entity.surface}:${entity.displayName}`)
    .sort()
    .join('|');
}

function protectedEntityPromptSection(entities) {
  if (!entities.length) return '';
  const lines = entities.map(entity => `- ${entity.surface} = [[entity:${entity.id}|${entity.displayName}]]`);
  return `
- Every listed protected game entity is a game entity reference in this Japanese line. Output exactly that entity's marker for it.
- Do not translate, pluralize, lowercase, rename, or remove protected game entity names.
- Do not invent entity markers that are not listed.

Protected game entities:
${lines.join('\n')}`;
}

export function buildDialogueTranslationPrompts(sentence, entities = []) {
  const normalizedEntities = normalizeDialogueEntities(entities);
  const entityRules = protectedEntityPromptSection(normalizedEntities);
  return {
    systemPrompt: 'You are a careful Japanese-to-English translator for a language-learning RPG. Produce accurate, natural English translations without commentary. Protected game entity names must be preserved exactly with the required marker syntax.',
    userPrompt: `Translate the following Japanese dialogue into natural English.

Rules:
- Preserve the meaning and tone.
- Return only the English translation.
- Do not include explanations, romanization, quotation marks, alternatives, or notes.${entityRules}

Japanese:
${sentence}`
  };
}

export function sanitizeTranslationOutput(output) {
  let text = String(output || '').trim();
  if (!text) return '';

  text = text.replace(/^```(?:text|plain|markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
  text = text.replace(/^["“”']+|["“”']+$/g, '').trim();

  if (!text) return '';
  if (/^(translation|english|natural english|note|explanation)\s*:/i.test(text)) return '';
  if (/^here(?:'s| is)\b/i.test(text)) return '';
  if (/\n\s*(note|explanation|alternative|literal)\s*:/i.test(text)) return '';

  return text;
}

export function parseEntityMarkedTranslation(output, entities = []) {
  const raw = sanitizeTranslationOutput(output);
  if (!raw) return { ok: false, error: TRANSLATION_UNAVAILABLE };

  const normalizedEntities = normalizeDialogueEntities(entities);
  if (!normalizedEntities.length) {
    if (/\[\[entity:/i.test(raw) || /\[\[|\]\]/.test(raw)) {
      return { ok: false, error: TRANSLATION_UNAVAILABLE };
    }
    return { ok: true, translation: raw, entities: [] };
  }

  const byId = new Map(normalizedEntities.map(entity => [entity.id, entity]));
  const markerRe = /\[\[entity:([^|\]\[]+)\|([^\]\[]+)\]\]/g;
  const spans = [];
  let translation = '';
  let lastIndex = 0;
  let match;

  while ((match = markerRe.exec(raw))) {
    const [marker, id, displayName] = match;
    const entity = byId.get(id);
    if (!entity || entity.displayName !== displayName) {
      return { ok: false, error: TRANSLATION_UNAVAILABLE };
    }

    translation += raw.slice(lastIndex, match.index);
    const start = translation.length;
    translation += displayName;
    spans.push({ id: entity.id, type: entity.type, text: displayName, start, end: translation.length });
    lastIndex = match.index + marker.length;
  }

  translation += raw.slice(lastIndex);
  if (/\[\[entity:/i.test(translation) || /\[\[|\]\]/.test(translation)) {
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }

  return { ok: true, translation, entities: spans };
}

function requiredEntitiesForSource(sourceText, entities) {
  return normalizeDialogueEntities(entities).filter(entity => sourceText.includes(entity.surface));
}

function hasRequiredEntityMarkers(parsed, requiredEntities) {
  return requiredEntities.every(entity => parsed.entities.some(span => span.id === entity.id));
}

function buildEntityRetryPrompt({ sourceText, entities, previousOutput }) {
  const entityLines = requiredEntitiesForSource(sourceText, entities)
    .map(entity => `- ${entity.surface} = [[entity:${entity.id}|${entity.displayName}]]`)
    .join('\n');

  return `Your previous answer did not follow the protected entity marker rules. Return only the corrected English translation.

The Japanese source contains these protected game entities:
${entityLines}

Previous answer:
${previousOutput}

Japanese:
${sourceText}`;
}

function modelArgsForProvider(provider, model) {
  switch ((provider || '').toLowerCase()) {
    case 'openai':
      return { openaiModel: model };
    case 'anthropic':
    case 'claude':
      return { claudeModel: model };
    case 'gemini':
    case 'google':
      return { geminiModel: model };
    case 'openrouter':
      return { openrouterModel: model };
    default:
      return {};
  }
}

export async function translateDialogueText({
  text,
  entities = [],
  cache,
  chatFn,
  config = buildDialogueTranslationConfig()
}) {
  const sourceText = String(text || '').trim();
  if (!sourceText) {
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }

  const normalizedEntities = normalizeDialogueEntities(entities);
  const entitySignature = buildEntitySignature(normalizedEntities);
  const cacheKey = cache.constructor.keyFor(sourceText, entitySignature);
  const cached = cache.get(cacheKey);
  if (cached?.translation) {
    return { ok: true, translation: cached.translation, entities: cached.entities || [], cached: true };
  }

  if (!config?.provider || !config?.apiKey || !config?.model || !chatFn) {
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }

  const requiredEntities = requiredEntitiesForSource(sourceText, normalizedEntities);
  const { systemPrompt, userPrompt } = buildDialogueTranslationPrompts(sourceText, normalizedEntities);

  try {
    const raw = await chatFn({
      provider: config.provider,
      apiKey: config.apiKey,
      messages: [{ role: 'user', content: userPrompt }],
      customSystemPrompt: systemPrompt,
      purpose: 'dialogue-translation',
      ...modelArgsForProvider(config.provider, config.model)
    });

    let parsed = parseEntityMarkedTranslation(raw, normalizedEntities);
    if (parsed.ok && hasRequiredEntityMarkers(parsed, requiredEntities)) {
      cache.set(cacheKey, parsed.translation, {
        sourceText,
        entitySignature,
        entities: parsed.entities,
        provider: config.provider,
        model: config.model
      });
      return { ok: true, translation: parsed.translation, entities: parsed.entities, cached: false };
    }

    if (requiredEntities.length) {
      const retryRaw = await chatFn({
        provider: config.provider,
        apiKey: config.apiKey,
        messages: [{ role: 'user', content: buildEntityRetryPrompt({ sourceText, entities: normalizedEntities, previousOutput: raw }) }],
        customSystemPrompt: systemPrompt,
        purpose: 'dialogue-translation',
        ...modelArgsForProvider(config.provider, config.model)
      });

      parsed = parseEntityMarkedTranslation(retryRaw, normalizedEntities);
      if (parsed.ok && hasRequiredEntityMarkers(parsed, requiredEntities)) {
        cache.set(cacheKey, parsed.translation, {
          sourceText,
          entitySignature,
          entities: parsed.entities,
          provider: config.provider,
          model: config.model
        });
        return { ok: true, translation: parsed.translation, entities: parsed.entities, cached: false };
      }
    }

    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  } catch (error) {
    logger.warn('[DialogueTranslation] Translation failed:', error.message);
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }
}
