/**
 * Gate 2 — AI Vision Judge (library)
 *
 * Testable functions for building prompts, parsing AI responses,
 * and generating critique feedback for the sprite quality pipeline.
 *
 * Used by sprite-gate2.mjs (CLI) and tested by tests/unit/sprites/gate2.test.js.
 */

// ---------------------------------------------------------------------------
// Minimum passing score per criterion (exported for callers)
// ---------------------------------------------------------------------------

export const MIN_SCORE = 3;

// ---------------------------------------------------------------------------
// Score validation helper
// ---------------------------------------------------------------------------

function clampScore(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.min(5, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Target display sizes by sprite type
// ---------------------------------------------------------------------------

const TARGET_SIZE = {
  action: '128×128 pixels on a mobile screen',
  item: '128×128 pixels on a mobile screen',
  creature: '1024×1024 full character art',
  boss: '1024×1024 full character art',
  npc: '1024×1024 full character art',
  background: '1536×1024 landscape scene',
};

// ---------------------------------------------------------------------------
// buildJudgePrompt
// ---------------------------------------------------------------------------

/**
 * Build a prompt for the AI vision judge to evaluate a sprite candidate.
 *
 * @param {Object} opts
 * @param {string} opts.type - Sprite type: action, item, creature, boss, npc, background
 * @param {string} opts.wordEn - English word/name for the sprite
 * @param {string} opts.word - Japanese word/name for the sprite
 * @returns {string} The judge prompt text
 */
export function buildJudgePrompt({ type, wordEn, word }) {
  const lines = [];

  lines.push('You are a quality judge for game sprites. Evaluate this image on 3 criteria, each scored 1-5.');
  lines.push('Respond with JSON only, no other text.');
  lines.push('');
  lines.push('Response format: { "concept": <1-5>, "style": <1-5>, "readability": <1-5>, "reasoning": "<sentence>" }');
  lines.push('');

  // Criterion 1: Concept clarity (varies by type)
  lines.push('## Criterion 1: Concept (1-5)');
  if (type === 'action' || type === 'item') {
    lines.push(
      `You are helping a language learner who does NOT know the word '${wordEn}'. ` +
      `They will see only this icon and the word '${word}' in a foreign script they are learning. ` +
      `Can they guess the meaning from the icon alone?`
    );
  } else if (type === 'creature' || type === 'boss' || type === 'npc') {
    lines.push('Does this look like a distinct, memorable creature/character?');
  } else if (type === 'background') {
    lines.push(`Does this look like the described environment '${wordEn}'?`);
  }
  lines.push('');

  // Criterion 2: Style consistency
  lines.push('## Criterion 2: Style (1-5)');
  lines.push('Compare against the reference images provided. Does the art style match consistently?');
  lines.push('');

  // Criterion 3: Readability at target size
  const displaySize = TARGET_SIZE[type] || TARGET_SIZE.action;
  lines.push('## Criterion 3: Readability (1-5)');
  lines.push(`Will this be readable and clear at its target display size of ${displaySize}?`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// parseJudgeResponse
// ---------------------------------------------------------------------------

/**
 * Parse the AI judge's JSON response text into a structured result.
 *
 * Handles:
 * - Clean JSON strings
 * - JSON wrapped in markdown code blocks (```json ... ```)
 * - Extracts JSON object with regex as a fallback
 *
 * @param {string} responseText - Raw text from the AI model
 * @returns {Object} Parsed result with concept, style, readability, total, passed, reasoning
 */
export function parseJudgeResponse(responseText) {
  // Try to extract JSON — handle markdown code blocks and raw JSON
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not extract JSON from response: ${responseText.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);

  const concept = clampScore(parsed.concept);
  const style = clampScore(parsed.style);
  const readability = clampScore(parsed.readability);
  const total = concept + style + readability;
  const passed = concept >= MIN_SCORE && style >= MIN_SCORE && readability >= MIN_SCORE;
  const reasoning = parsed.reasoning || '';

  return { concept, style, readability, total, passed, reasoning };
}

// ---------------------------------------------------------------------------
// buildCritiqueFeedback
// ---------------------------------------------------------------------------

/**
 * Build regeneration feedback when all candidates fail.
 * Provides specific critique based on which scores were low.
 *
 * @param {Object} bestResult - The highest-scoring (but still failing) result
 * @param {string} wordEn - English word for the sprite
 * @returns {string} Feedback string for the regeneration prompt
 */
export function buildCritiqueFeedback(bestResult, wordEn) {
  const parts = [];

  if (bestResult.concept < MIN_SCORE) {
    parts.push(
      `Previous attempt was not recognizable as '${wordEn}'. Make the visual concept much more literal and obvious.`
    );
  }

  if (bestResult.style < MIN_SCORE) {
    parts.push(
      'Previous attempt did not match the art style. Study the reference images more carefully and match their rendering style, color palette, and level of detail.'
    );
  }

  if (bestResult.readability < MIN_SCORE) {
    parts.push(
      'Previous attempt was unreadable at display size. Simplify the design, increase contrast, and ensure key details are visible.'
    );
  }

  return parts.join(' ');
}
