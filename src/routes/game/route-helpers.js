export function buildGlobalAiConfig(jlptLevel = 'N4') {
  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const google = process.env.GOOGLE_API_KEY;
  const openrouter = process.env.OPENROUTER_API_KEY;

  if (openai) {
    return {
      provider: 'openai',
      apiKey: openai,
      openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      jlptLevel
    };
  }

  if (anthropic) {
    return {
      provider: 'anthropic',
      apiKey: anthropic,
      claudeModel: process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL,
      jlptLevel
    };
  }

  if (google) {
    return {
      provider: 'google',
      apiKey: google,
      geminiModel: process.env.GOOGLE_MODEL || process.env.GEMINI_MODEL,
      jlptLevel
    };
  }

  if (openrouter) {
    return {
      provider: 'openrouter',
      apiKey: openrouter,
      openrouterModel: process.env.OPENROUTER_MODEL,
      jlptLevel
    };
  }

  return null;
}

export function buildVocabConfig(req, getUserVocabulary, checkSentenceViolations) {
  const userKeys = req.userKeys || {};
  if (userKeys.aiDataSharingConsent !== true || !getUserVocabulary) return null;

  const aiConfig = buildGlobalAiConfig(userKeys.jlptLevel || 'N4');
  if (!aiConfig) return null;

  const { words: vocabulary } = getUserVocabulary(req.user.id);
  const vocabSet = new Set(vocabulary);
  const checkViolationsFn = checkSentenceViolations
    ? async (text) => checkSentenceViolations(text, vocabSet, new Set())
    : null;

  return {
    aiConfig,
    vocabulary,
    vocabSet,
    checkViolationsFn
  };
}

/**
 * Kept as a named helper for befriend flows, but all AI config now comes from
 * server environment variables rather than per-user settings.
 */
export function buildBefriendDialogueVocabConfig(req, getUserVocabulary, checkSentenceViolations) {
  return buildVocabConfig(req, getUserVocabulary, checkSentenceViolations);
}
