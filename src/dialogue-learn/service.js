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

const LEARN_LESSON_MAX_ATTEMPTS = 3;

function diagnostic(error, reason) {
  return { ok: false, error, reason };
}

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
  const protectedEntities = normalizedEntities.map(entity => ({
    surface: entity.surface,
    type: entity.type,
    displayName: entity.displayName,
    ordinaryMeaningHint: normalizedTokens.find(token => token.surface === entity.surface)?.meaning || ''
  }));
  const parserHints = normalizedTokens.map(token => ({
    surface: token.surface,
    reading: token.reading,
    baseForm: token.baseForm,
    pos: token.pos,
    meaningHint: token.meaning,
    entity: token.entity
  }));
  const schemaTemplate = {
    schemaVersion: LEARN_LESSON_SCHEMA_VERSION,
    sourceText,
    pronunciation: { kana: '', romaji: '' },
    translation: '',
    breakdown: [{
      kind: 'word | phrase | particle | grammar | verb | entity',
      text: '',
      reading: '',
      meaning: '',
      explanation: ''
    }],
    grammarHints: [{ title: '', body: '' }],
    otherTips: [{ title: '', body: '' }]
  };

  return {
    systemPrompt: `You are a careful Japanese sentence tutor for Koto, a Japanese vocabulary-learning RPG.

This lesson appears inside a game UI when the player taps 学ぶ / Learn on an NPC dialogue line. The player is not reading a textbook; they are in a short, mobile-friendly study view inside a bright sci-fi fantasy RPG.

Translate answers "What did this line mean?"
Learn answers "How do I understand this kind of Japanese next time?"

Your job is to create concise lesson data that the app will render into a fixed UI. The app owns layout, section headings, styling, and interaction. You provide only the teaching content.

Explain the source sentence clearly in English for a beginner. Be accurate, natural, and practical. Prefer the most useful reading strategy over exhaustive grammar detail.

Return only valid JSON matching the requested shape. Do not include markdown, code fences, HTML, comments, or prose outside the JSON.

Important safety rule:
Do not introduce new Japanese example sentences. You may only use Japanese text that appears in the source sentence, parser hints, readings/base forms, or protected entity surfaces.`,
    userPrompt: `Create a concise Learn lesson for this Japanese dialogue line.

Rules:
- Return JSON only.
- Use schemaVersion ${LEARN_LESSON_SCHEMA_VERSION}.
- Do not include markdown, code fences, HTML, comments, or labels outside JSON.
- Do not introduce new Japanese example sentences beyond the source sentence, parser hints, readings/base forms, and protected entity surfaces.
- Do not personalize to known/new word state.
- Do not ask quiz questions or request SRS actions.
- Preserve protected game entities exactly, explain them as game entities when relevant, and use their display names in the English translation.
- The parser hints are context only. They may be incomplete, awkwardly segmented, or missing linguistic nuance.
- Use your own Japanese expertise to decide the clearest lesson breakdown.
- You may group words into phrases, explain particles together with nearby words, explain conjugations, correct awkward parser assumptions, or omit parser hints that are not pedagogically useful.

Source sentence:
${sourceText}

Protected entities:
${JSON.stringify(protectedEntities, null, 2)}

Parser hints:
${JSON.stringify(parserHints, null, 2)}

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
  if (!sourceText) {
    return diagnostic('learn_lesson_invalid_request', 'missing_text');
  }
  if (normalizedTokens.length === 0) {
    return diagnostic('learn_lesson_invalid_request', 'missing_tokens');
  }

  const entitySignature = buildLearnEntitySignature(normalizedEntities, normalizedTokens);
  const cacheKey = cache.constructor.keyFor(sourceText, entitySignature, LEARN_LESSON_SCHEMA_VERSION);
  const cached = cache.get(cacheKey);
  if (cached?.lesson?.schemaVersion === LEARN_LESSON_SCHEMA_VERSION) {
    return { ok: true, lesson: cached.lesson, cached: true };
  }

  if (!config?.provider || !config?.apiKey || !config?.model || !chatFn) {
    return diagnostic('learn_lesson_config_missing', 'missing_config_or_chat');
  }

  const { systemPrompt, userPrompt } = buildDialogueLearnPrompts({ sourceText, tokens: normalizedTokens, entities: normalizedEntities });

  try {
    let lastValidationReason = 'unknown';
    for (let attempt = 1; attempt <= LEARN_LESSON_MAX_ATTEMPTS; attempt += 1) {
      const raw = await chatFn({
        provider: config.provider,
        apiKey: config.apiKey,
        messages: [{ role: 'user', content: userPrompt }],
        customSystemPrompt: systemPrompt,
        purpose: 'dialogue-learn',
        ...modelArgsForProvider(config.provider, config.model)
      });

      const parsed = parseLearnLessonJson(raw);
      if (!parsed) {
        return diagnostic('learn_lesson_parse_failed', 'invalid_json');
      }
      const validation = validateLearnLesson(parsed, {
        sourceText,
        tokens: normalizedTokens,
        entities: normalizedEntities
      });
      if (!validation.ok) {
        lastValidationReason = validation.reason || 'unknown';
        if (attempt < LEARN_LESSON_MAX_ATTEMPTS) continue;

        logger.warn('[DialogueLearn] Lesson validation failed:', lastValidationReason);
        return diagnostic('learn_lesson_validation_failed', lastValidationReason);
      }

      cache.set(cacheKey, validation.lesson, {
        sourceText,
        entitySignature,
        provider: config.provider,
        model: config.model
      });
      return { ok: true, lesson: validation.lesson, cached: false };
    }

    return diagnostic('learn_lesson_validation_failed', lastValidationReason);
  } catch (error) {
    logger.warn('[DialogueLearn] Lesson generation failed:', error.message);
    return diagnostic('learn_lesson_generation_failed', 'provider_error');
  }
}
