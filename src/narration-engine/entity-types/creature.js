import { buildVocabSection } from '../vocab-constraints.js';

export const cachePrefix = 'creature-dialogue-cache';
export const memoryPrefix = 'creature-memory';
export const requiredCardFields = ['id', 'name', 'nameEn', 'personality'];

const EXPECTED_ROUNDS = 3;
const OPTIONS_PER_ROUND = 3;

/**
 * Validate the shape of a befriend dialogue object.
 * Must have exactly 3 rounds, each with speaker (string),
 * options (array of 3 strings), and correctIndex (0-2).
 */
export function validateShape(obj) {
  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['dialogue must be a non-null object'] };
  }

  if (!Array.isArray(obj.rounds)) {
    return { valid: false, errors: ['missing rounds array'] };
  }

  if (obj.rounds.length !== EXPECTED_ROUNDS) {
    return { valid: false, errors: [`expected ${EXPECTED_ROUNDS} rounds, got ${obj.rounds.length}`] };
  }

  const errors = [];
  for (let i = 0; i < obj.rounds.length; i++) {
    const round = obj.rounds[i];
    if (!round || typeof round !== 'object') {
      errors.push(`rounds[${i}] must be an object`);
      continue;
    }
    if (typeof round.speaker !== 'string' || round.speaker.length === 0) {
      errors.push(`rounds[${i}].speaker must be a non-empty string`);
    }
    if (!Array.isArray(round.options) || round.options.length !== OPTIONS_PER_ROUND) {
      errors.push(`rounds[${i}].options must be an array of ${OPTIONS_PER_ROUND} strings`);
    } else {
      for (let j = 0; j < round.options.length; j++) {
        if (typeof round.options[j] !== 'string' || round.options[j].length === 0) {
          errors.push(`rounds[${i}].options[${j}] must be a non-empty string`);
        }
      }
    }
    if (!Number.isInteger(round.correctIndex) || round.correctIndex < 0 || round.correctIndex >= OPTIONS_PER_ROUND) {
      errors.push(`rounds[${i}].correctIndex must be an integer 0-${OPTIONS_PER_ROUND - 1}`);
    }
  }

  return errors.length === 0
    ? { valid: true, errors: [] }
    : { valid: false, errors };
}

/**
 * Extract all Japanese strings from a befriend dialogue for vocab validation.
 * Returns array of { path, text } for each speaker and option.
 */
export function extractStrings(dialogue) {
  const entries = [];
  if (!dialogue?.rounds) return entries;

  for (let i = 0; i < dialogue.rounds.length; i++) {
    const round = dialogue.rounds[i];
    entries.push({ path: `rounds[${i}].speaker`, text: round.speaker });
    if (Array.isArray(round.options)) {
      for (let j = 0; j < round.options.length; j++) {
        entries.push({ path: `rounds[${i}].options[${j}]`, text: round.options[j] });
      }
    }
  }

  return entries;
}

/**
 * Build a repair instruction for the AI, listing vocab violations
 * and reminding it of the befriend dialogue JSON schema.
 */
export function buildRepairInstruction(violations) {
  const violationLines = violations.map(v =>
    `- ${v.path}: "${v.text}" contains unknown word(s): ${v.unknowns.join(', ')}`
  ).join('\n');

  return `The following strings violate the vocab constraint (i+1 rule):
${violationLines}

Replace only the violating strings with alternatives that use words from the allowed vocab list.
Keep the same JSON structure: each round must have speaker (string), options (array of 3 strings), and correctIndex (integer 0-2).
The correctIndex must still point to the contextually appropriate response.
Return the complete corrected JSON.`;
}

/**
 * Assemble the prompt layers for generating a befriend dialogue.
 *
 * Layers:
 * 1. instructions — i+1 rules for creature befriend dialogue
 * 2. vocab — allowed word list via buildVocabSection
 * 3. character — creature identity and personality
 * 4. memory — befriend attempt history (if any)
 * 5. anti-repetition — previous speaker lines to avoid
 *
 * No lorebook layer (creatures don't have lorebook entries).
 */
export function assemblePrompt({ characterCard, vocabWords, jlptLevel, memory, previousLines }) {
  const systemBlocks = [];

  // Layer 1: Instructions
  systemBlocks.push({
    label: 'instructions',
    text: `You are generating a befriend dialogue for a wild creature encounter in a Japanese language learning RPG.

The player is trying to befriend this creature by choosing the correct response in a 3-round quiz.

CRITICAL RULES (i+1 comprehensible input):
- You MUST only use words from the player's vocabulary list below, plus at most 1 unknown word per sentence.
- Every Japanese string (speaker lines and options) must follow this rule.
- If you cannot express something with the allowed vocabulary, simplify the sentence.
- The "correct" option for each round should be a natural, contextually appropriate response to the creature's speaker line.
- The 2 incorrect options should be grammatically valid Japanese but contextually wrong (off-topic or nonsensical as a reply).`
  });

  // Layer 2: Vocab constraints
  systemBlocks.push({
    label: 'vocab',
    text: buildVocabSection(vocabWords, jlptLevel)
  });

  // Layer 3: Character
  const charParts = [`Creature: ${characterCard.name} (${characterCard.nameEn || characterCard.name})`];
  if (characterCard.element) charParts.push(`Element: ${characterCard.element}`);
  if (characterCard.personality) charParts.push(`Personality: ${characterCard.personality}`);
  if (characterCard.quirk) charParts.push(`Quirk: ${characterCard.quirk}`);
  if (characterCard.archetype) charParts.push(`Archetype: ${characterCard.archetype}`);
  if (characterCard.exampleDialogue?.length) {
    charParts.push(`Example lines:\n${characterCard.exampleDialogue.map(l => `  - ${l}`).join('\n')}`);
  }
  systemBlocks.push({
    label: 'character',
    text: charParts.join('\n')
  });

  // Layer 4: Memory (optional)
  if (memory) {
    const snap = getMemorySnapshot(memory);
    const memParts = [];
    if (snap.befriendAttempts > 0) {
      memParts.push(`Previous befriend attempts: ${snap.befriendAttempts}`);
    }
    if (snap.befriended) {
      memParts.push('This creature has been befriended before.');
    }
    if (memParts.length > 0) {
      systemBlocks.push({
        label: 'memory',
        text: memParts.join('\n')
      });
    }
  }

  // Layer 5: Anti-repetition (optional)
  if (previousLines?.length > 0) {
    systemBlocks.push({
      label: 'anti-repetition',
      text: `Avoid repeating these speaker lines from previous encounters:\n${previousLines.map(l => `  - ${l}`).join('\n')}`
    });
  }

  // User prompt with JSON schema example
  const userPrompt = `Generate a 3-round befriend dialogue for ${characterCard.name}.

Return ONLY valid JSON matching this schema:
{
  "rounds": [
    {
      "speaker": "<creature's Japanese line>",
      "options": ["<correct response>", "<wrong response>", "<wrong response>"],
      "correctIndex": 0
    },
    {
      "speaker": "<creature's Japanese line>",
      "options": ["<wrong response>", "<correct response>", "<wrong response>"],
      "correctIndex": 1
    },
    {
      "speaker": "<creature's Japanese line>",
      "options": ["<wrong response>", "<wrong response>", "<correct response>"],
      "correctIndex": 2
    }
  ]
}

Rules:
- Exactly 3 rounds
- Each round has: speaker (string), options (array of 3 strings), correctIndex (integer 0-2)
- correctIndex indicates which option is the contextually appropriate response
- Vary the correctIndex position across rounds (don't always use the same index)
- The creature's speaker lines should reflect its personality
- All Japanese text must follow the vocab constraints`;

  return { systemBlocks, userPrompt };
}

/**
 * Extract previous speaker lines from a cached befriend dialogue
 * for anti-repetition in subsequent generations.
 */
export function getPreviousLines(cached) {
  if (!cached?.rounds) return [];
  return cached.rounds.map(r => r.speaker);
}

/**
 * Extract a memory snapshot relevant to creature befriend dialogue.
 * Returns { befriendAttempts, befriended } with safe defaults.
 */
export function getMemorySnapshot(mem) {
  if (!mem || typeof mem !== 'object') {
    return { befriendAttempts: 0, befriended: false };
  }
  return {
    befriendAttempts: mem.counters?.befriendAttempts ?? 0,
    befriended: mem.flags?.befriended ?? false
  };
}
