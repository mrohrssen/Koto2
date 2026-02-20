import { logger } from '../logger.js';
import { getEntityType } from './entity-types/index.js';

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
 * Delegates to the NPC entity type validator for backward compatibility.
 */
export function validateDialogueShape(obj) {
  return getEntityType('npc').validateShape(obj);
}

/**
 * Generate dialogue via AI with retry and validation.
 * @param {Object} opts
 * @param {Function} opts.chatFn - AI chat function
 * @param {string} [opts.systemPrompt] - Plain text system prompt
 * @param {Array} [opts.systemBlocks] - Structured system prompt blocks
 * @param {string} opts.userPrompt - User prompt
 * @param {Object} opts.aiConfig - AI provider configuration
 * @param {number} [opts.maxRetries=2] - Number of retries on failure
 * @param {string} [opts.entityType='npc'] - Entity type for shape validation ('npc' or 'creature')
 */
export async function generateDialogue({
  chatFn,
  systemPrompt,
  systemBlocks,
  userPrompt,
  aiConfig,
  maxRetries = 2,
  entityType = 'npc'
}) {
  const { validateShape } = getEntityType(entityType);
  const logTag = entityType === 'npc' ? 'NpcDialogue' : 'CreatureDialogue';

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
        logger.warn(`[${logTag}] Attempt ${attempt + 1}: failed to parse JSON`);
        continue;
      }

      const validation = validateShape(parsed);
      if (!validation.valid) {
        logger.warn(`[${logTag}] Attempt ${attempt + 1}: invalid shape: ${validation.errors.join(', ')}`);
        continue;
      }

      return parsed;
    } catch (error) {
      logger.error(`[${logTag}] Attempt ${attempt + 1} error:`, error.message);
    }
  }

  logger.error(`[${logTag}] All generation attempts failed`);
  return null;
}
