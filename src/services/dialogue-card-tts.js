export function getDialogueLineText(line) {
  if (typeof line === 'string') return line.trim();
  if (!line || typeof line !== 'object') return '';

  const tokenText = Array.isArray(line.tokens)
    ? line.tokens
      .map(token => String(token?.surface || token?.text || ''))
      .join('')
      .trim()
    : '';

  const raw = typeof line.raw === 'string' ? line.raw.trim() : '';
  if (raw && (!raw.match(/\{[A-Za-z0-9_]+\}/) || !tokenText)) return raw;
  if (tokenText) return tokenText;

  const text = typeof line.text === 'string' ? line.text.trim() : '';
  return text;
}

function defaultLogger() {
  return console;
}

export function createDialogueCardTtsResolver({
  ttsDialogueCache,
  synthesizeFn,
  getSpeakerId,
  logger = defaultLogger()
} = {}) {
  return async function resolveDialogueCardAudio({
    userId,
    line,
    speakerKey,
    speakerId,
    waitForSynthesis = true
  } = {}) {
    if (!userId || !ttsDialogueCache || !synthesizeFn) return null;

    const text = getDialogueLineText(line);
    if (!text) return null;

    const resolvedSpeakerId = Number.isFinite(Number(speakerId))
      ? Number(speakerId)
      : Number(getSpeakerId?.({ speakerKey, line }) || 13);

    try {
      if (waitForSynthesis === false) {
        const cachedKey = ttsDialogueCache.lookupLineKey?.(userId, text, resolvedSpeakerId);
        if (cachedKey) return { userId, key: cachedKey, speakerId: resolvedSpeakerId };

        ttsDialogueCache.synthesizeLine(userId, text, resolvedSpeakerId, synthesizeFn)
          .catch(error => {
            logger?.warn?.(`[DialogueCardTTS] Background dialogue card TTS failed for ${speakerKey || 'unknown'}: ${error.message}`);
          });
        return null;
      }

      const key = await ttsDialogueCache.synthesizeLine(
        userId,
        text,
        resolvedSpeakerId,
        synthesizeFn
      );
      return key ? { userId, key, speakerId: resolvedSpeakerId } : null;
    } catch (error) {
      logger?.warn?.(`[DialogueCardTTS] Dialogue card TTS failed for ${speakerKey || 'unknown'}: ${error.message}`);
      return null;
    }
  };
}

export function createDialogueCardWordTtsResolver({
  ttsDialogueCache,
  synthesizeFn,
  logger = defaultLogger()
} = {}) {
  return async function resolveDialogueCardWordAudio({
    userId,
    word,
    speakerId
  } = {}) {
    if (!userId || !ttsDialogueCache || !synthesizeFn) return null;

    const text = typeof word === 'string' ? word.trim() : '';
    if (!text) return null;

    const resolvedSpeakerId = Number(speakerId);
    if (!Number.isFinite(resolvedSpeakerId)) return null;

    try {
      const key = await ttsDialogueCache.synthesizeLine(
        userId,
        text,
        resolvedSpeakerId,
        synthesizeFn
      );
      return key ? { userId, key } : null;
    } catch (error) {
      logger?.warn?.(`[DialogueCardTTS] Dialogue card word TTS failed: ${error.message}`);
      return null;
    }
  };
}
