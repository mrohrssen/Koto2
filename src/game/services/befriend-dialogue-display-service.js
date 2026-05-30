import { enrichTokens } from '../enrich-tokens.js';
import { tokenizeDialogueTexts } from '../dialogue-tokenizer.js';

function audioPayload(userId, key) {
  return key ? { userId, key } : undefined;
}

function linePayload(raw, tokenized, audio) {
  const result = {
    raw,
    tokens: tokenized?.tokens || [],
    words: tokenized?.words || []
  };
  if (audio) result.audio = audio;
  return result;
}

export function buildBefriendDisplayRounds(rounds, { userId, dict }) {
  const sourceTexts = [];
  for (const round of rounds || []) {
    sourceTexts.push(round.speaker || '');
    for (const option of round.options || []) {
      sourceTexts.push(typeof option === 'string' ? option : option?.text || '');
    }
  }

  const tokenized = tokenizeDialogueTexts(sourceTexts, { dict });
  let cursor = 0;

  return (rounds || []).map(round => {
    const speakerRaw = round.speaker || '';
    const speakerTokens = tokenized[cursor++];
    const speakerLine = linePayload(
      speakerRaw,
      { ...speakerTokens, tokens: enrichTokens(speakerTokens.tokens, {}, dict) },
      audioPayload(userId, round.speakerTts)
    );

    const options = (round.options || []).map((option, index) => {
      const raw = typeof option === 'string' ? option : option?.text || '';
      const optionTokens = tokenized[cursor++];
      return linePayload(
        raw,
        { ...optionTokens, tokens: enrichTokens(optionTokens.tokens, {}, dict) },
        audioPayload(userId, round.optionsTts?.[index])
      );
    });

    return { speaker: speakerLine, options };
  });
}
