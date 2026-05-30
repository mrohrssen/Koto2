import { parseDialogueJson } from './generation.js';
import { getEntityType } from './entity-types/index.js';
import { logger } from '../logger.js';

/**
 * Extract all Japanese text fields from a dialogue JSON object.
 * Dispatches to the appropriate entity type's extractStrings function.
 *
 * @param {object} dialogue - The dialogue JSON object
 * @param {string} [entityType='npc'] - Entity type ('npc' or 'creature')
 * @returns {Array<{ path: string, text: string }>}
 */
export function extractDialogueStrings(dialogue, entityType = 'npc') {
  return getEntityType(entityType).extractStrings(dialogue);
}

/**
 * Validate all Japanese text fields in a dialogue against the player's vocabulary.
 * Uses an injected checkFn to preserve the one-way dependency rule.
 *
 * @param {object} dialogue - The dialogue JSON object
 * @param {Function|null} checkFn - async (text) => { unknownWords: string[], count: number }
 *   Injected from vocab-repair.js's checkSentenceViolations with bound params.
 *   If null, validation is skipped.
 * @returns {Array<{ path: string, text: string, unknowns: string[] }>} Violations (empty = clean)
 */
export async function validateDialogueVocab(dialogue, checkFn, entityType = 'npc') {
  if (!checkFn) return [];

  const entries = extractDialogueStrings(dialogue, entityType);
  const violations = [];

  for (const entry of entries) {
    const result = await checkFn(entry.text);
    if (result.count > 1) { // i+1: allow exactly 1 unknown per field
      violations.push({
        path: entry.path,
        text: entry.text,
        unknowns: result.unknownWords
      });
    }
  }

  return violations;
}

/**
 * Build the repair instruction listing specific violations.
 * This becomes the final user message in the multi-turn repair conversation.
 */
export function buildRepairInstruction(violations, entityType = 'npc') {
  return getEntityType(entityType).buildRepairInstruction(violations);
}

/**
 * Full vocab enforcement pipeline: validate -> repair loop -> return result.
 *
 * @param {object} params
 * @param {object} params.dialogue - The AI-generated dialogue JSON
 * @param {Function|null} params.checkViolationsFn - Injected vocab checker (null = skip)
 * @param {Function} params.chatFn - AI chat function for repair calls
 * @param {string} params.systemPrompt - Original system prompt (layers 1-6)
 * @param {string} params.userPrompt - Original user prompt (layer 7)
 * @param {object} params.aiConfig - AI provider config
 * @param {number} [params.maxAttempts=3] - Max repair attempts before giving up
 * @returns {{ dialogue: object|null, repaired: boolean, attempts: number, violations: Array }}
 */
export async function enforceDialogueVocab({
  dialogue,
  checkViolationsFn,
  chatFn,
  systemPrompt,
  systemBlocks,
  userPrompt,
  aiConfig,
  maxAttempts = 3,
  entityType = 'npc'
}) {
  // No checker = skip validation
  if (!checkViolationsFn) {
    return { dialogue, repaired: false, attempts: 0, violations: [] };
  }

  const { validateShape } = getEntityType(entityType);

  // Initial validation
  let violations = await validateDialogueVocab(dialogue, checkViolationsFn, entityType);
  if (violations.length === 0) {
    return { dialogue, repaired: false, attempts: 0, violations: [] };
  }

  logger.info(`[NpcDialogue] Vocab violations found in ${violations.length} fields, starting repair`);

  let currentDialogue = dialogue;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const repairInstruction = buildRepairInstruction(violations, entityType);

      // Multi-turn repair: original prompt + flawed output + repair instruction
      const response = await chatFn({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        messages: [
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: JSON.stringify(currentDialogue, null, 2) },
          { role: 'user', content: repairInstruction }
        ],
        customSystemPrompt: systemPrompt,
        systemBlocks,
        openaiModel: aiConfig.openaiModel,
        openrouterModel: aiConfig.openrouterModel,
        claudeModel: aiConfig.claudeModel,
        geminiModel: aiConfig.geminiModel,
        purpose: 'npc-dialogue-repair'
      });

      // Parse and validate shape
      const parsed = parseDialogueJson(response);
      if (!parsed) {
        logger.warn(`[NpcDialogue] Repair attempt ${attempt}: failed to parse JSON`);
        continue;
      }

      const shapeCheck = validateShape(parsed);
      if (!shapeCheck.valid) {
        logger.warn(`[NpcDialogue] Repair attempt ${attempt}: invalid shape: ${shapeCheck.errors.join(', ')}`);
        continue;
      }

      // Re-validate vocab on repaired dialogue
      violations = await validateDialogueVocab(parsed, checkViolationsFn, entityType);
      if (violations.length === 0) {
        logger.info(`[NpcDialogue] Repair succeeded on attempt ${attempt}`);
        return { dialogue: parsed, repaired: true, attempts: attempt, violations: [] };
      }

      logger.warn(`[NpcDialogue] Repair attempt ${attempt}: still ${violations.length} violations`);
      currentDialogue = parsed; // Use improved version for next attempt
    } catch (error) {
      logger.error(`[NpcDialogue] Repair attempt ${attempt} error:`, error.message);
    }
  }

  logger.error(`[NpcDialogue] CRITICAL: All ${maxAttempts} repair attempts failed for dialogue. Violations remain in ${violations.length} fields.`);
  return { dialogue: null, repaired: false, attempts: maxAttempts, violations };
}
