/**
 * Universal token format for Japanese text rendering and vocabulary tracking.
 *
 * Every piece of Japanese shown to the player flows through this module:
 *   entityToToken   – game entity → universal token
 *   assembleFrame   – frame template + entities → ready-to-render tokens
 *   isEligible      – per-sentence i+1 gate
 *   scoreCandidate  – rank assembled candidates for selection
 */

/**
 * Convert a game entity (item, creature, move, NPC) to a universal token.
 * Entities use different field names; this normalises them.
 */
export function entityToToken(entity) {
  const surface = entity.word || entity.baseWord || entity.name;
  const reading = entity.reading || entity.baseReading;
  const meaning = entity.nameEn || entity.baseMeaning;
  return { surface, base: surface, reading, meaning, entity: true };
}

/**
 * Splice entity tokens into a frame template's slot positions and merge
 * the entity base forms into the word list.  Never mutates the original frame.
 */
export function assembleFrame(frame, entities) {
  const tokens = [];
  const extraWords = [];
  for (const token of frame.tokens) {
    if (token.slot && entities[token.slot]) {
      const entityToken = entityToToken(entities[token.slot]);
      tokens.push(entityToken);
      extraWords.push(entityToken.base);
    } else if (token.slot) {
      continue;
    } else {
      tokens.push(token);
    }
  }
  return { tokens, words: [...frame.words, ...extraWords] };
}
