import { parseDialogueJson, validateDialogueShape } from './generation.js';
import { logger } from '../logger.js';

/**
 * Extract all Japanese text fields from a dialogue JSON object.
 * Returns array of { path: string, text: string } entries.
 * Standard dialogue has 15 fields: greeting + defeatLine + freedLine +
 * 3 rounds x (npcLine + 3 option texts).
 */
export function extractDialogueStrings(dialogue) {
  const entries = [];
  if (dialogue.greeting) entries.push({ path: 'greeting', text: dialogue.greeting });
  if (dialogue.defeatLine) entries.push({ path: 'defeatLine', text: dialogue.defeatLine });
  if (dialogue.freedLine) entries.push({ path: 'freedLine', text: dialogue.freedLine });
  if (dialogue.rounds) {
    for (let i = 0; i < dialogue.rounds.length; i++) {
      const round = dialogue.rounds[i];
      if (round.npcLine) entries.push({ path: `rounds[${i}].npcLine`, text: round.npcLine });
      if (round.options) {
        for (let j = 0; j < round.options.length; j++) {
          if (round.options[j].text) {
            entries.push({ path: `rounds[${i}].options[${j}].text`, text: round.options[j].text });
          }
        }
      }
    }
  }
  return entries;
}

/**
 * Validate all Japanese text fields in a dialogue against the player's vocabulary.
 * Uses an injected checkFn to preserve the one-way dependency rule.
 *
 * @param {object} dialogue - The dialogue JSON object
 * @param {Function|null} checkFn - async (text) => { unknownWords: string[], count: number }
 *   Injected from vocab-repair.js's checkSentenceViolations with bound params.
 *   If null, validation is skipped (no JPDB API key available).
 * @returns {Array<{ path: string, text: string, unknowns: string[] }>} Violations (empty = clean)
 */
export async function validateDialogueVocab(dialogue, checkFn) {
  if (!checkFn) return [];

  const entries = extractDialogueStrings(dialogue);
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
export function buildRepairInstruction(violations) {
  const violationList = violations.map(v =>
    `- ${v.path}: unknown words [${v.unknowns.join(', ')}]`
  ).join('\n');

  return `The dialogue you generated contains words the player doesn't know yet.

Violations:
${violationList}

Rewrite the ENTIRE dialogue JSON fixing these violations.
Rules:
1. Replace unknown words with simpler alternatives from the vocabulary list in the system prompt.
2. Keep the same personality, mood, and meaning.
3. Keep the exact same JSON structure (greeting, defeatLine, freedLine, 3 rounds with 3 options each).
4. Each field may contain at most 1 word not in the vocabulary list.
5. Output ONLY valid JSON. No explanation, no markdown fences.`;
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
  maxAttempts = 3
}) {
  // No checker = skip validation (no JPDB API key)
  if (!checkViolationsFn) {
    return { dialogue, repaired: false, attempts: 0, violations: [] };
  }

  // Initial validation
  let violations = await validateDialogueVocab(dialogue, checkViolationsFn);
  if (violations.length === 0) {
    return { dialogue, repaired: false, attempts: 0, violations: [] };
  }

  logger.info(`[NpcDialogue] Vocab violations found in ${violations.length} fields, starting repair`);

  let currentDialogue = dialogue;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const repairInstruction = buildRepairInstruction(violations);

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
        purpose: 'npc-dialogue-repair'
      });

      // Parse and validate shape
      const parsed = parseDialogueJson(response);
      if (!parsed) {
        logger.warn(`[NpcDialogue] Repair attempt ${attempt}: failed to parse JSON`);
        continue;
      }

      const shapeCheck = validateDialogueShape(parsed);
      if (!shapeCheck.valid) {
        logger.warn(`[NpcDialogue] Repair attempt ${attempt}: invalid shape: ${shapeCheck.errors.join(', ')}`);
        continue;
      }

      // Re-validate vocab on repaired dialogue
      violations = await validateDialogueVocab(parsed, checkViolationsFn);
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
