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
