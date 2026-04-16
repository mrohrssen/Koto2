export function buildVocabConfig(req, getUserVocabulary, checkSentenceViolations) {
  const userKeys = req.userKeys || {};
  if (!userKeys.aiApiKey || !userKeys.aiProvider || !getUserVocabulary) return null;

  const { words: vocabulary } = getUserVocabulary(req.user.id);
  const vocabSet = new Set(vocabulary);
  const checkViolationsFn = checkSentenceViolations
    ? async (text) => checkSentenceViolations(text, vocabSet, new Set())
    : null;

  return {
    aiConfig: {
      provider: userKeys.aiProvider,
      apiKey: userKeys.aiApiKey,
      openaiModel: userKeys.openaiModel,
      openrouterModel: userKeys.openrouterModel,
      jlptLevel: userKeys.jlptLevel || 'N4'
    },
    vocabulary,
    vocabSet,
    checkViolationsFn
  };
}

/**
 * Like buildVocabConfig but falls back to server .env AI keys when the user has not
 * saved keys in Settings (common for local dev). JPDB: user key or JPDB_API_KEY env.
 */
export function buildBefriendDialogueVocabConfig(req, getUserVocabulary, checkSentenceViolations) {
  const fromUser = buildVocabConfig(req, getUserVocabulary, checkSentenceViolations);
  if (fromUser) return fromUser;
  if (!getUserVocabulary) return null;

  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const google = process.env.GOOGLE_API_KEY;
  let provider;
  let apiKey;
  let openaiModel;
  if (openai) {
    provider = 'openai';
    apiKey = openai;
    openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  } else if (anthropic) {
    provider = 'anthropic';
    apiKey = anthropic;
  } else if (google) {
    provider = 'google';
    apiKey = google;
  } else {
    return null;
  }

  const userKeys = req.userKeys || {};
  const { words: vocabulary } = getUserVocabulary(req.user.id);
  const vocabSet = new Set(vocabulary);
  const checkViolationsFn = checkSentenceViolations
    ? async (text) => checkSentenceViolations(text, vocabSet, new Set())
    : null;

  return {
    aiConfig: {
      provider,
      apiKey,
      openaiModel,
      openrouterModel: userKeys.openrouterModel || process.env.OPENROUTER_MODEL,
      jlptLevel: userKeys.jlptLevel || 'N4'
    },
    vocabulary,
    vocabSet,
    checkViolationsFn
  };
}
