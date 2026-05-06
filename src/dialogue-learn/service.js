import { logger } from '../logger.js';
import { DialogueLearnCache } from './cache.js';
import {
  LEARN_LESSON_SCHEMA_VERSION,
  LEARN_LESSON_UNAVAILABLE,
  buildLearnEntitySignature,
  normalizeLearnEntities,
  normalizeLearnTokens,
  parseLearnLessonJson,
  validateLearnLesson
} from './schema.js';

export { LEARN_LESSON_UNAVAILABLE };

export function buildDialogueLearnConfig(env = process.env) {
  const provider = env.DIALOGUE_LEARN_PROVIDER?.trim();
  const apiKey = env.DIALOGUE_LEARN_API_KEY?.trim();
  const model = env.DIALOGUE_LEARN_MODEL?.trim();
  if (!provider || !apiKey || !model) return null;
  return { provider, apiKey, model };
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

export function buildDialogueLearnPrompts({ sourceText, tokens = [], entities = [] }) {
  const normalizedTokens = normalizeLearnTokens(tokens);
  const normalizedEntities = normalizeLearnEntities(entities);
  const schemaTemplate = {
    schemaVersion: LEARN_LESSON_SCHEMA_VERSION,
    sourceText,
    pronunciation: { kana: '', romaji: '' },
    translation: '',
    tokens: normalizedTokens.map(token => ({
      surface: token.surface,
      reading: token.reading,
      romaji: '',
      baseForm: token.baseForm,
      role: '',
      meaning: '',
      detail: ''
    })),
    grammarHints: [{ title: '', body: '' }],
    otherTips: [{ title: '', body: '' }]
  };

  return {
    systemPrompt: 'You are a careful Japanese sentence tutor for a language-learning RPG. Return only valid JSON matching the provided schema. Explain how the given sentence works using concise English. Do not add Japanese examples beyond the provided sentence, token surfaces, readings, base forms, and protected entity surfaces.',
    userPrompt: `Create a Standard Study Card lesson for this Japanese dialogue sentence.

Rules:
- Return JSON only.
- Use schemaVersion ${LEARN_LESSON_SCHEMA_VERSION}.
- Do not include markdown, code fences, HTML, comments, or labels outside JSON.
- Do not add Japanese examples beyond the source sentence, token surfaces, readings, base forms, and protected entity surfaces.
- Do not personalize to known/new word state.
- Do not ask quiz questions or request SRS actions.
- Preserve protected game entities as game entities and explain their ordinary Japanese meaning when supplied by token data.

Source sentence:
${sourceText}

Trusted tokens:
${JSON.stringify(normalizedTokens, null, 2)}

Protected entities:
${JSON.stringify(normalizedEntities, null, 2)}

Required JSON shape:
${JSON.stringify(schemaTemplate, null, 2)}`
  };
}

export async function generateDialogueLearnLesson({
  text,
  tokens = [],
  entities = [],
  cache = new DialogueLearnCache(),
  chatFn,
  config = buildDialogueLearnConfig()
}) {
  const sourceText = String(text || '').trim();
  const normalizedTokens = normalizeLearnTokens(tokens);
  const normalizedEntities = normalizeLearnEntities(entities);
  if (!sourceText || normalizedTokens.length === 0) {
    return { ok: false, error: LEARN_LESSON_UNAVAILABLE };
  }

  const entitySignature = buildLearnEntitySignature(normalizedEntities, normalizedTokens);
  const cacheKey = cache.constructor.keyFor(sourceText, entitySignature, LEARN_LESSON_SCHEMA_VERSION);
  const cached = cache.get(cacheKey);
  if (cached?.lesson?.schemaVersion === LEARN_LESSON_SCHEMA_VERSION) {
    return { ok: true, lesson: cached.lesson, cached: true };
  }

  if (!config?.provider || !config?.apiKey || !config?.model || !chatFn) {
    return { ok: false, error: LEARN_LESSON_UNAVAILABLE };
  }

  const { systemPrompt, userPrompt } = buildDialogueLearnPrompts({ sourceText, tokens: normalizedTokens, entities: normalizedEntities });

  try {
    const raw = await chatFn({
      provider: config.provider,
      apiKey: config.apiKey,
      messages: [{ role: 'user', content: userPrompt }],
      customSystemPrompt: systemPrompt,
      purpose: 'dialogue-learn',
      ...modelArgsForProvider(config.provider, config.model)
    });

    const parsed = parseLearnLessonJson(raw);
    const validation = validateLearnLesson(parsed, {
      sourceText,
      tokens: normalizedTokens,
      entities: normalizedEntities
    });
    if (!validation.ok) {
      return { ok: false, error: LEARN_LESSON_UNAVAILABLE };
    }

    cache.set(cacheKey, validation.lesson, {
      sourceText,
      entitySignature,
      provider: config.provider,
      model: config.model
    });
    return { ok: true, lesson: validation.lesson, cached: false };
  } catch (error) {
    logger.warn('[DialogueLearn] Lesson generation failed:', error.message);
    return { ok: false, error: LEARN_LESSON_UNAVAILABLE };
  }
}
