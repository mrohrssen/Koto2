import { logger } from '../logger.js';

const VALID_TONES = new Set(['positive', 'neutral', 'negative']);

/**
 * Parse AI response text as dialogue JSON, stripping markdown fences if present.
 */
export function parseDialogueJson(text) {
  if (!text) return null;
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Validate that parsed JSON has the correct dialogue shape.
 */
export function validateDialogueShape(obj) {
  const errors = [];
  if (!obj) return { valid: false, errors: ['null object'] };
  if (!obj.greeting) errors.push('missing greeting');
  if (!obj.defeatLine) errors.push('missing defeatLine');
  if (!obj.freedLine) errors.push('missing freedLine');
  if (!Array.isArray(obj.rounds) || obj.rounds.length !== 3) {
    errors.push('rounds must be an array of exactly 3');
  } else {
    for (let i = 0; i < obj.rounds.length; i++) {
      const round = obj.rounds[i];
      if (!round.npcLine) errors.push(`round ${i} missing npcLine`);
      if (!Array.isArray(round.options) || round.options.length !== 3) {
        errors.push(`round ${i} must have exactly 3 options`);
      } else {
        for (let j = 0; j < round.options.length; j++) {
          const opt = round.options[j];
          if (!opt.text) errors.push(`round ${i} option ${j} missing text`);
          if (!VALID_TONES.has(opt.tone)) errors.push(`round ${i} option ${j} invalid tone: ${opt.tone}`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Generate dialogue via AI with retry and validation.
 */
export async function generateDialogue({
  chatFn,
  systemPrompt,
  systemBlocks,
  userPrompt,
  aiConfig,
  maxRetries = 2
}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await chatFn({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        messages: [{ role: 'user', content: userPrompt }],
        customSystemPrompt: systemPrompt,
        systemBlocks,
        openaiModel: aiConfig.openaiModel,
        openrouterModel: aiConfig.openrouterModel,
        purpose: 'npc-dialogue'
      });

      const parsed = parseDialogueJson(response);
      if (!parsed) {
        logger.warn(`[NpcDialogue] Attempt ${attempt + 1}: failed to parse JSON`);
        continue;
      }

      const validation = validateDialogueShape(parsed);
      if (!validation.valid) {
        logger.warn(`[NpcDialogue] Attempt ${attempt + 1}: invalid shape: ${validation.errors.join(', ')}`);
        continue;
      }

      return parsed;
    } catch (error) {
      logger.error(`[NpcDialogue] Attempt ${attempt + 1} error:`, error.message);
    }
  }

  logger.error('[NpcDialogue] All generation attempts failed');
  return null;
}
