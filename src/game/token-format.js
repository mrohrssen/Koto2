/**
 * Universal token format for Japanese text rendering and vocabulary tracking.
 *
 * Every piece of Japanese shown to the player flows through this module:
 *   entityToToken   – game entity → universal token
 *   assembleFrame   – frame template + entities → ready-to-render tokens
 *   isEligible       – per-sentence i+1 gate
 *   scoreCandidate   – rank assembled candidates for selection
 *   selectBestFrame  – pick best eligible assembled candidate (optional tie randomization)
 */

/**
 * Convert a game entity (item, creature, move, NPC) to a universal token.
 * Entities use different field names; this normalises them.
 */
export function entityToToken(entity) {
  const surface = entity.word || entity.baseWord || entity.name;
  const reading = entity.reading || entity.baseReading;
  const meaning = entity.nameEn || entity.baseMeaning || entity.meaning;
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

const SENTENCE_ENDERS = '。！？!?';

/**
 * Per-sentence i+1 eligibility check.
 *
 * - Sentence without entity token: max 1 unknown content word
 * - Sentence with entity token:    max 2 unknown content words
 * - Sentence boundaries: 。！？!?
 * - Tokens without a `base` field are punctuation/particles (skipped)
 */
export function isEligible(tokens, knownWords) {
  let unknowns = 0;
  let hasEntity = false;
  for (const token of tokens) {
    if (!token.base) {
      if (SENTENCE_ENDERS.includes(token.surface)) {
        const max = hasEntity ? 2 : 1;
        if (unknowns > max) return false;
        unknowns = 0;
        hasEntity = false;
      }
      continue;
    }
    if (token.entity) hasEntity = true;
    if (!knownWords.has(token.base)) unknowns++;
  }
  const max = hasEntity ? 2 : 1;
  return unknowns <= max;
}

/**
 * Return a frame's tokens only when the frame passes the i+1 gate.
 * Used for singleton prompts such as skill-select and yes/no buttons.
 */
export function getEligibleFrameTokens(frame, knownWords) {
  if (!frame?.tokens?.length) return null;
  return isEligible(frame.tokens, knownWords) ? [...frame.tokens] : null;
}

/**
 * Score assembled tokens for candidate ranking.  Higher = better.
 * Priority: more unknowns → has entity → more content tokens.
 */
export function scoreCandidate(tokens, knownWords) {
  let unknowns = 0;
  let hasEntity = false;
  let contentCount = 0;
  for (const token of tokens) {
    if (!token.base) continue;
    contentCount++;
    if (token.entity) hasEntity = true;
    if (!knownWords.has(token.base)) unknowns++;
  }
  return unknowns * 1000 + (hasEntity ? 100 : 0) + contentCount;
}

/**
 * Choose the highest-scoring i+1-eligible candidate from an assembled pool.
 * Candidates must already have `.tokens` (e.g. from assembleFrame).
 *
 * @param {Array<{ tokens: Array }>} candidates
 * @param {Set<string>} knownWords
 * @param {{ randomizeTies?: boolean }} [options]
 * @returns {object|null} The winning candidate, or the first candidate if none are
 * eligible. Returns null only for an empty input list.
 */
export function selectBestFrame(candidates, knownWords, { randomizeTies = false } = {}) {
  if (!candidates.length) return null;
  const eligible = candidates.filter(c => isEligible(c.tokens, knownWords));
  if (eligible.length === 0) return candidates[0];

  if (randomizeTies) {
    const scored = eligible.map(c => ({
      c,
      score: scoreCandidate(c.tokens, knownWords),
    }));
    const bestScore = Math.max(...scored.map(s => s.score));
    const topTier = scored.filter(s => s.score === bestScore);
    return topTier[Math.floor(Math.random() * topTier.length)].c;
  }

  eligible.sort(
    (a, b) => scoreCandidate(b.tokens, knownWords) - scoreCandidate(a.tokens, knownWords)
  );
  return eligible[0];
}
