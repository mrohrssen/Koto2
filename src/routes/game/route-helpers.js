/**
 * Build vocabulary config object from request for dialogue generation.
 * Shared by combat and run routes.
 */
export function buildVocabConfig(req, getUserVocabulary, checkSentenceViolations) {
  const userKeys = req.userKeys || {};
  if (!userKeys.aiApiKey || !userKeys.aiProvider || !getUserVocabulary) return null;

  const { words: vocabulary, vidSet } = getUserVocabulary(req.user.id);
  const vocabSet = new Set(vocabulary);
  const checkViolationsFn = userKeys.jpdbApiKey && checkSentenceViolations
    ? async (text) => checkSentenceViolations(text, vocabSet, userKeys.jpdbApiKey, new Set(), vidSet)
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
    vidSet,
    vocabSet,
    checkViolationsFn
  };
}
