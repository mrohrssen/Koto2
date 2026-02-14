import { buildVocabSection } from './vocab-constraints.js';
import { activateEntries } from './lorebook.js';

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

/**
 * Flatten structured blocks into a single string for non-Claude providers.
 */
export function flattenSystemBlocks(blocks) {
  if (!blocks || blocks.length === 0) return '';
  return blocks.map(b => b.text).join('\n\n');
}
