import { buildVocabSection } from '../vocab-constraints.js';
import { activateEntries } from '../lorebook.js';

// ── Cache / memory prefixes ──────────────────────────────────────────
export const cachePrefix = 'npc-dialogue-cache';
export const memoryPrefix = 'npc-memory';
export const requiredCardFields = ['id', 'name', 'nameEn', 'personality', 'exampleDialogue', 'goals'];

// ── Valid tones for NPC dialogue options ─────────────────────────────
const VALID_TONES = new Set(['positive', 'neutral', 'negative']);

// ── Shape validation (extracted from generation.js) ──────────────────
/**
 * Validate that parsed JSON has the correct NPC dialogue shape.
 * Expects: greeting, defeatLine, freedLine, 3 rounds each with npcLine + 3 options.
 */
export function validateShape(obj) {
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

// ── String extraction (extracted from dialogue-repair.js) ────────────
/**
 * Extract all Japanese text fields from an NPC dialogue JSON object.
 * Returns array of { path: string, text: string } entries.
 * Standard NPC dialogue has 15 fields: greeting + defeatLine + freedLine +
 * 3 rounds x (npcLine + 3 option texts).
 */
export function extractStrings(dialogue) {
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

// ── Repair instruction (extracted from dialogue-repair.js) ───────────
/**
 * Build the repair instruction listing specific violations.
 * References the NPC-specific JSON structure.
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

// ── Prompt assembly (extracted from prompt-assembler.js) ─────────────
/**
 * Assemble a layered prompt for NPC dialogue generation.
 * Returns { systemBlocks, userPrompt }.
 */
export function assemblePrompt({
  characterCard,
  vocabWords,
  jlptLevel,
  memory,
  npcState,
  previousLines
}) {
  const card = characterCard;
  const state = npcState || 'possessed';

  // Layer 1: System instructions
  const systemInstructions = `You write dialogue for NPCs in a cyberpunk Japanese-learning RPG.
Each NPC has a distinct personality and remembers past encounters.
Output valid JSON matching the schema below.
The player is learning Japanese. Use ONLY words from their known vocabulary list, plus at most 1 unknown word per sentence.`;

  // Layer 2: Vocab constraints
  const vocabSection = buildVocabSection(vocabWords || [], jlptLevel || 'N4');

  // Layer 3: Character card
  const goal = card.goals?.[state] || card.goals?.possessed || '';
  const characterSection = `=== CHARACTER ===
Name: ${card.name} (${card.nameEn})
Personality: ${card.personality}
Quirk: ${card.quirk || ''}
Current state: ${state}
Current goal: ${goal}
Description: ${card.description || ''}

Example speech:
${(card.exampleDialogue || []).map(d => `- "${d}"`).join('\n')}`;

  // Layer 4: Lorebook entries
  let lorebookSection = '';
  const worldKeys = card.knowledge?.world || [];
  if (worldKeys.length > 0) {
    const entries = activateEntries(worldKeys);
    if (entries.length > 0) {
      lorebookSection = `\n=== WORLD KNOWLEDGE ===\n${entries.map(e => `- ${e.content}`).join('\n')}`;
    }
  }

  // Layer 5: NPC memory
  let memorySection = '';
  if (memory && memory.counters) {
    const log = memory.encounterLog || [];
    const logText = log.length > 0
      ? log.map((e, i) => `${i + 1}. [${e.outcome}] ${e.summary}`).join('\n')
      : 'No prior encounters.';

    memorySection = `\n=== RELATIONSHIP WITH THIS PLAYER ===
Encounters: ${memory.counters.encounters} | Bond: ${memory.bond >= 0 ? '+' : ''}${memory.bond} | Liberated: ${memory.flags?.liberated ? 'yes' : 'no'}

Encounter history:
${logText}

${memory.narrative ? `Relationship arc: "${memory.narrative}"` : ''}`;
  }

  // Layer 6: Anti-repetition
  let antiRepSection = '';
  if (previousLines && previousLines.length > 0) {
    antiRepSection = `\n=== PREVIOUSLY GENERATED LINES (avoid repeating) ===
${previousLines.map(l => `- "${l}"`).join('\n')}`;
  }

  // Build structured blocks (empty ones filtered out)
  const systemBlocks = [
    { label: 'instructions', text: systemInstructions, cache: true },
    { label: 'vocab', text: vocabSection, cache: true },
    { label: 'character', text: characterSection, cache: false },
    lorebookSection ? { label: 'lorebook', text: lorebookSection, cache: false } : null,
    memorySection ? { label: 'memory', text: memorySection, cache: false } : null,
    antiRepSection ? { label: 'antiRepeat', text: antiRepSection, cache: false } : null
  ].filter(Boolean);

  // Layer 7: Task (user prompt)
  const userPrompt = `Generate dialogue for this NPC's next encounter with this player.
Output JSON:
{
  "greeting": "one line, NPC greets the player before interaction",
  "defeatLine": "one line if the player loses to this NPC",
  "freedLine": "one line when the NPC is liberated from corruption",
  "rounds": [
    {
      "npcLine": "NPC speaks to the player",
      "options": [
        { "text": "player response option", "tone": "positive" },
        { "text": "player response option", "tone": "neutral" },
        { "text": "player response option", "tone": "negative" }
      ]
    }
  ]
}
Generate exactly 3 rounds. All text in Japanese using the player's vocabulary.
Output ONLY valid JSON. No explanation, no markdown fences.`;

  return { systemBlocks, userPrompt };
}

// ── Previous lines extraction (extracted from text-cache.js) ─────────
/**
 * Extract previously generated NPC lines from a cached dialogue object.
 * Used for anti-repetition in prompt assembly.
 */
export function getPreviousLines(cached) {
  if (!cached) return [];

  const lines = [];
  if (cached.greeting) lines.push(cached.greeting);
  if (cached.defeatLine) lines.push(cached.defeatLine);
  if (cached.freedLine) lines.push(cached.freedLine);
  if (cached.rounds) {
    for (const round of cached.rounds) {
      if (round.npcLine) lines.push(round.npcLine);
    }
  }
  return lines;
}

// ── Memory snapshot ──────────────────────────────────────────────────
/**
 * Extract the memory snapshot used for cache staleness checks.
 * Returns { encounters, bond, liberated } from a memory object.
 */
export function getMemorySnapshot(mem) {
  if (!mem) return {};
  return {
    encounters: mem.counters?.encounters || 0,
    bond: mem.bond || 0,
    liberated: !!mem.flags?.liberated
  };
}
