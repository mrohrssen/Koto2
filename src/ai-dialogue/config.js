function modelArgsForProvider(provider, model) {
  switch ((provider || '').toLowerCase()) {
    case 'openai':
      return { openaiModel: model };
    case 'anthropic':
    case 'claude':
      return { claudeModel: model };
    case 'google':
    case 'gemini':
      return { geminiModel: model };
    case 'openrouter':
      return { openrouterModel: model };
    default:
      return {};
  }
}

export function buildAiDialogueConfig(env = process.env) {
  const provider = env.AI_DIALOGUE_PROVIDER?.trim();
  const apiKey = env.AI_DIALOGUE_API_KEY?.trim();
  const model = env.AI_DIALOGUE_MODEL?.trim();
  if (!provider || !apiKey || !model) return null;
  return {
    provider,
    apiKey,
    model,
    ...modelArgsForProvider(provider, model)
  };
}

export function isAiConversationsEnabled(keys = {}) {
  return keys.aiConversationsEnabled === true;
}

export function canUseAiDialogue(keys = {}, config = buildAiDialogueConfig()) {
  return keys.aiDataSharingConsent === true
    && isAiConversationsEnabled(keys)
    && !!config?.provider
    && !!config?.apiKey
    && !!config?.model;
}
