import { logger } from '../logger.js';

export const TRANSLATION_UNAVAILABLE = 'translation_unavailable';

export function buildDialogueTranslationConfig(env = process.env) {
  const provider = env.DIALOGUE_TRANSLATION_PROVIDER?.trim();
  const apiKey = env.DIALOGUE_TRANSLATION_API_KEY?.trim();
  const model = env.DIALOGUE_TRANSLATION_MODEL?.trim();

  if (!provider || !apiKey || !model) return null;
  return { provider, apiKey, model };
}

export function buildDialogueTranslationPrompts(sentence) {
  return {
    systemPrompt: 'You are a careful Japanese-to-English translator for a language-learning RPG. Produce accurate, natural English translations without commentary.',
    userPrompt: `Translate the following Japanese dialogue into natural English.

Rules:
- Preserve the meaning and tone.
- Return only the English translation.
- Do not include explanations, romanization, quotation marks, alternatives, or notes.

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
  cache,
  chatFn,
  config = buildDialogueTranslationConfig()
}) {
  const sourceText = String(text || '').trim();
  if (!sourceText) {
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }

  const cached = cache.get(sourceText);
  if (cached?.translation) {
    return { ok: true, translation: cached.translation, cached: true };
  }

  if (!config?.provider || !config?.apiKey || !config?.model || !chatFn) {
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }

  const { systemPrompt, userPrompt } = buildDialogueTranslationPrompts(sourceText);

  try {
    const raw = await chatFn({
      provider: config.provider,
      apiKey: config.apiKey,
      messages: [{ role: 'user', content: userPrompt }],
      customSystemPrompt: systemPrompt,
      purpose: 'dialogue-translation',
      ...modelArgsForProvider(config.provider, config.model)
    });

    const translation = sanitizeTranslationOutput(raw);
    if (!translation) {
      return { ok: false, error: TRANSLATION_UNAVAILABLE };
    }

    cache.set(sourceText, translation, {
      provider: config.provider,
      model: config.model
    });

    return { ok: true, translation, cached: false };
  } catch (error) {
    logger.warn('[DialogueTranslation] Translation failed:', error.message);
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }
}
